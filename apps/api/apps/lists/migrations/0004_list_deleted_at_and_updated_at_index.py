from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("lists", "0003_list_one_system_list_per_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="list",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="list",
            index=models.Index(
                fields=["external_user_id", "updated_at"],
                name="lists_list_externa_1e1876_idx",
            ),
        ),
    ]