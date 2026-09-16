from apps.lists.models import List


def create_list(
    external_user_id: int,
    *,
    name: str,
    description: str = "",
    emoji: str = "",
    color: str = "",
    position: int = 0,
) -> List:
    task_list = List(
        external_user_id=external_user_id,
        name=name,
        description=description,
        emoji=emoji,
        color=color,
        position=position,
    )
    task_list.full_clean()
    task_list.save(force_insert=True)
    return task_list
