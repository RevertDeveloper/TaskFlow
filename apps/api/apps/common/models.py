import uuid

from django.core.validators import MinValueValidator
from django.db import models


class OwnedTimestampedModel(models.Model):
    """Common identity, ownership and audit fields for private domain records."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    external_user_id = models.PositiveBigIntegerField(
        db_index=True,
        validators=[MinValueValidator(1)],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True