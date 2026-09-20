from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.history.models import TaskEvent
from apps.history.services import record_event
from apps.tasks.models import Task
from apps.tasks.selectors import get_owned_task


@transaction.atomic
def delete_task(external_user_id: int, task_id: UUID) -> Task:
    task = get_owned_task(external_user_id, task_id)
    if task.deleted_at is not None:
        return task

    task.deleted_at = timezone.now()
    task.save(update_fields=["deleted_at", "updated_at"])
    record_event(
        external_user_id=external_user_id,
        task_id=task.id,
        event_type=str(TaskEvent.EventType.TASK_DELETED),
    )
    return task
