import json
from collections.abc import Mapping
from dataclasses import dataclass, replace
from pathlib import Path
from time import monotonic
from typing import Any
from uuid import UUID, uuid4

from django.conf import settings
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError as SchemaValidationError

from apps.ai.domain.ports import (
    AIQuotaClient,
    AIQuotaError,
    TaskExtractionConfigurationError,
    TaskExtractionError,
    TaskExtractionPrompt,
    TaskExtractionProvider,
    TaskExtractionTimeout,
    TaskExtractionUnavailable,
)
from apps.ai.router import get_task_extraction_provider

from .prompts import AvailableList, build_extraction_prompt

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schemas" / "task_extraction.schema.json"
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())
REPAIR_INSTRUCTIONS = (
    "The previous provider output was invalid. Return only one JSON object that conforms "
    "to the task extraction schema. Do not add fields or explain the correction."
)


@dataclass(frozen=True, slots=True)
class ExtractedTaskDraft:
    title: str
    description: str | None
    list_id: UUID | None
    classification_hint: str
    confidence: float


@dataclass(frozen=True, slots=True)
class TaskExtraction:
    schema_version: int
    tasks: tuple[ExtractedTaskDraft, ...]
    source: dict[str, str]


class TaskExtractionValidationError(TaskExtractionError):
    """Provider output failed the strict extraction contract."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def extract_tasks(
    *,
    transcript: str,
    available_lists: list[AvailableList],
    current_list_id: UUID | None,
    provider: TaskExtractionProvider | None = None,
    quota: AIQuotaClient | None = None,
    request_headers: Mapping[str, str] | None = None,
    request_id: UUID | None = None,
) -> TaskExtraction:
    normalized_transcript = transcript.strip()
    if not normalized_transcript:
        raise TaskExtractionValidationError("empty_transcript")
    if len(normalized_transcript) > settings.AI_MAX_TRANSCRIPT_CHARS:
        raise TaskExtractionValidationError("transcript_too_large")

    prompt = build_extraction_prompt(
        transcript=normalized_transcript,
        available_lists=available_lists,
        current_list_id=current_list_id,
    )
    selected_provider = provider or get_task_extraction_provider()
    if quota is None:
        return _extract_tasks_without_quota(selected_provider, prompt, available_lists)
    if request_headers is None:
        raise ValueError("request_headers are required when quota is enabled")

    quota_request_id = request_id or uuid4()
    quota.reserve(
        request_headers=request_headers,
        action="voice_task_extraction",
        request_id=quota_request_id,
    )
    started_at = monotonic()
    validated = False
    try:
        quota.validate(request_id=quota_request_id, action="voice_task_extraction")
        validated = True
        result = _extract_tasks_without_quota(selected_provider, prompt, available_lists)
        quota.complete(
            request_id=quota_request_id,
            metadata={
                "provider": type(selected_provider).__name__,
                "task_count": len(result.tasks),
            },
            processing_time_ms=max(0, round((monotonic() - started_at) * 1000)),
        )
        return result
    except AIQuotaError:
        raise
    except TaskExtractionError as exc:
        if validated:
            quota.fail(
                request_id=quota_request_id,
                error_code=_quota_error_code(exc),
            )
        raise


def _extract_tasks_without_quota(
    selected_provider: TaskExtractionProvider,
    prompt: TaskExtractionPrompt,
    available_lists: list[AvailableList],
) -> TaskExtraction:
    attempts = 1 + min(max(int(settings.AI_LLM_MAX_RETRIES), 0), 1)
    last_validation_error: TaskExtractionValidationError | None = None

    for attempt in range(attempts):
        try:
            return _extract_and_validate(selected_provider, prompt, available_lists)
        except TaskExtractionValidationError as exc:
            last_validation_error = exc
            if attempt + 1 >= attempts:
                break
            prompt = replace(
                prompt,
                task_instructions=f"{prompt.task_instructions}\n\n{REPAIR_INSTRUCTIONS}",
            )

    assert last_validation_error is not None
    raise last_validation_error


def _quota_error_code(error: TaskExtractionError) -> str:
    if isinstance(error, TaskExtractionValidationError):
        return error.code
    if isinstance(error, TaskExtractionTimeout):
        return "provider_timeout"
    if isinstance(error, TaskExtractionUnavailable):
        return "provider_unavailable"
    if isinstance(error, TaskExtractionConfigurationError):
        return "before_processing"
    return "provider_error"


def _extract_and_validate(
    provider: TaskExtractionProvider,
    prompt: TaskExtractionPrompt,
    available_lists: list[AvailableList],
) -> TaskExtraction:
    try:
        raw_response = provider.extract(prompt)
    except (TaskExtractionTimeout, TaskExtractionUnavailable):
        raise
    except TaskExtractionError:
        raise
    except Exception as exc:
        raise TaskExtractionError("Task extraction provider failed") from exc

    if not isinstance(raw_response, str):
        raise TaskExtractionValidationError("response_not_text")
    if len(raw_response) > settings.AI_MAX_LLM_RESPONSE_CHARS:
        raise TaskExtractionValidationError("response_too_large")

    payload = _parse_json(raw_response)
    try:
        VALIDATOR.validate(payload)
    except SchemaValidationError as exc:
        raise TaskExtractionValidationError("schema_invalid") from exc
    return _to_extraction(payload, available_lists)


def _parse_json(raw_response: str) -> dict[str, Any]:
    try:
        payload = json.loads(
            raw_response,
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=_reject_non_json_constant,
        )
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise TaskExtractionValidationError("malformed_json") from exc
    if not isinstance(payload, dict):
        raise TaskExtractionValidationError("response_not_object")
    return payload


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def _reject_non_json_constant(value: str) -> None:
    raise ValueError(f"Invalid JSON constant: {value}")


def _to_extraction(payload: dict[str, Any], available_lists: list[AvailableList]) -> TaskExtraction:
    allowed_list_ids = {item.id for item in available_lists}
    drafts: list[ExtractedTaskDraft] = []
    for item in payload["tasks"]:
        title = item["title"].strip()
        if not title:
            raise TaskExtractionValidationError("empty_title")
        list_id = _validated_list_id(item.get("list_id"), allowed_list_ids)
        description = item.get("description")
        drafts.append(
            ExtractedTaskDraft(
                title=title,
                description=description.strip() if description and description.strip() else None,
                list_id=list_id,
                classification_hint=item["classification_hint"],
                confidence=float(item["confidence"]),
            )
        )
    return TaskExtraction(
        schema_version=payload["schema_version"],
        tasks=tuple(drafts),
        source=dict(payload["source"]),
    )


def _validated_list_id(value: str | None, allowed_list_ids: set[UUID]) -> UUID | None:
    if value is None:
        return None
    list_id = UUID(value)
    if list_id not in allowed_list_ids:
        raise TaskExtractionValidationError("unknown_list")
    return list_id