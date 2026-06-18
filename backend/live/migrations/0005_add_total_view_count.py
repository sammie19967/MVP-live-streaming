from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('live', '0004_livesession_viewer_count_live'),
    ]

    operations = [
        migrations.AddField(
            model_name='livesession',
            name='total_view_count',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
