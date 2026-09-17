from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import ProtectedResourceError
from apps.history.models import TaskEvent
from apps.history.services import record_event
from apps.lists.selectors import get_owned_list
from apps.lists.services.ensure_inbox import ensure_inbox_for_user
from apps.tasks.models import Task


@transaction.atomic
def delete_list(external_user_id: int, list_id: UUID) -> None:
    task_list = get_owned_list(external_user_id, list_id)
    if task_list.is_system:
        raise ProtectedResourceError("Inbox cannot be deleted")

    inbox = ensure_inbox_for_user(external_user_id)
    tasks = Task.objects.select_for_update().filter(
        list=task_list,
        external_user_id=external_user_id,
    )
    for task in tasks:
        previous_list_id = task.list_id
        task.list_id = inbox.id
        task.save(update_fields=["list", "updated_at"])
        record_event(
            external_user_id=external_user_id,
            task_id=task.id,
            event_type=TaskEvent.EventType.TASK_MOVED,
            payload={"from_list_id": str(previous_list_id), "to_list_id": str(inbox.id)},
        )

    record_event(
        external_user_id=external_user_id,
        event_type=TaskEvent.EventType.LIST_DELETED,
        payload={"list_id": str(task_list.id)},
    )
    task_list.deleted_at = timezone.now()
    task_list.save(update_fields=["deleted_at", "updated_at"])
