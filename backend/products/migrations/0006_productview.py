from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0005_drop_legacy_product_location_column"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductView",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="views", to="products.product")),
                ("viewer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="product_views", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="productview",
            constraint=models.UniqueConstraint(fields=("product", "viewer"), name="unique_view_per_user_per_product"),
        ),
    ]
