from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.history.models import TaskEvent
from apps.history.services import record_event
from apps.tasks.models import Task
from apps.tasks.selectors import get_owned_task


@transaction.atomic
def complete_task(external_user_id: int, task_id: UUID) -> Task:
    task = get_owned_task(external_user_id, task_id)
    if task.deleted_at is not None:
        raise ValidationError("Deleted tasks cannot be completed")
    if task.status == Task.Status.COMPLETED:
        return task

    task.status = Task.Status.COMPLETED
    task.completed_at = timezone.now()
    task.save(update_fields=["status", "completed_at", "updated_at"])
    record_event(
        external_user_id=external_user_id,
        task_id=task.id,
        event_type=str(TaskEvent.EventType.TASK_COMPLETED),
    )
    return task
