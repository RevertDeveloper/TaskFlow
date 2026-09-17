import wave
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.ai.domain.ports import (
    SpeechToTextConfigurationError,
    SpeechToTextResult,
    SpeechToTextTimeout,
)
from apps.ai.infrastructure.accounts_quota import FakeQuotaClient
from apps.ai.providers.fake import FakeSpeechToTextProvider
from apps.ai.router import get_speech_to_text_provider
from apps.voice.models import VoiceSession
from apps.voice.services.audio_upload import (
    AudioValidationError,
    _validate_filename,
    cleanup_session_audio,
    get_session_audio_path,
    store_uploaded_audio,
)
from apps.voice.services.transcribe_voice import (
    RetryableTranscriptionError,
    process_voice_session,
)
from tests.test_api_resources import auth_client

pytestmark = pytest.mark.django_db


def wav_upload(*, name: str = "recording.wav", seconds: int = 1) -> SimpleUploadedFile:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(8_000)
        wav_file.writeframes(b"\x00\x00" * 8_000 * seconds)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="audio/wav")


def test_valid_audio_is_sniffed_duration_checked_and_cleaned(tmp_path: Path) -> None:
    session_id = uuid4()
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path, AI_MAX_AUDIO_SECONDS=2):
        result = store_uploaded_audio(wav_upload(), session_id)

        assert result.content_type == "audio/wav"
        assert result.size_bytes > 0
        assert result.duration_seconds == pytest.approx(1)
        assert get_session_audio_path(session_id) == result.path
        assert cleanup_session_audio(session_id) is True
        assert not result.path.exists()


@pytest.mark.parametrize(
    ("name", "content_type"),
    [
        ("recording.mp3", "audio/wav"),
        ("../recording.wav", "audio/wav"),
        ("recording.txt", "audio/wav"),
    ],
)
def test_audio_filename_and_declared_type_are_allowlisted(
    tmp_path: Path, name: str, content_type: str
) -> None:
    if "/" in name or "\\" in name:
        with pytest.raises(AudioValidationError):
            _validate_filename(name, content_type)
        return

    session_id = uuid4()
    uploaded = wav_upload(name=name)
    uploaded.content_type = content_type
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        with pytest.raises(AudioValidationError):
            store_uploaded_audio(uploaded, session_id)
    assert get_session_audio_path(session_id) is None


def test_audio_mime_mismatch_and_size_limit_fail_closed(tmp_path: Path) -> None:
    session_id = uuid4()
    uploaded = wav_upload()
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path, AI_MAX_AUDIO_BYTES=10):
        with pytest.raises(AudioValidationError) as raised:
            store_uploaded_audio(uploaded, session_id)
    assert raised.value.code == "audio_too_large"
    assert get_session_audio_path(session_id) is None


def test_audio_duration_limit_is_enforced(tmp_path: Path) -> None:
    session_id = uuid4()
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path, AI_MAX_AUDIO_SECONDS=0.5):
        with pytest.raises(AudioValidationError) as raised:
            store_uploaded_audio(wav_upload(), session_id)
    assert raised.value.code == "audio_too_long"


def test_fake_provider_transcribes_and_original_audio_is_removed(tmp_path: Path) -> None:
    session = VoiceSession.objects.create(external_user_id=101)
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        store_uploaded_audio(wav_upload(), session.id)
        session.status = VoiceSession.Status.UPLOADED
        session.save(update_fields=["status"])

        processed = process_voice_session(
            str(session.id),
            provider=FakeSpeechToTextProvider("Comprar leche"),
        )

    assert processed is not None
    processed.refresh_from_db()
    assert processed.status == VoiceSession.Status.TRANSCRIBED
    assert processed.transcript == "Comprar leche"
    assert get_session_audio_path(session.id) is None


def test_empty_transcript_is_recoverable_and_does_not_retain_audio(tmp_path: Path) -> None:
    session = VoiceSession.objects.create(external_user_id=101)
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        store_uploaded_audio(wav_upload(), session.id)
        session.status = VoiceSession.Status.UPLOADED
        session.save(update_fields=["status"])
        processed = process_voice_session(
            str(session.id),
            provider=FakeSpeechToTextProvider("  "),
        )

    assert processed is not None
    processed.refresh_from_db()
    assert processed.status == VoiceSession.Status.FAILED
    assert processed.error_code == "empty_transcript"
    assert get_session_audio_path(session.id) is None


