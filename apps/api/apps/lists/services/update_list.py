from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.common.exceptions import ProtectedResourceError
from apps.lists.models import List
from apps.lists.selectors import get_owned_list


@transaction.atomic
def update_list(
    external_user_id: int,
    list_id: UUID,
    *,
    name: str | None = None,
    description: str | None = None,
    emoji: str | None = None,
    color: str | None = None,
    position: int | None = None,
    is_archived: bool | None = None,
) -> List:
    task_list = get_owned_list(external_user_id, list_id)
    if task_list.is_system and is_archived:
        raise ProtectedResourceError("Inbox cannot be archived")
    if task_list.is_system and name is not None and name != "Inbox":
        raise ProtectedResourceError("Inbox cannot be renamed")

    changes: dict[str, object] = {}
    for field, value in {
        "name": name,
        "description": description,
        "emoji": emoji,
        "color": color,
        "position": position,
        "is_archived": is_archived,
    }.items():
        if value is not None:
            changes[field] = value
            setattr(task_list, field, value)

    if not changes:
        return task_list
    try:
        task_list.full_clean()
    except ValidationError:
        raise
    task_list.save(update_fields=[*changes, "updated_at"])
    return task_list
