from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.history.models import TaskEvent
from apps.history.services import record_event
from apps.lists.selectors import get_owned_list
from apps.tasks.models import Task


@transaction.atomic
def create_task(
    external_user_id: int,
    *,
    list_id: UUID,
    title: str,
    description: str = "",
    source: str = str(Task.Source.MANUAL),
    position: int = 0,
) -> Task:
    task_list = get_owned_list(external_user_id, list_id)
    if task_list.is_archived:
        raise ValidationError({"list": "Tasks cannot be created in an archived list."})

    task = Task(
        external_user_id=external_user_id,
        list=task_list,
        title=title,
        description=description,
        source=source,
        position=position,
    )
    task.full_clean()
    task.save(force_insert=True)
    record_event(
        external_user_id=external_user_id,
        task_id=task.id,
        event_type=str(TaskEvent.EventType.TASK_CREATED),
        payload={"source": task.source},
    )
    return task
