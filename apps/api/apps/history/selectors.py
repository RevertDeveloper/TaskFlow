from uuid import UUID

from apps.history.models import TaskEvent
from apps.tasks.models import Task


def events_for_user(external_user_id: int):
    return TaskEvent.objects.filter(external_user_id=external_user_id)


def events_for_list(external_user_id: int, list_id: UUID):
    task_ids = Task.objects.filter(
        external_user_id=external_user_id,
        list_id=list_id,
    ).values("id")
    return events_for_user(external_user_id).filter(task_id__in=task_ids)
