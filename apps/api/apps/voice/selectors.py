from apps.voice.models import VoiceSession


def voice_sessions_for_user(external_user_id: int):
    return VoiceSession.objects.filter(external_user_id=external_user_id)
