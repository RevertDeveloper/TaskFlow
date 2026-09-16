from uuid import UUID

from apps.common.exceptions import ResourceNotFound
from apps.tasks.models import Task


def tasks_for_user(external_user_id: int):
    return Task.objects.filter(external_user_id=external_user_id)


def active_tasks_for_user(external_user_id: int):
    return tasks_for_user(external_user_id).filter(deleted_at__isnull=True)


def get_owned_task(external_user_id: int, task_id: UUID) -> Task:
    try:
        return Task.objects.get(id=task_id, external_user_id=external_user_id)
    except Task.DoesNotExist as exc:
        raise ResourceNotFound("Task not found") from exc
