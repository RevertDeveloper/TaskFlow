from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("lists", "0004_list_deleted_at_and_updated_at_index"),
    ]

    operations = [
        migrations.AddField(
            model_name="list",
            name="sync_client_version",
            field=models.PositiveBigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="list",
            name="sync_operation_id",
            field=models.UUIDField(blank=True, null=True),
        ),
    ]