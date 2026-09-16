from django.db import models

from apps.common.models import OwnedTimestampedModel


class VoiceSession(OwnedTimestampedModel):
    """Metadata for an ephemeral voice pipeline; audio is intentionally absent."""

    class Status(models.TextChoices):
        RECORDING = "recording", "Recording"
        UPLOADED = "uploaded", "Uploaded"
        TRANSCRIBING = "transcribing", "Transcribing"
        TRANSCRIBED = "transcribed", "Transcribed"
        FAILED = "failed", "Failed"

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECORDING)
    transcript_retention = models.BooleanField(default=False)
    provider_metadata = models.JSONField(default=dict)
    error_code = models.CharField(max_length=64, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("external_user_id", "status")),
            models.Index(fields=("external_user_id", "updated_at")),
        ]
