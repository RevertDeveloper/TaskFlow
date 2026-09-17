from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol


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
