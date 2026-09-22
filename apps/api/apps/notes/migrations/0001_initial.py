import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="Folder",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("external_user_id", models.PositiveBigIntegerField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=120)),
                ("position", models.PositiveIntegerField(default=0)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="children", to="notes.folder")),
            ],
            options={"ordering": ("position", "name", "id")},
        ),
        migrations.CreateModel(
            name="Note",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("external_user_id", models.PositiveBigIntegerField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(blank=True, max_length=500)),
                ("blocks", models.JSONField(default=list)),
                ("tags", models.JSONField(blank=True, default=list)),
                ("pinned", models.BooleanField(default=False)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("sync_client_version", models.PositiveBigIntegerField(blank=True, null=True)),
                ("sync_operation_id", models.UUIDField(blank=True, null=True)),
                ("folder", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="notes", to="notes.folder")),
            ],
            options={"ordering": ("-updated_at",)},
        ),
        migrations.AddIndex(model_name="folder", index=models.Index(fields=("external_user_id", "parent", "position"), name="notes_folde_externa_7a8d8b_idx")),
        migrations.AddIndex(model_name="note", index=models.Index(fields=("external_user_id", "folder", "updated_at"), name="notes_note_externa_2c17b8_idx")),
        migrations.AddIndex(model_name="note", index=models.Index(fields=("external_user_id", "deleted_at"), name="notes_note_externa_8d7c5f_idx")),
    ]
