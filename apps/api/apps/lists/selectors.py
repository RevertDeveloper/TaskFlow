from uuid import UUID

from apps.common.exceptions import ResourceNotFound
from apps.lists.models import List


def lists_for_user(external_user_id: int):
    return List.objects.filter(external_user_id=external_user_id)


def get_owned_list(external_user_id: int, list_id: UUID) -> List:
    try:
        return List.objects.get(id=list_id, external_user_id=external_user_id)
    except List.DoesNotExist as exc:
        raise ResourceNotFound("List not found") from exc
