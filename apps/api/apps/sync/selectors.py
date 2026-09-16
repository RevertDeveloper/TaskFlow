from apps.sync.models import SyncOperation


def operations_for_user(external_user_id: int):
    return SyncOperation.objects.filter(external_user_id=external_user_id)
