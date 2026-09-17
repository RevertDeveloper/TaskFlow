from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tasks", "0002_alter_task_external_user_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="sync_client_version",
            field=models.PositiveBigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="task",
            name="sync_operation_id",
            field=models.UUIDField(blank=True, null=True),
        ),
    ]