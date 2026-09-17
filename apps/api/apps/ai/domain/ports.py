from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True, slots=True)
class SpeechToTextResult:
    transcript: str
    duration_seconds: float | None = None
    provider_metadata: dict[str, object] = field(default_factory=dict)


class SpeechToTextProvider(Protocol):
    def transcribe(self, audio_path: Path) -> SpeechToTextResult:
        """Transcribe one already validated temporary audio file."""


class SpeechToTextError(RuntimeError):
    """Base error for provider failures safe to expose as a public error code."""


class SpeechToTextTimeout(SpeechToTextError):
    """The provider exceeded its configured time budget and may be retried."""


class SpeechToTextUnavailable(SpeechToTextError):
    """The provider is temporarily unavailable and may be retried."""


class SpeechToTextConfigurationError(SpeechToTextError):
    """The configured provider is not available in this deployment."""


@dataclass(frozen=True, slots=True)
class TaskExtractionPrompt:
    system: str
    task_instructions: str
    classification_instructions: str
    context: str
    transcript: str

    def as_text(self) -> str:
        sections = (
            ("system", self.system),
            ("task-extraction", self.task_instructions),
            ("task-classification", self.classification_instructions),
            ("context", self.context),
            ("transcript", self.transcript),
        )
        return "\n".join(
            f"<{name}>\n{content}\n</{name}>" for name, content in sections
        ) + "\n"


class TaskExtractionProvider(Protocol):
    def extract(self, prompt: TaskExtractionPrompt) -> str:
        """Return untrusted provider output for validation by the application layer."""


class TaskExtractionError(RuntimeError):
    """Base error for task extraction provider failures."""


class TaskExtractionTimeout(TaskExtractionError):
    """The provider exceeded its configured time budget."""


class TaskExtractionUnavailable(TaskExtractionError):
    """The provider is temporarily unavailable."""


class TaskExtractionConfigurationError(TaskExtractionError):
    """The configured task extraction provider is unavailable."""


@dataclass(frozen=True, slots=True)
class QuotaReservation:
    request_id: UUID


class AIQuotaClient(Protocol):
    def reserve(
        self,
        *,
        request_headers: Mapping[str, str],
        action: str,
        request_id: UUID,
    ) -> QuotaReservation:
        """Reserve one user interaction before an AI provider starts."""

    def validate(self, *, request_id: UUID, action: str) -> None:
        """Consume the reservation once immediately before provider work."""

    def complete(
        self,
        *,
        request_id: UUID,
        metadata: Mapping[str, object] | None = None,
        processing_time_ms: int | None = None,
    ) -> None:
        """Close a validated interaction successfully."""

    def fail(
        self,
        *,
        request_id: UUID,
        error_code: str,
        metadata: Mapping[str, object] | None = None,
    ) -> None:
        """Close a validated interaction with a safe error code."""


class AIQuotaError(RuntimeError):
    """Base error for fail-closed quota operations."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class AIQuotaRejected(AIQuotaError):
    """Accounts rejected a reservation or callback."""


class AIQuotaUnavailable(AIQuotaError):
    """Accounts could not be reached or returned an unusable response."""


class AIQuotaConfigurationError(AIQuotaError):
    """The quota client is not safely configured for this deployment."""
