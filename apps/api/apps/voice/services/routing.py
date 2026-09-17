from dataclasses import dataclass
from uuid import UUID

from django.conf import settings

from apps.ai.services.prompts import AvailableList
from apps.ai.services.task_extraction import ExtractedTaskDraft, TaskExtraction


@dataclass(frozen=True, slots=True)
class RoutedTaskDraft:
    title: str
    description: str | None
    list_id: UUID
    classification_hint: str
    confidence: float
    routing: str


def route_extraction(
    extraction: TaskExtraction,
    *,
    available_lists: list[AvailableList],
    inbox_id: UUID,
    current_list_id: UUID | None,
) -> tuple[RoutedTaskDraft, ...]:
    available_ids = {item.id for item in available_lists}
    active_current_id = current_list_id if current_list_id in available_ids else None
    threshold = _confidence_threshold()
    return tuple(
        _route_task(
            task,
            available_ids=available_ids,
            inbox_id=inbox_id,
            current_list_id=active_current_id,
            confidence_threshold=threshold,
        )
        for task in extraction.tasks
    )


def _route_task(
    task: ExtractedTaskDraft,
    *,
    available_ids: set[UUID],
    inbox_id: UUID,
    current_list_id: UUID | None,
    confidence_threshold: float,
) -> RoutedTaskDraft:
    target_id = inbox_id
    routing = "inbox"
    if task.classification_hint == "explicit" and task.list_id in available_ids:
        target_id = task.list_id
        routing = "explicit"
    elif task.classification_hint == "current" and current_list_id is not None:
        target_id = current_list_id
        routing = "current"
    elif (
        task.classification_hint == "semantic"
        and task.list_id in available_ids
        and task.confidence >= confidence_threshold
    ):
        target_id = task.list_id
        routing = "semantic"

    return RoutedTaskDraft(
        title=task.title,
        description=task.description,
        list_id=target_id,
        classification_hint=task.classification_hint,
        confidence=task.confidence,
        routing=routing,
    )


def _confidence_threshold() -> float:
    raw_value = float(getattr(settings, "AI_CLASSIFICATION_CONFIDENCE_THRESHOLD", 0.65))
    return min(max(raw_value, 0.0), 1.0)
