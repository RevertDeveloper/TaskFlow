from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinLengthValidator
from django.db import models
from django.db.models import Q

from apps.common.models import OwnedTimestampedModel


class List(OwnedTimestampedModel):
    """User-owned task list; the Inbox is represented by a protected system row."""

    name = models.CharField(
        max_length=120,
        validators=[MinLengthValidator(1), MaxLengthValidator(120)],
    )
    description = models.TextField(blank=True)
    emoji = models.CharField(max_length=16, blank=True)
    color = models.CharField(max_length=32, blank=True)
    position = models.PositiveIntegerField(default=0)
    is_archived = models.BooleanField(default=False)
    is_system = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("position", "created_at", "id")
        constraints = [
            models.UniqueConstraint(
                condition=Q(is_system=True),
                fields=("external_user_id",),
                name="one_system_list_per_user",
            ),
        ]
        indexes = [
            models.Index(fields=("external_user_id", "is_archived")),
            models.Index(fields=("external_user_id", "position")),
            models.Index(fields=("external_user_id", "updated_at")),
        ]

    def clean(self) -> None:
        super().clean()
        if not self.name.strip():
            raise ValidationError({"name": "List name cannot be blank."})
        if self.is_system and self.name != "Inbox":
            raise ValidationError({"name": "The system list must be Inbox."})
        if self.is_system and self.is_archived:
            raise ValidationError({"is_archived": "Inbox cannot be archived."})
