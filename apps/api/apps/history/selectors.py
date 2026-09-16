from apps.history.models import TaskEvent


def events_for_user(external_user_id: int):
    return TaskEvent.objects.filter(external_user_id=external_user_id)
