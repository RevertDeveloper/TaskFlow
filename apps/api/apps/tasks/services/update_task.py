from uuid import UUID

from django.db import transaction

from apps.history.models import TaskEvent
from apps.history.services import record_event
from apps.tasks.models import Task
from apps.tasks.selectors import get_owned_task


@transaction.atomic
def update_task(
    external_user_id: int,
    task_id: UUID,
    *,
    title: str | None = None,
    description: str | None = None,
    source: str | None = None,
    position: int | None = None,
) -> Task:
    task = get_owned_task(external_user_id, task_id)
    if task.deleted_at is not None:
        return task

    changes: dict[str, object] = {}
    for field, value in {
        "title": title,
        "description": description,
        "source": source,
        "position": position,
    }.items():
        if value is not None:
            setattr(task, field, value)
            changes[field] = value

    if not changes:
        return task
    task.full_clean()
    task.save(update_fields=[*changes, "updated_at"])
    record_event(
        external_user_id=external_user_id,
        task_id=task.id,
        event_type=TaskEvent.EventType.TASK_UPDATED,
        payload={"fields": sorted(changes)},
    )
    return task
