import logging
from datetime import datetime
from uuid import UUID

from django.db.models import Q

from apps.common.middleware import current_request_id
from apps.lists.models import List
from apps.tasks.models import Task

from .common import ENTITY_ORDER, decode_cursor, encode_cursor, serialize_change

logger = logging.getLogger(__name__)


def pull_changes(external_user_id: int, *, cursor: str | None, limit: int) -> dict[str, object]:
    decoded = decode_cursor(cursor)
    list_queryset = _changes_for_model(List, external_user_id, decoded, "list")
    task_queryset = _changes_for_model(Task, external_user_id, decoded, "task")

    changes = [
        ("list", entity)
        for entity in list_queryset
    ] + [
        ("task", entity)
        for entity in task_queryset
    ]
    changes.sort(key=lambda item: _change_key(item[1].updated_at, item[0], item[1].id))
    page = changes[:limit]
    has_more = len(changes) > limit
    next_cursor = cursor
    if page:
        entity_type, entity = page[-1]
        next_cursor = encode_cursor(entity.updated_at, entity_type, entity.id)

    result = {
        "version": 1,
        "cursor": next_cursor,
        "has_more": has_more,
        "changes": [serialize_change(entity_type, entity) for entity_type, entity in page],
    }
    logger.info(
        "sync_pull_completed",
        extra={
            "request_id": current_request_id(),
            "cursor_present": cursor is not None,
            "returned_count": len(page),
            "has_more": has_more,
        },
    )
    return result


def _changes_for_model(model, external_user_id: int, cursor, entity_type: str):  # type: ignore[no-untyped-def]
    queryset = model.objects.filter(external_user_id=external_user_id)
    if cursor is None:
        return queryset

    timestamp, cursor_type, entity_id = cursor
    if ENTITY_ORDER[entity_type] > ENTITY_ORDER[cursor_type]:
        return queryset.filter(updated_at__gte=timestamp)
    if ENTITY_ORDER[entity_type] < ENTITY_ORDER[cursor_type]:
        return queryset.filter(updated_at__gt=timestamp)
    return queryset.filter(
        Q(updated_at__gt=timestamp)
        | Q(updated_at=timestamp, id__gt=entity_id)
    )


def _change_key(
    updated_at: datetime, entity_type: str, entity_id: UUID
) -> tuple[datetime, int, str]:
    return updated_at, ENTITY_ORDER[entity_type], str(entity_id)