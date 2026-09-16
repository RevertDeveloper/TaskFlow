from django.db import models

from apps.common.models import OwnedTimestampedModel


class TaskEvent(OwnedTimestampedModel):
    """Append-only business event; task_id remains after a task soft delete."""

    class EventType(models.TextChoices):
        TASK_CREATED = "TASK_CREATED", "Task created"
        TASK_UPDATED = "TASK_UPDATED", "Task updated"
        TASK_COMPLETED = "TASK_COMPLETED", "Task completed"
        TASK_REOPENED = "TASK_REOPENED", "Task reopened"
        TASK_MOVED = "TASK_MOVED", "Task moved"
        TASK_DELETED = "TASK_DELETED", "Task deleted"
        TASK_RESTORED = "TASK_RESTORED", "Task restored"
        LIST_CREATED = "LIST_CREATED", "List created"
        LIST_UPDATED = "LIST_UPDATED", "List updated"
        LIST_ARCHIVED = "LIST_ARCHIVED", "List archived"
        LIST_DELETED = "LIST_DELETED", "List deleted"

    task_id = models.UUIDField(null=True, blank=True, db_index=True)
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    payload = models.JSONField(default=dict)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=("external_user_id", "created_at")),
            models.Index(fields=("external_user_id", "task_id", "created_at")),
        ]
