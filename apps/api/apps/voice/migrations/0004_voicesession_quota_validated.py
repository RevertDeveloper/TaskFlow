from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("voice", "0003_voicesession_transcript"),
    ]

    operations = [
        migrations.AddField(
            model_name="voicesession",
            name="quota_validated",
            field=models.BooleanField(default=False),
        ),
    ]