import ast
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from products.models import Category


class Command(BaseCommand):
    help = "Seed category taxonomy from backend/categories.txt"

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            default="categories.txt",
            help="Path to the taxonomy source file relative to BASE_DIR.",
        )

    def handle(self, *args, **options):
        source_path = Path(options["source"])
        if not source_path.is_absolute():
            from django.conf import settings

            source_path = settings.BASE_DIR / source_path

        if not source_path.exists():
            raise CommandError(f"Category source file not found: {source_path}")

        tree = self._load_taxonomy(source_path)
        created = 0
        categories_by_path: dict[tuple[str, ...], Category] = {}

        for path in tree:
            parent = None
            path_parts: list[str] = []
            for name in path:
                path_parts.append(name)
                key = tuple(path_parts)
                category = categories_by_path.get(key)
                if category is None:
                    category, was_created = Category.objects.get_or_create(
                        parent=parent,
                        name=name,
                        defaults={"full_path": " > ".join(path_parts)},
                    )
                    if was_created:
                        created += 1
                    categories_by_path[key] = category
                parent = category

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded categories from {source_path.name}: {created} created."
            )
        )

    def _load_taxonomy(self, source_path: Path) -> list[list[str]]:
        module = ast.parse(source_path.read_text(encoding="utf-8"))
        taxonomy_data = None
        for node in module.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "taxonomy_data":
                        taxonomy_data = ast.literal_eval(node.value)
                        break
            if taxonomy_data is not None:
                break

        if taxonomy_data is None:
            raise CommandError("taxonomy_data list not found in source file.")

        paths: list[list[str]] = []
        for row in taxonomy_data:
            if not isinstance(row, (list, tuple)):
                continue
            parts = [part for part in row if part]
            if parts:
                paths.append(parts)

        return paths
