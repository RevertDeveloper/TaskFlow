from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import OwnedTimestampedModel

from .validators import normalize_blocks


class Folder(OwnedTimestampedModel):
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    name = models.CharField(max_length=120)
    position = models.PositiveIntegerField(default=0)
    deleted_at = models.DateTimeField(null=True, blank=True)
    sync_client_version = models.PositiveBigIntegerField(null=True, blank=True)
    sync_operation_id = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ("position", "name", "id")
        indexes = [models.Index(fields=("external_user_id", "parent", "position"))]

    def clean(self) -> None:
        super().clean()
        if self.parent_id and self.parent.external_user_id != self.external_user_id:
            raise ValidationError({"parent": "La carpeta padre debe pertenecer al mismo usuario."})


class Note(OwnedTimestampedModel):
    folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.SET_NULL, related_name="notes")
    title = models.CharField(max_length=500, blank=True)
    blocks = models.JSONField(default=list, blank=True)
    tags = models.JSONField(default=list, blank=True)
    pinned = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    sync_client_version = models.PositiveBigIntegerField(null=True, blank=True)
    sync_operation_id = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ("-updated_at",)
        indexes = [
            models.Index(fields=("external_user_id", "folder", "updated_at")),
            models.Index(fields=("external_user_id", "deleted_at")),
        ]

    def clean(self) -> None:
        super().clean()
        self.blocks = normalize_blocks(self.blocks)
        if self.folder_id and self.folder.external_user_id != self.external_user_id:
            raise ValidationError({"folder": "La carpeta debe pertenecer al mismo usuario."})
