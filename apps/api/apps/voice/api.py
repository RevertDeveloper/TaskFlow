from uuid import UUID

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser

from apps.ai.domain.ports import (
    AIQuotaClient,
    AIQuotaError,
    AIQuotaRejected,
    AIQuotaUnavailable,
    TaskExtractionError,
)
from apps.ai.router import get_ai_quota_client
from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.common.api import TaskFlowAPIView, error_response, success_response
from apps.tasks.serializers import TaskOutputSerializer

from .models import VoiceReviewDraft, VoiceSession
from .permissions import CanAccessVoice
from .selectors import get_owned_voice_session
from .serializers import VoiceSessionOutputSerializer, VoiceUploadSerializer
from .serializers_review import (
    VoiceReviewConfirmSerializer,
    VoiceReviewDraftOutputSerializer,
    VoiceReviewRequestSerializer,
)
from .services.audio_upload import AudioValidationError, cleanup_session_audio, store_uploaded_audio
from .services.review import confirm_voice_tasks, create_review_draft
from .tasks import transcribe_voice_session


class VoiceQueueUnavailable(APIException):
    status_code = 503
    default_detail = "El procesamiento de audio no está disponible temporalmente."
    default_code = "voice_queue_unavailable"


class VoiceSessionCollectionView(TaskFlowAPIView):
    permission_classes = (CanAccessVoice,)
    parser_classes = (MultiPartParser, FormParser)
    throttle_scope = "voice_upload"

    @extend_schema(
        operation_id="voice_session_upload",
        request=VoiceUploadSerializer,
        responses={202: VoiceSessionOutputSerializer},
    )
    def post(self, request):
        serializer = VoiceUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = _external_user_id(request)
        session = VoiceSession.objects.create(
            external_user_id=user_id,
            status=VoiceSession.Status.RECORDING,
            transcript_retention=serializer.validated_data["transcript_retention"],
        )
        try:
            uploaded = store_uploaded_audio(serializer.validated_data["audio"], session.id)
        except AudioValidationError as exc:
            session.status = VoiceSession.Status.FAILED
            session.error_code = exc.code
            session.save(update_fields=["status", "error_code", "updated_at"])
            raise ValidationError({exc.code: exc.message}) from exc

        session.status = VoiceSession.Status.UPLOADED
        session.provider_metadata = {
            "content_type": uploaded.content_type,
            "size_bytes": uploaded.size_bytes,
            "duration_seconds": uploaded.duration_seconds,
        }
        session.save(update_fields=["status", "provider_metadata", "updated_at"])
        quota = get_ai_quota_client()
        try:
            quota.reserve(
                request_headers=request.headers,
                action="voice_transcription",
                request_id=session.id,
            )
        except AIQuotaRejected as exc:
            return _fail_upload_for_quota(session, exc.code, status_code=429)
        except AIQuotaUnavailable as exc:
            return _fail_upload_for_quota(session, exc.code, status_code=503)
        try:
            transcribe_voice_session.delay(str(session.id))
        except Exception as exc:
            _refund_queued_reservation(quota, session.id)
            cleanup_ok = cleanup_session_audio(session.id)
            session.status = VoiceSession.Status.FAILED
            session.error_code = "queue_unavailable" if cleanup_ok else "audio_cleanup_failed"
            session.save(update_fields=["status", "error_code", "updated_at"])
            raise VoiceQueueUnavailable() from exc
        return success_response(VoiceSessionOutputSerializer(session).data, status_code=202)


class VoiceSessionDetailView(TaskFlowAPIView):
    permission_classes = (CanAccessVoice,)

    @extend_schema(
        operation_id="voice_session_retrieve",
        responses={200: VoiceSessionOutputSerializer},
    )
    def get(self, request, session_id: str):
        session = get_owned_voice_session(_external_user_id(request), session_id)
        return success_response(VoiceSessionOutputSerializer(session).data)


