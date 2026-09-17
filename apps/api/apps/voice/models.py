from django.db import models

from apps.common.models import OwnedTimestampedModel


class VoiceSession(OwnedTimestampedModel):
    """Session metadata and transient transcript; original audio is never a model field."""

    class Status(models.TextChoices):
        RECORDING = "recording", "Recording"
        UPLOADED = "uploaded", "Uploaded"
        TRANSCRIBING = "transcribing", "Transcribing"
        TRANSCRIBED = "transcribed", "Transcribed"
        FAILED = "failed", "Failed"

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECORDING)
    transcript_retention = models.BooleanField(default=False)
    transcript = models.TextField(blank=True)
    quota_validated = models.BooleanField(default=False)
    provider_metadata = models.JSONField(default=dict)
    error_code = models.CharField(max_length=64, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("external_user_id", "status")),
            models.Index(fields=("external_user_id", "updated_at")),
        ]


class VoiceReviewDraft(OwnedTimestampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CONFIRMED = "confirmed", "Confirmed"
        EXPIRED = "expired", "Expired"

    session = models.OneToOneField(
        VoiceSession,
        on_delete=models.CASCADE,
        related_name="review_draft",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    schema_version = models.PositiveSmallIntegerField(default=1)
    payload = models.JSONField(default=dict)
    expires_at = models.DateTimeField()
    confirmation_key = models.UUIDField(null=True, blank=True, unique=True)
    confirmed_task_ids = models.JSONField(default=list)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("external_user_id", "status")),
            models.Index(fields=("external_user_id", "expires_at")),
        ]
