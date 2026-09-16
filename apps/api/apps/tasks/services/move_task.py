from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.history.models import TaskEvent
from apps.history.services import record_event
from apps.lists.selectors import get_owned_list
from apps.tasks.models import Task
from apps.tasks.selectors import get_owned_task


@transaction.atomic
def move_task(external_user_id: int, task_id: UUID, *, list_id: UUID) -> Task:
    task = get_owned_task(external_user_id, task_id)
    if task.deleted_at is not None:
        raise ValidationError("Deleted tasks cannot be moved")
    target_list = get_owned_list(external_user_id, list_id)
    if target_list.is_archived:
        raise ValidationError({"list": "Tasks cannot be moved to an archived list."})
    if task.list_id == target_list.id:
        return task

    previous_list_id = task.list_id
    task.list = target_list
    task.save(update_fields=["list", "updated_at"])
    record_event(
        external_user_id=external_user_id,
        task_id=task.id,
        event_type=TaskEvent.EventType.TASK_MOVED,
        payload={"from_list_id": str(previous_list_id), "to_list_id": str(target_list.id)},
    )
    return task
