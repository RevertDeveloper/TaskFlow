from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("notes", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="folder",
            name="sync_client_version",
            field=models.PositiveBigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="folder",
            name="sync_operation_id",
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
