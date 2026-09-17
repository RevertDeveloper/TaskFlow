from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser

from apps.authentication.domain.models import AuthenticatedPrincipal
from apps.common.api import TaskFlowAPIView, success_response

from .models import VoiceSession
from .permissions import CanAccessVoice
from .selectors import get_owned_voice_session
from .serializers import VoiceSessionOutputSerializer, VoiceUploadSerializer
from .services.audio_upload import AudioValidationError, cleanup_session_audio, store_uploaded_audio
from .tasks import transcribe_voice_session


class VoiceQueueUnavailable(APIException):
    status_code = 503
    default_detail = "El procesamiento de audio no está disponible temporalmente."
    default_code = "voice_queue_unavailable"


class VoiceSessionCollectionView(TaskFlowAPIView):
    permission_classes = (CanAccessVoice,)
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(
        operation_id="voice_session_upload",
        request=VoiceUploadSerializer,
        responses={202: VoiceSessionOutputSerializer},
    )
    def post(self, request):  # type: ignore[no-untyped-def]
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
        try:
            transcribe_voice_session.delay(str(session.id))
        except Exception as exc:
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
    def get(self, request, session_id: str):  # type: ignore[no-untyped-def]
        session = get_owned_voice_session(_external_user_id(request), session_id)
        return success_response(VoiceSessionOutputSerializer(session).data)


def _external_user_id(request) -> int:  # type: ignore[no-untyped-def]
    principal = request.user
    if not isinstance(principal, AuthenticatedPrincipal):
        raise ValidationError("La identidad de Accounts no está disponible.")
    return principal.external_user_id