def test_retryable_provider_failure_restores_uploaded_state(tmp_path: Path) -> None:
    class TimeoutProvider:
        def transcribe(self, audio_path: Path) -> SpeechToTextResult:
            raise SpeechToTextTimeout()

    session = VoiceSession.objects.create(external_user_id=101)
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        store_uploaded_audio(wav_upload(), session.id)
        session.status = VoiceSession.Status.UPLOADED
        session.save(update_fields=["status"])

        with pytest.raises(RetryableTranscriptionError):
            process_voice_session(str(session.id), provider=TimeoutProvider())

        session.refresh_from_db()
        assert session.status == VoiceSession.Status.UPLOADED
        assert get_session_audio_path(session.id) is not None
        assert cleanup_session_audio(session.id) is True


def test_provider_router_is_fake_by_default_and_rejects_unknown_provider() -> None:
    assert isinstance(get_speech_to_text_provider("fake"), FakeSpeechToTextProvider)
    with pytest.raises(SpeechToTextConfigurationError):
        get_speech_to_text_provider("external-provider-not-approved")


def test_cleanup_failure_is_exposed_as_a_safe_terminal_error(monkeypatch, tmp_path: Path) -> None:
    session = VoiceSession.objects.create(external_user_id=101)
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        store_uploaded_audio(wav_upload(), session.id)
        session.status = VoiceSession.Status.UPLOADED
        session.save(update_fields=["status"])
        monkeypatch.setattr(
            "apps.voice.services.transcribe_voice.cleanup_session_audio",
            lambda session_id: False,
        )

        processed = process_voice_session(
            str(session.id),
            provider=FakeSpeechToTextProvider("Transcripción"),
        )

    assert processed is not None
    processed.refresh_from_db()
    assert processed.status == VoiceSession.Status.FAILED
    assert processed.error_code == "audio_cleanup_failed"


def test_voice_upload_returns_accepted_without_returning_audio(monkeypatch, tmp_path: Path) -> None:
    client = auth_client(monkeypatch, "alice")
    queued: list[str] = []
    monkeypatch.setattr(
        "apps.voice.api.transcribe_voice_session.delay",
        lambda session_id: queued.append(session_id),
    )
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        response = client.post(
            "/api/v1/voice/sessions/",
            data={"audio": wav_upload()},
            HTTP_X_CSRFTOKEN=client.csrf_token,
        )

    assert response.status_code == 202
    payload = response.json()["data"]
    assert payload["status"] == VoiceSession.Status.UPLOADED
    assert "audio" not in payload
    assert queued == [payload["id"]]


def test_queue_failure_exposes_cleanup_failure(monkeypatch, tmp_path: Path) -> None:
    client = auth_client(monkeypatch, "alice")
    quota = FakeQuotaClient()
    monkeypatch.setattr("apps.voice.api.get_ai_quota_client", lambda: quota)
    monkeypatch.setattr(
        "apps.voice.api.transcribe_voice_session.delay",
        lambda session_id: (_ for _ in ()).throw(RuntimeError("redis unavailable")),
    )
    monkeypatch.setattr("apps.voice.api.cleanup_session_audio", lambda session_id: False)

    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        response = client.post(
            "/api/v1/voice/sessions/",
            data={"audio": wav_upload()},
            HTTP_X_CSRFTOKEN=client.csrf_token,
        )

    assert response.status_code == 503
    session = VoiceSession.objects.get()
    assert session.status == VoiceSession.Status.FAILED
    assert session.error_code == "audio_cleanup_failed"
    assert quota.failed[session.id] == "before_processing"


def test_voice_session_polling_isolated_by_accounts_identity(monkeypatch, tmp_path: Path) -> None:
    alice = auth_client(monkeypatch, "alice")
    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        session = VoiceSession.objects.create(
            external_user_id=101,
            status=VoiceSession.Status.TRANSCRIBED,
            transcript="Privada",
        )

    bob = auth_client(monkeypatch, "bob")
    response = bob.get(f"/api/v1/voice/sessions/{session.id}/")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert (
        alice.get(f"/api/v1/voice/sessions/{session.id}/").json()["data"]["transcript"] == "Privada"
    )


def test_voice_upload_rejects_mime_that_does_not_match_content(monkeypatch, tmp_path: Path) -> None:
    client = auth_client(monkeypatch, "alice")
    monkeypatch.setattr("apps.voice.api.transcribe_voice_session.delay", lambda session_id: None)
    uploaded = wav_upload()
    uploaded.content_type = "audio/mpeg"

    with override_settings(AI_AUDIO_TEMP_DIR=tmp_path):
        response = client.post(
            "/api/v1/voice/sessions/",
            data={"audio": uploaded},
            HTTP_X_CSRFTOKEN=client.csrf_token,
        )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
