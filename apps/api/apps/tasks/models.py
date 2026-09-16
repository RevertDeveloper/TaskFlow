from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinLengthValidator
from django.db import models

from apps.common.models import OwnedTimestampedModel


class Task(OwnedTimestampedModel):
    """User-owned task with non-destructive completion and soft deletion."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"

    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        VOICE = "voice", "Voice"
        AI = "ai", "AI"
        IMPORT = "import", "Import"

    list = models.ForeignKey(
        "lists.List",
        on_delete=models.PROTECT,
        related_name="tasks",
    )
    title = models.CharField(
        max_length=500,
        validators=[MinLengthValidator(1), MaxLengthValidator(500)],
    )
    description = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.MANUAL)
    position = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("position", "created_at", "id")
        indexes = [
            models.Index(fields=("external_user_id", "status")),
            models.Index(fields=("external_user_id", "list", "status")),
            models.Index(fields=("external_user_id", "updated_at")),
        ]

    def clean(self) -> None:
        super().clean()
        if not self.title.strip():
            raise ValidationError({"title": "Task title cannot be blank."})
        if self.status == self.Status.COMPLETED and self.completed_at is None:
            raise ValidationError({"completed_at": "Completed tasks require completed_at."})
        if self.status == self.Status.PENDING and self.completed_at is not None:
            raise ValidationError({"completed_at": "Pending tasks cannot have completed_at."})
        if self.list_id and self.list.external_user_id != self.external_user_id:
            raise ValidationError({"list": "Task list must belong to the same user."})
