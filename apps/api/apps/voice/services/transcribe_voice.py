import logging
from uuid import UUID

from django.conf import settings
from django.db import transaction

from apps.ai.domain.ports import (
    AIQuotaClient,
    AIQuotaError,
    SpeechToTextError,
    SpeechToTextProvider,
    SpeechToTextTimeout,
    SpeechToTextUnavailable,
)
from apps.ai.router import get_speech_to_text_provider
from apps.voice.models import VoiceSession

from .audio_upload import cleanup_session_audio, get_session_audio_path

logger = logging.getLogger(__name__)


class RetryableTranscriptionError(RuntimeError):
    """A provider failure that can be retried without losing the temporary audio."""


def process_voice_session(
    session_id: str,
    *,
    provider: SpeechToTextProvider | None = None,
    quota: AIQuotaClient | None = None,
) -> VoiceSession | None:
    normalized_id = UUID(str(session_id))
    session = _start_transcription(normalized_id)
    if session is None:
        return None

    audio_path = get_session_audio_path(normalized_id)
    if audio_path is None:
        return _fail_with_cleanup(normalized_id, "audio_missing")

    quota_validated = bool(session.quota_validated)
    try:
        selected_provider = provider or get_speech_to_text_provider()
        if quota is not None and not quota_validated:
            quota.validate(request_id=normalized_id, action="voice_transcription")
            quota_validated = True
            VoiceSession.objects.filter(pk=normalized_id).update(quota_validated=True)
        result = selected_provider.transcribe(audio_path)
    except (SpeechToTextTimeout, SpeechToTextUnavailable) as exc:
        _restore_uploaded(normalized_id)
        raise RetryableTranscriptionError from exc
    except SpeechToTextError:
        return _fail_with_quota(normalized_id, "provider_error", quota)
    except Exception:
        logger.error("voice_transcription_failed", extra={"voice_session_id": str(normalized_id)})
        return _fail_with_quota(normalized_id, "processing_error", quota)

    transcript = result.transcript.strip()
    if not transcript:
        return _fail_with_quota(normalized_id, "empty_transcript", quota)
    if len(transcript) > settings.AI_MAX_TRANSCRIPT_CHARS:
        return _fail_with_quota(normalized_id, "transcript_too_large", quota)

    if not cleanup_session_audio(normalized_id):
        return _fail_with_quota(normalized_id, "audio_cleanup_failed", quota, cleanup=False)

    metadata: dict[str, object] = {
        "provider": type(selected_provider).__name__,
        "duration_seconds": result.duration_seconds,
    }
    metadata.update(_safe_provider_metadata(result.provider_metadata))
    with transaction.atomic():
        current = VoiceSession.objects.select_for_update().get(pk=normalized_id)
        current.status = VoiceSession.Status.TRANSCRIBED
        current.transcript = transcript
        current.provider_metadata = metadata
        current.error_code = ""
        current.quota_validated = False
        current.save(
            update_fields=[
                "status",
                "transcript",
                "provider_metadata",
                "error_code",
                "quota_validated",
                "updated_at",
            ]
        )
    if quota is not None and quota_validated:
        try:
            quota.complete(
                request_id=normalized_id,
                metadata={"provider": type(selected_provider).__name__},
                processing_time_ms=None,
            )
        except AIQuotaError:
            return _fail_with_quota(normalized_id, "quota_callback_failed", quota)
    return current


def fail_voice_session_after_retry(
    session_id: str, *, quota: AIQuotaClient | None = None
) -> VoiceSession | None:
    return _fail_with_quota(UUID(str(session_id)), "provider_timeout", quota)


def _start_transcription(session_id: UUID) -> VoiceSession | None:
    with transaction.atomic():
        try:
            session = VoiceSession.objects.select_for_update().get(pk=session_id)
        except VoiceSession.DoesNotExist:
            return None
        if session.status in {VoiceSession.Status.TRANSCRIBED, VoiceSession.Status.FAILED}:
            return None
        session.status = VoiceSession.Status.TRANSCRIBING
        session.error_code = ""
        session.save(update_fields=["status", "error_code", "updated_at"])
        return session


def _restore_uploaded(session_id: UUID) -> None:
    VoiceSession.objects.filter(pk=session_id, status=VoiceSession.Status.TRANSCRIBING).update(
        status=VoiceSession.Status.UPLOADED,
    )


def _fail_with_cleanup(
    session_id: UUID, error_code: str, *, cleanup: bool = True
) -> VoiceSession | None:
    cleanup_ok = cleanup_session_audio(session_id) if cleanup else True
    final_code = error_code if cleanup_ok else "audio_cleanup_failed"
    with transaction.atomic():
        try:
            session = VoiceSession.objects.select_for_update().get(pk=session_id)
        except VoiceSession.DoesNotExist:
            return None
        session.status = VoiceSession.Status.FAILED
        session.transcript = ""
        session.quota_validated = False
        session.error_code = final_code
        session.save(
            update_fields=[
                "status",
                "transcript",
                "quota_validated",
                "error_code",
                "updated_at",
            ]
        )
        return session


def _fail_with_quota(
    session_id: UUID,
    error_code: str,
    quota: AIQuotaClient | None,
    *,
    cleanup: bool = True,
) -> VoiceSession | None:
    should_fail_quota = bool(
        VoiceSession.objects.filter(pk=session_id).values_list("quota_validated", flat=True).first()
    )
    session = _fail_with_cleanup(session_id, error_code, cleanup=cleanup)
    if quota is not None and should_fail_quota:
        try:
            quota.fail(request_id=session_id, error_code=_quota_error_code(error_code))
        except AIQuotaError:
            logger.error(
                "voice_quota_callback_failed",
                extra={"voice_session_id": str(session_id), "error_code": "quota_callback_failed"},
            )
    return session


def _quota_error_code(error_code: str) -> str:
    return "before_processing" if error_code == "quota_callback_failed" else error_code


def _safe_provider_metadata(metadata: dict[str, object]) -> dict[str, object]:
    return {
        key: value
        for key, value in metadata.items()
        if isinstance(key, str)
            and isinstance(value, bool | int | float | str)
        and key != "transcript"
    }
