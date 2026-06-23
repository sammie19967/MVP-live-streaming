import json
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from products.models import Country, Location


def slugify_unique(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


class Command(BaseCommand):
    help = "Seed country and location data from backend/kenya_towns_cities.json"

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            default="kenya_towns_cities.json",
            help="Path to the location JSON source file relative to BASE_DIR.",
        )

    def handle(self, *args, **options):
        source_path = Path(options["source"])
        if not source_path.is_absolute():
            source_path = settings.BASE_DIR / source_path

        if not source_path.exists():
            raise CommandError(f"Location source file not found: {source_path}")

        kenya_country, _ = Country.objects.get_or_create(
            name="Kenya",
            defaults={"slug": "kenya", "code": "KE"},
        )
        Country.objects.get_or_create(
            name="China",
            defaults={"slug": "china", "code": "CN"},
        )

        payload = json.loads(source_path.read_text(encoding="utf-8"))
        created = 0

        for city_name, entry in payload.items():
            county_name = entry.get("county") or "Unknown"
            kind = entry.get("type") or "town"
            sub_locations = entry.get("sub_locations") or []

            county, _ = self._get_or_create_location(
                country=kenya_country,
                parent=None,
                name=county_name,
                kind="county",
            )
            city, city_created = self._get_or_create_location(
                country=kenya_country,
                parent=county,
                name=city_name,
                kind=kind,
            )
            if city_created:
                created += 1

            for sub_location in sub_locations:
                _, sub_created = self._get_or_create_location(
                    country=kenya_country,
                    parent=city,
                    name=sub_location,
                    kind="sub_location",
                )
                if sub_created:
                    created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded Kenya locations from {source_path.name}. China country created as a placeholder."
            )
        )

    def _get_or_create_location(self, country, parent, name, kind):
        slug_base = slugify_unique(name)
        obj, created = Location.objects.get_or_create(
            country=country,
            parent=parent,
            name=name,
            defaults={
                "kind": kind,
                "slug": slug_base,
                "full_path": "",
            },
        )
        if obj.kind != kind:
            obj.kind = kind
            obj.save(update_fields=["kind"])
        return obj, created
