from functools import lru_cache

from apps.ai.domain.ports import (
    AIQuotaClient,
    SpeechToTextConfigurationError,
    SpeechToTextProvider,
    TaskExtractionConfigurationError,
    TaskExtractionProvider,
)
from apps.ai.infrastructure.accounts_quota import AccountsQuotaClient, FakeQuotaClient
from apps.ai.providers.fake import FakeSpeechToTextProvider, FakeTaskExtractionProvider


class AIProviderRouter:
    def speech_to_text(self, provider_name: str | None = None) -> SpeechToTextProvider:
        return get_speech_to_text_provider(provider_name)

    def task_extraction(self, provider_name: str | None = None) -> TaskExtractionProvider:
        return get_task_extraction_provider(provider_name)


def get_speech_to_text_provider(provider_name: str | None = None) -> SpeechToTextProvider:
    selected_provider = (provider_name or "").strip().lower()
    if not selected_provider:
        from django.conf import settings

        selected_provider = str(settings.AI_STT_PROVIDER).strip().lower()

    if selected_provider == "fake":
        return FakeSpeechToTextProvider()
    raise SpeechToTextConfigurationError("The configured STT provider is unavailable")


def get_task_extraction_provider(provider_name: str | None = None) -> TaskExtractionProvider:
    selected_provider = (provider_name or "").strip().lower()
    if not selected_provider:
        from django.conf import settings

        selected_provider = str(settings.AI_LLM_PROVIDER or settings.AI_PROVIDER).strip().lower()

    if selected_provider == "fake":
        return FakeTaskExtractionProvider()
    raise TaskExtractionConfigurationError("The configured LLM provider is unavailable")


def get_ai_quota_client() -> AIQuotaClient:
    from django.conf import settings

    return _build_quota_client(
        str(getattr(settings, "ACCOUNTS_QUOTA_MODE", "accounts")).strip().lower(),
        str(getattr(settings, "ACCOUNTS_BASE_URL", "")),
        str(settings.ACCOUNTS_APPLICATION_SLUG),
        str(settings.ACCOUNTS_TASKFLOW_SERVICE_KEY),
        float(getattr(settings, "ACCOUNTS_TIMEOUT_SECONDS", 2)),
    )

@lru_cache(maxsize=8)
def _build_quota_client(
    mode: str,
    base_url: str,
    application_slug: str,
    service_key: str,
    timeout_seconds: float,
) -> AIQuotaClient:
    if mode == "fake":
        return FakeQuotaClient()
    if mode == "accounts":
        return AccountsQuotaClient(
            base_url=base_url or None,
            application_slug=application_slug,
            service_key=service_key,
            timeout_seconds=timeout_seconds,
        )
    raise TaskExtractionConfigurationError("The configured quota mode is unavailable")
