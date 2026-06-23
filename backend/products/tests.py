from django.core.management import call_command
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
import json
from rest_framework.test import APIClient

from products.models import AttributeDefinition, AttributeOption, Category, Country, Location, Product
from users.models import User


class CategorySeedTests(TestCase):
    def test_seed_categories_creates_nested_tree(self):
        call_command("seed_categories", verbosity=0)

        self.assertTrue(Category.objects.filter(name="Electronics & Gadgets", parent__isnull=True).exists())
        android = Category.objects.get(full_path="Electronics & Gadgets > Mobile Phones & Tablets > Smartphones > Android Phones")
        self.assertEqual(android.level, 4)
        self.assertEqual(android.parent.name, "Smartphones")


class LocationSeedTests(TestCase):
    def test_seed_locations_creates_country_and_nested_places(self):
        call_command("seed_locations", verbosity=0)

        kenya = Country.objects.get(name="Kenya")
        china = Country.objects.get(name="China")
        self.assertTrue(kenya.is_active)
        self.assertTrue(china.is_active)

        nairobi = Location.objects.get(country=kenya, full_path="Nairobi > Nairobi")
        self.assertEqual(nairobi.parent.name, "Nairobi")
        self.assertEqual(nairobi.country, kenya)
        westlands = Location.objects.get(country=kenya, full_path="Nairobi > Nairobi > Westlands")
        self.assertEqual(westlands.parent.name, "Nairobi")


class ProductCreateTests(TestCase):
    def setUp(self):
        call_command("seed_categories", verbosity=0)
        call_command("seed_locations", verbosity=0)
        call_command("seed_attributes", verbosity=0)
        self.user = User.objects.create_user(
            username="seller",
            email="seller@example.com",
            password="supersecret123",
        )

    def test_create_product_with_attributes_succeeds(self):
        self.client.force_login(self.user)
        category = Category.objects.get(full_path="Electronics & Gadgets > Mobile Phones & Tablets > Smartphones > Android Phones")
        country = Country.objects.get(name="Kenya")
        location = Location.objects.get(country=country, full_path="Nairobi > Nairobi")
        brand_def = AttributeDefinition.objects.get(category=category, code="brand")
        ram_def = AttributeDefinition.objects.get(category=category, code="ram")
        storage_def = AttributeDefinition.objects.get(category=category, code="storage")
        brand_opt = AttributeOption.objects.get(definition=brand_def, value="samsung")
        ram_opt = AttributeOption.objects.get(definition=ram_def, value="8-gb")
        storage_opt = AttributeOption.objects.get(definition=storage_def, value="128-gb")

        response = self.client.post(
            "/api/products/create/",
            json.dumps({
                "category": category.id,
                "country": country.id,
                "location": location.id,
                "title": "Samsung Galaxy S24",
                "description": "Brand new, sealed box.",
                "price": "95000",
                "currency": "KES",
                "negotiable": True,
                "discount_percent": 10,
                "condition": "new",
                "custom_fields": {},
                "attribute_values": [
                    {
                        "definition": brand_def.id,
                        "option": brand_opt.id,
                    }
                    ,
                    {
                        "definition": ram_def.id,
                        "option": ram_opt.id,
                    },
                    {
                        "definition": storage_def.id,
                        "option": storage_opt.id,
                    },
                ],
                "image_urls": [],
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("message", response.data)
        self.assertIn("product", response.data)
        self.assertEqual(response.data["product"]["title"], "Samsung Galaxy S24")
        product = Product.objects.get(title="Samsung Galaxy S24")
        self.assertEqual(product.custom_fields["brand"], "Samsung")

    def test_create_product_with_uploaded_image_succeeds(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        category = Category.objects.get(full_path="Electronics & Gadgets > Mobile Phones & Tablets > Smartphones > Android Phones")
        country = Country.objects.get(name="Kenya")
        location = Location.objects.get(country=country, full_path="Nairobi > Nairobi")
        brand_def = AttributeDefinition.objects.get(category=category, code="brand")
        ram_def = AttributeDefinition.objects.get(category=category, code="ram")
        storage_def = AttributeDefinition.objects.get(category=category, code="storage")
        brand_opt = AttributeOption.objects.get(definition=brand_def, value="samsung")
        ram_opt = AttributeOption.objects.get(definition=ram_def, value="8-gb")
        storage_opt = AttributeOption.objects.get(definition=storage_def, value="128-gb")

        image = SimpleUploadedFile(
            "phone.gif",
            (
                b"GIF89a"
                b"\x01\x00\x01\x00"
                b"\x80"
                b"\x00"
                b"\x00"
                b"\x00\x00\x00"
                b"\xff\xff\xff"
                b"!\xf9\x04\x01\x00\x00\x00\x00"
                b",\x00\x00\x00\x00\x01\x00\x01\x00\x00"
                b"\x02\x02D\x01\x00;"
            ),
            content_type="image/gif",
        )

        response = client.post(
            "/api/products/create/",
            {
                "category": category.id,
                "country": country.id,
                "location": location.id,
                "title": "Samsung Galaxy S24",
                "description": "Brand new, sealed box.",
                "price": "95000",
                "currency": "KES",
                "negotiable": True,
                "discount_percent": 10,
                "condition": "new",
                "custom_fields": json.dumps({}),
                "attribute_values": json.dumps([
                    {
                        "definition": brand_def.id,
                        "option": brand_opt.id,
                    },
                    {
                        "definition": ram_def.id,
                        "option": ram_opt.id,
                    },
                    {
                        "definition": storage_def.id,
                        "option": storage_opt.id,
                    },
                ]),
                "image_files": image,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        product = Product.objects.get(title="Samsung Galaxy S24")
        self.assertEqual(product.images.count(), 1)
        self.assertTrue(product.images.first().image.name.startswith("product_images/"))
