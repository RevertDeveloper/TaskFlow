import uuid

import django.core.validators
from django.db import migrations, models
from django.db.models.deletion import CASCADE


class Migration(migrations.Migration):
    dependencies = [
        ("voice", "0004_voicesession_quota_validated"),
    ]

    operations = [
        migrations.CreateModel(
            name="VoiceReviewDraft",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "external_user_id",
                    models.PositiveBigIntegerField(
                        db_index=True,
                        validators=[django.core.validators.MinValueValidator(1)],
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("confirmed", "Confirmed"), ("expired", "Expired")], default="draft", max_length=16)),
                ("schema_version", models.PositiveSmallIntegerField(default=1)),
                ("payload", models.JSONField(default=dict)),
                ("expires_at", models.DateTimeField()),
                ("confirmation_key", models.UUIDField(blank=True, null=True, unique=True)),
                ("confirmed_task_ids", models.JSONField(default=list)),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("session", models.OneToOneField(on_delete=CASCADE, related_name="review_draft", to="voice.voicesession")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["external_user_id", "status"], name="voice_voice_externa_8da396_idx"),
                    models.Index(fields=["external_user_id", "expires_at"], name="voice_voice_externa_087c70_idx"),
                ],
            },
        ),
    ]
