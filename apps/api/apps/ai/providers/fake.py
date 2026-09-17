from pathlib import Path

from apps.ai.domain.ports import SpeechToTextResult


class FakeSpeechToTextProvider:
    """Deterministic provider used by local development and contract tests."""

    def __init__(self, transcript: str = "Transcripción de prueba.") -> None:
        self.transcript = transcript

    def transcribe(self, audio_path: Path) -> SpeechToTextResult:
        if not audio_path.is_file():
            raise RuntimeError("Validated audio file is missing")
        return SpeechToTextResult(
            transcript=self.transcript,
            provider_metadata={"provider": "fake"},
        )
