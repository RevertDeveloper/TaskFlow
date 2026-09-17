import json
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from apps.ai.domain.ports import TaskExtractionPrompt

PROMPT_ROOT = Path(__file__).resolve().parents[1] / "prompts"
MAX_AVAILABLE_LISTS = 100


@dataclass(frozen=True, slots=True)
class AvailableList:
    id: UUID
    name: str


def build_extraction_prompt(
    *,
    transcript: str,
    available_lists: list[AvailableList],
    current_list_id: UUID | None,
) -> TaskExtractionPrompt:
    if not transcript.strip():
        raise ValueError("Transcript cannot be empty")
    if len(available_lists) > MAX_AVAILABLE_LISTS:
        raise ValueError("Too many lists for an extraction prompt")

    context = json.dumps(
        {
            "schema_version": 1,
            "available_lists": [
                {"id": str(item.id), "name": item.name} for item in available_lists
            ],
            "current_list_id": str(current_list_id) if current_list_id else None,
        },
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    return TaskExtractionPrompt(
        system=_read_prompt("system.md"),
        task_instructions=_read_prompt("task_extraction.md"),
        classification_instructions=_read_prompt("task_classification.md"),
        context=context,
        transcript=json.dumps(transcript, ensure_ascii=True),
    )


def _read_prompt(name: str) -> str:
    return (PROMPT_ROOT / name).read_text(encoding="utf-8").strip()