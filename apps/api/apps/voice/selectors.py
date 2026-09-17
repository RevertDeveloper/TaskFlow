from uuid import UUID

from apps.common.exceptions import ResourceNotFound
from apps.voice.models import VoiceSession


def voice_sessions_for_user(external_user_id: int):
    return VoiceSession.objects.filter(external_user_id=external_user_id)


def get_owned_voice_session(external_user_id: int, session_id: str) -> VoiceSession:
    try:
        normalized_id = UUID(session_id)
    except ValueError as exc:
        raise ResourceNotFound("Voice session not found") from exc
    try:
        return VoiceSession.objects.get(id=normalized_id, external_user_id=external_user_id)
    except VoiceSession.DoesNotExist as exc:
        raise ResourceNotFound("Voice session not found") from exc
