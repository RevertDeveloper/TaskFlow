from apps.ai.domain.ports import (
    SpeechToTextConfigurationError,
    SpeechToTextProvider,
)
from apps.ai.providers.fake import FakeSpeechToTextProvider


def get_speech_to_text_provider(provider_name: str | None = None) -> SpeechToTextProvider:
    selected_provider = (provider_name or "").strip().lower()
    if not selected_provider:
        from django.conf import settings

        selected_provider = str(settings.AI_STT_PROVIDER).strip().lower()

    if selected_provider == "fake":
        return FakeSpeechToTextProvider()
    raise SpeechToTextConfigurationError("The configured STT provider is unavailable")
