from django.db import IntegrityError, transaction

from apps.lists.models import List


class EnsureInboxForUser:
    """Create the one protected Inbox for a user, safely across retries."""

    def __init__(self, external_user_id: int) -> None:
        self.external_user_id = external_user_id

    def execute(self) -> List:
        try:
            with transaction.atomic():
                inbox, _ = List.objects.get_or_create(
                    external_user_id=self.external_user_id,
                    is_system=True,
                    defaults={"name": "Inbox", "position": 0},
                )
                return inbox
        except IntegrityError:
            return List.objects.get(external_user_id=self.external_user_id, is_system=True)


def ensure_inbox_for_user(external_user_id: int) -> List:
    return EnsureInboxForUser(external_user_id).execute()