class VoiceReviewView(TaskFlowAPIView):
    permission_classes = (CanAccessVoice,)

    @extend_schema(
        operation_id="voice_review_create",
        request=VoiceReviewRequestSerializer,
        responses={201: VoiceReviewDraftOutputSerializer},
    )
    def post(self, request, session_id: str):
        session_uuid = _parse_uuid(session_id)
        serializer = VoiceReviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            draft = create_review_draft(
                _external_user_id(request),
                session_uuid,
                current_list_id=serializer.validated_data.get("current_list_id"),
                request_headers=request.headers,
                quota=get_ai_quota_client(),
            )
        except (AIQuotaRejected, AIQuotaUnavailable) as exc:
            return error_response(
                exc.code,
                "La operación de IA no está disponible.",
                status_code=429 if isinstance(exc, AIQuotaRejected) else 503,
            )
        except AIQuotaError as exc:
            return error_response(
                exc.code,
                "La operación de IA no está disponible.",
                status_code=503,
            )
        except TaskExtractionError as exc:
            return error_response(
                _safe_ai_error_code(exc),
                "No se pudo preparar la revisión de voz.",
                status_code=503,
            )
        return success_response(
            VoiceReviewDraftOutputSerializer(draft).data,
            status_code=201,
        )

    @extend_schema(
        operation_id="voice_review_retrieve",
        responses={200: VoiceReviewDraftOutputSerializer},
    )
    def get(self, request, session_id: str):
        session = get_owned_voice_session(_external_user_id(request), session_id)
        try:
            draft = session.review_draft
        except VoiceReviewDraft.DoesNotExist as exc:
            raise ValidationError(
                {"draft": "La sesión todavía no tiene un borrador de revisión."}
            ) from exc
        if draft.status == draft.Status.DRAFT and draft.expires_at <= timezone.now():
            return error_response(
                "draft_expired",
                "El borrador de voz ha caducado.",
                status_code=410,
            )
        return success_response(VoiceReviewDraftOutputSerializer(draft).data)


class VoiceReviewConfirmView(TaskFlowAPIView):
    permission_classes = (CanAccessVoice,)

    @extend_schema(
        operation_id="voice_review_confirm",
        request=VoiceReviewConfirmSerializer,
        responses={201: VoiceReviewDraftOutputSerializer},
    )
    def post(self, request, draft_id: str):
        serializer = VoiceReviewConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = confirm_voice_tasks(
            _external_user_id(request),
            _parse_uuid(draft_id),
            idempotency_key=serializer.validated_data["idempotency_key"],
            tasks=serializer.validated_data["tasks"],
        )
        return success_response(
            {
                "draft": VoiceReviewDraftOutputSerializer(result.draft).data,
                "tasks": TaskOutputSerializer(result.tasks, many=True).data,
            },
            status_code=201,
        )


def _external_user_id(request) -> int:
    principal = request.user
    if not isinstance(principal, AuthenticatedPrincipal):
        raise ValidationError("La identidad de Accounts no está disponible.")
    return principal.external_user_id


def _parse_uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise ValidationError({"id": "Debe ser un UUID válido."}) from exc


def _safe_ai_error_code(error: TaskExtractionError) -> str:
    code = getattr(error, "code", "provider_error")
    return code if code.isidentifier() and len(code) <= 64 else "provider_error"


def _fail_upload_for_quota(session: VoiceSession, code: str, *, status_code: int):
    cleanup_ok = cleanup_session_audio(session.id)
    session.status = VoiceSession.Status.FAILED
    session.error_code = code if cleanup_ok else "audio_cleanup_failed"
    session.save(update_fields=["status", "error_code", "updated_at"])
    return error_response(
        code,
        "La operación de IA no está disponible.",
        status_code=status_code,
    )


def _refund_queued_reservation(quota: AIQuotaClient, request_id: UUID) -> None:
    try:
        quota.validate(request_id=request_id, action="voice_transcription")
        quota.fail(request_id=request_id, error_code="before_processing")
    except AIQuotaError:
        return
