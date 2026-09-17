from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("voice", "0002_alter_voicesession_external_user_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="voicesession",
            name="transcript",
            field=models.TextField(blank=True),
        ),
    ]