from django.core.management import call_command
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
import json
from rest_framework.test import APIClient

from products.models import AttributeDefinition, AttributeOption, Category, Country, Location, Product, ProductView
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

    def test_owner_can_update_product_images_and_alt_text(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        category = Category.objects.get(full_path="Electronics & Gadgets > Mobile Phones & Tablets > Smartphones > Android Phones")
        country = Country.objects.get(name="Kenya")
        location = Location.objects.get(country=country, full_path="Nairobi > Nairobi")

        product = Product.objects.create(
            owner=self.user,
            category=category,
            country=country,
            location=location,
            title="Samsung Galaxy S24",
            description="Brand new, sealed box.",
            price="95000",
            currency="KES",
            negotiable=True,
            discount_percent=10,
            condition="new",
            custom_fields={},
        )
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
        product.images.create(image=image, alt_text="Original", sort_order=0)

        response = client.patch(
            f"/api/products/{product.slug}/manage/",
            {
                "title": "Samsung Galaxy S24 Ultra",
                "images": json.dumps([
                    {
                        "id": product.images.first().id,
                        "alt_text": "Updated hero image",
                        "sort_order": 3,
                        "keep": True,
                    }
                ]),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.title, "Samsung Galaxy S24 Ultra")
        self.assertEqual(product.images.count(), 1)
        self.assertEqual(product.images.first().alt_text, "Updated hero image")
        self.assertEqual(product.images.first().sort_order, 3)

    def test_create_product_review_updates_average_rating(self):
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

        product = Product.objects.create(
            owner=self.user,
            category=category,
            country=country,
            location=location,
            title="Samsung Galaxy S24",
            description="Brand new, sealed box.",
            price="95000",
            currency="KES",
            negotiable=True,
            discount_percent=10,
            condition="new",
            custom_fields={},
        )
        product.custom_fields = {"brand": "Samsung"}
        product.save(update_fields=["custom_fields"])

        response = self.client.post(
            f"/api/products/{product.slug}/reviews/",
            json.dumps({
                "rating": 5,
                "title": "Excellent",
                "body": "Great seller and quick delivery.",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(product.reviews.count(), 1)
        detail_response = self.client.get(f"/api/products/{product.slug}/")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data["average_rating"], 5.0)

    def test_product_detail_records_one_view_per_authenticated_user(self):
        self.client.force_login(self.user)
        category = Category.objects.get(full_path="Electronics & Gadgets > Mobile Phones & Tablets > Smartphones > Android Phones")
        country = Country.objects.get(name="Kenya")
        location = Location.objects.get(country=country, full_path="Nairobi > Nairobi")

        product = Product.objects.create(
            owner=self.user,
            category=category,
            country=country,
            location=location,
            title="Samsung Galaxy S24",
            description="Brand new, sealed box.",
            price="95000",
            currency="KES",
            negotiable=True,
            discount_percent=10,
            condition="new",
            custom_fields={},
        )

        response_1 = self.client.get(f"/api/products/{product.slug}/")
        response_2 = self.client.get(f"/api/products/{product.slug}/")

        self.assertEqual(response_1.status_code, 200)
        self.assertEqual(response_2.status_code, 200)
        self.assertEqual(ProductView.objects.filter(product=product, viewer=self.user).count(), 1)
        self.assertEqual(ProductView.objects.filter(product=product).count(), 1)
        self.assertEqual(response_2.data["view_count"], 1)


class ProductListFilterTests(TestCase):
    def setUp(self):
        call_command("seed_categories", verbosity=0)
        call_command("seed_locations", verbosity=0)
        self.user = User.objects.create_user(
            username="seller2",
            email="seller2@example.com",
            password="supersecret123",
        )
        self.country = Country.objects.get(name="Kenya")
        self.android = Category.objects.get(full_path="Electronics & Gadgets > Mobile Phones & Tablets > Smartphones > Android Phones")
        lineage_ids = []
        current = self.android
        while current is not None:
            lineage_ids.append(current.id)
            current = current.parent
        self.other_category = Category.objects.exclude(id__in=lineage_ids).filter(is_active=True).order_by("full_path").first()
        self.nairobi = Location.objects.get(country=self.country, full_path="Nairobi > Nairobi")
        self.kisumu = Location.objects.get(country=self.country, full_path="Kisumu > Kisumu")

        self.phone = Product.objects.create(
            owner=self.user,
            category=self.android,
            country=self.country,
            location=self.nairobi,
            title="Samsung Galaxy S24",
            description="Flagship phone",
            price="95000",
            currency="KES",
            negotiable=True,
            discount_percent=0,
            condition="new",
            custom_fields={},
        )
        self.other = Product.objects.create(
            owner=self.user,
            category=self.other_category,
            country=self.country,
            location=self.kisumu,
            title="Nokia 3310",
            description="Classic phone",
            price="4500",
            currency="KES",
            negotiable=False,
            discount_percent=0,
            condition="used",
            custom_fields={},
        )

    def test_product_list_can_filter_by_search_term(self):
        response = self.client.get("/api/products/?q=samsung")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["id"], self.phone.id)

    def _category_path(self, category):
        ids = []
        current = category
        while current is not None:
            ids.append(str(current.id))
            current = current.parent
        return ".".join(reversed(ids))

    def test_product_list_can_filter_by_category(self):
        response = self.client.get(f"/api/products/?category={self.android.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["id"] for item in response.data["results"]}, {self.phone.id})

    def test_product_list_can_filter_by_category_path(self):
        response = self.client.get(f"/api/products/?category={self._category_path(self.android)}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["id"] for item in response.data["results"]}, {self.phone.id})

    def _location_path(self, location):
        ids = []
        current = location
        while current is not None:
            ids.append(str(current.id))
            current = current.parent
        return ".".join(reversed(ids))

    def test_product_list_can_filter_by_location_and_price(self):
        response = self.client.get(f"/api/products/?location={self.kisumu.id}&min_price=1000&max_price=5000")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["id"], self.other.id)

    def test_product_list_can_filter_by_location_path(self):
        response = self.client.get(f"/api/products/?country={self.country.id}&location={self._location_path(self.kisumu)}&min_price=1000&max_price=5000")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["id"], self.other.id)



