from django.core.management import call_command
from django.test import TestCase

from products.models import Category, Country, Location


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
