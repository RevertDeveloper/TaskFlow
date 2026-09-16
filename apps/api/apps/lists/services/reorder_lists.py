from collections.abc import Sequence
from uuid import UUID

from django.db import transaction

from apps.common.exceptions import ResourceNotFound
from apps.lists.models import List


@transaction.atomic
def reorder_lists(external_user_id: int, list_ids: Sequence[UUID]) -> list[List]:
    if len(set(list_ids)) != len(list_ids):
        raise ResourceNotFound("List order contains duplicates")

    lists = list(List.objects.select_for_update().filter(external_user_id=external_user_id))
    by_id = {task_list.id: task_list for task_list in lists}
    if set(by_id) != set(list_ids):
        raise ResourceNotFound("List order does not belong to the user")

    ordered = [by_id[list_id] for list_id in list_ids]
    for position, task_list in enumerate(ordered):
        if task_list.position != position:
            task_list.position = position
            task_list.save(update_fields=["position", "updated_at"])
    return ordered
