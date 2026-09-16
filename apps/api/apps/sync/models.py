import uuid

from django.db import models

from apps.common.models import OwnedTimestampedModel


class SyncOperation(OwnedTimestampedModel):
    """Durable sync operation envelope; processing is owned by the API."""

    class Operation(models.TextChoices):
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"

    device_id = models.UUIDField()
    entity_type = models.CharField(max_length=32)
    entity_id = models.UUIDField()
    operation = models.CharField(max_length=16, choices=Operation.choices)
    client_version = models.PositiveBigIntegerField(default=0)
    occurred_at = models.DateTimeField()
    processed_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.UUIDField(default=uuid.uuid4)
    payload_version = models.PositiveIntegerField(default=1)
    payload = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("external_user_id", "idempotency_key"),
                name="sync_operation_user_idempotency_unique",
            ),
        ]
        indexes = [
            models.Index(fields=("external_user_id", "device_id", "occurred_at")),
            models.Index(fields=("external_user_id", "processed_at")),
        ]
