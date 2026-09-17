import json
from collections.abc import Iterable
from pathlib import Path

from apps.ai.domain.ports import SpeechToTextResult, TaskExtractionPrompt


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


class FakeTaskExtractionProvider:
    """Deterministic task extraction provider used by local contract tests."""

    def __init__(
        self,
        response: str | None = None,
        responses: Iterable[str] | None = None,
    ) -> None:
        default = response or json.dumps(
            {
                "schema_version": 1,
                "tasks": [
                    {
                        "title": "Revisar la transcripción",
                        "list_id": None,
                        "classification_hint": "inbox",
                        "confidence": 0.5,
                    }
                ],
                "source": {"kind": "voice_transcript", "provider": "fake"},
            }
        )
        self._responses = list(responses) if responses is not None else [default]
        self.prompts: list[TaskExtractionPrompt] = []

    def extract(self, prompt: TaskExtractionPrompt) -> str:
        if not self._responses:
            raise RuntimeError("Fake task extraction response exhausted")
        self.prompts.append(prompt)
        return self._responses.pop(0)
