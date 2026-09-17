import json
from pathlib import Path
from uuid import uuid4

import pytest
from django.test import override_settings

from apps.ai.domain.ports import (
    AIQuotaConfigurationError,
    AIQuotaRejected,
    SpeechToTextResult,
    SpeechToTextTimeout,
)
from apps.ai.infrastructure.accounts_quota import (
    AccountsQuotaClient,
    AccountsQuotaResponse,
    FakeQuotaClient,
)
from apps.ai.providers.fake import FakeTaskExtractionProvider
from apps.ai.services.prompts import AvailableList
from apps.ai.services.task_extraction import TaskExtractionValidationError, extract_tasks
from apps.voice.models import VoiceSession
from apps.voice.services.audio_upload import store_uploaded_audio
from apps.voice.services.transcribe_voice import RetryableTranscriptionError, process_voice_session
from tests.test_voice_infrastructure import wav_upload

pytestmark = pytest.mark.django_db


def response(payload: object, *, status_code: int = 200, headers=None) -> AccountsQuotaResponse:
    return AccountsQuotaResponse(
        status_code=status_code,
        body=json.dumps(payload).encode(),
        headers=headers,
    )


def test_accounts_quota_client_keeps_user_and_service_auth_boundaries_separate() -> None:
    calls: list[tuple[str, str, dict[str, str], bytes | None]] = []

    def transport(method, url, headers, body, timeout):  # type: ignore[no-untyped-def]
        calls.append((method, url, dict(headers), body))
        if method == "GET":
            return response(
                {"detail": "CSRF cookie set"},
                headers={"Set-Cookie": "csrftoken=csrf-value; Path=/"},
            )
        if url.endswith("/usage/reserve/"):
            return response({"authorized": True, "request_id": str(request_id)})
        if url.endswith("/internal/usage/validate/"):
            return response(
                {
                    "valid": True,
                    "request_id": str(request_id),
                    "application": "taskflow",
                    "action": "voice_transcription",
                }
            )
        return response({"status": "ok"})

    request_id = uuid4()
    client = AccountsQuotaClient(
        base_url="https://accounts.example",
        application_slug="taskflow",
        service_key="server-secret",
        transport=transport,
    )
    client.reserve(
        request_headers={"Cookie": "sessionid=user-session"},
        action="voice_transcription",
        request_id=request_id,
    )
    client.validate(request_id=request_id, action="voice_transcription")
    client.complete(
        request_id=request_id,
        metadata={"transcript": "secret", "provider": "fake"},
        processing_time_ms=10,
    )

    reserve_call = calls[1]
    validate_call = calls[2]
    assert reserve_call[2]["Cookie"] == "sessionid=user-session; csrftoken=csrf-value"
    assert "X-Service-Key" not in reserve_call[2]
    assert validate_call[2]["X-Application-Slug"] == "taskflow"
    assert validate_call[2]["X-Service-Key"] == "server-secret"
    assert b"transcript" not in calls[3][3]


def test_accounts_quota_client_fails_closed_when_service_key_is_missing() -> None:
    client = AccountsQuotaClient(
        base_url="https://accounts.example",
        application_slug="taskflow",
        service_key="",
        transport=lambda *args: response({"valid": True}),
    )

    with pytest.raises(AIQuotaConfigurationError, match="service_key_missing"):
        client.validate(request_id=uuid4(), action="voice_transcription")


def test_fake_quota_callbacks_are_idempotent_and_reject_reuse() -> None:
    client = FakeQuotaClient()
    request_id = uuid4()
    client.reserve(request_headers={}, action="voice_task_extraction", request_id=request_id)
    client.validate(request_id=request_id, action="voice_task_extraction")
    client.complete(request_id=request_id)
    client.complete(request_id=request_id)

    with pytest.raises(AIQuotaRejected, match="request_already_used"):
        client.reserve(
            request_headers={}, action="voice_task_extraction", request_id=request_id
        )


def test_task_extraction_completes_or_fails_the_same_quota_request() -> None:
    quota = FakeQuotaClient()
    request_id = uuid4()
    result = extract_tasks(
        transcript="Comprar leche",
        available_lists=[AvailableList(uuid4(), "Casa")],
        current_list_id=None,
        provider=FakeTaskExtractionProvider(),
        quota=quota,
        request_headers={"Cookie": "session"},
        request_id=request_id,
    )
    assert len(result.tasks) == 1
    assert request_id in quota.completed

    failed_quota = FakeQuotaClient()
    failed_id = uuid4()
    with override_settings(AI_LLM_MAX_RETRIES=0):
        with pytest.raises(TaskExtractionValidationError):
            extract_tasks(
                transcript="Comprar leche",
                available_lists=[],
                current_list_id=None,
                provider=FakeTaskExtractionProvider(response="not json"),
                quota=failed_quota,
                request_headers={"Cookie": "session"},
                request_id=failed_id,
            )
    assert failed_quota.failed[failed_id] == "malformed_json"


def test_voice_retry_does_not_validate_the_same_reservation_twice(tmp_path: Path) -> None:
    session = VoiceSession.objects.create(external_user_id=101)
    quota = FakeQuotaClient()
    quota.reserve(request_headers={}, action="voice_transcription", request_id=session.id)

    class TimeoutProvider:
        def transcribe(self, audio_path: Path) -> SpeechToTextResult:
            raise SpeechToTextTimeout()

    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        store_uploaded_audio(wav_upload(), session.id)
        session.status = VoiceSession.Status.UPLOADED
        session.save(update_fields=["status"])

        with pytest.raises(RetryableTranscriptionError):
            process_voice_session(str(session.id), provider=TimeoutProvider(), quota=quota)

        session.refresh_from_db()
        assert session.quota_validated is True
        processed = process_voice_session(
            str(session.id),
            provider=type(
                "SuccessfulProvider",
                (),
                {"transcribe": lambda self, path: SpeechToTextResult("Comprar leche")},
            )(),
            quota=quota,
        )

    assert processed is not None
    assert processed.status == VoiceSession.Status.TRANSCRIBED
    assert session.id in quota.completed