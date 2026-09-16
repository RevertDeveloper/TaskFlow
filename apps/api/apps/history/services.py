from collections.abc import Mapping
from uuid import UUID

from apps.history.models import TaskEvent


def record_event(
    *,
    external_user_id: int,
    event_type: str,
    task_id: UUID | None = None,
    payload: Mapping[str, object] | None = None,
) -> TaskEvent:
    """Persist a business event inside the caller's transaction."""

    return TaskEvent.objects.create(
        external_user_id=external_user_id,
        task_id=task_id,
        event_type=event_type,
        payload=dict(payload or {}),
    )
