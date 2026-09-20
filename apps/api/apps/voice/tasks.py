from celery import shared_task
from django.conf import settings

from apps.ai.router import get_ai_quota_client

from .services.transcribe_voice import (
    RetryableTranscriptionError,
    fail_voice_session_after_retry,
    process_voice_session,
)


@shared_task(bind=True, max_retries=settings.AI_STT_TASK_MAX_RETRIES, acks_late=True)
def transcribe_voice_session(self, session_id: str):
    quota = get_ai_quota_client()
    try:
        session = process_voice_session(session_id, quota=quota)
    except RetryableTranscriptionError as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(countdown=2 ** (self.request.retries + 1), exc=exc) from exc
        session = fail_voice_session_after_retry(session_id, quota=quota)
    return str(session.id) if session is not None else None
