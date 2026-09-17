from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("sync", "0002_alter_syncoperation_external_user_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="syncoperation",
            name="error_code",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="syncoperation",
            name="result",
            field=models.CharField(
                choices=[
                    ("accepted", "Accepted"),
                    ("rejected", "Rejected"),
                    ("conflict", "Conflict"),
                ],
                default="accepted",
                max_length=16,
            ),
        ),
    ]