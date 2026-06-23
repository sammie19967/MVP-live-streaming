from django.core.management.base import BaseCommand
from django.utils.text import slugify

from products.models import AttributeDefinition, AttributeOption, Category


ATTRIBUTE_SPEC = {
    "Electronics & Gadgets > Mobile Phones & Tablets > Smartphones > Android Phones": [
        {
            "name": "Brand",
            "data_type": "select",
            "required": True,
            "filterable": True,
            "options": ["Samsung", "Nokia", "HTC", "Tecno", "Infinix", "Xiaomi", "Oppo", "Vivo", "Huawei", "Google"],
        },
        {"name": "RAM", "data_type": "select", "required": True, "filterable": True, "options": ["2 GB", "4 GB", "6 GB", "8 GB", "12 GB", "16 GB"]},
        {"name": "Storage", "data_type": "select", "required": True, "filterable": True, "options": ["16 GB", "32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB"]},
        {"name": "Color", "data_type": "select", "required": False, "filterable": True, "options": ["Black", "White", "Blue", "Green", "Red", "Gold", "Silver"]},
        {"name": "Condition Notes", "data_type": "text", "required": False, "filterable": False, "options": []},
    ],
    "Electronics & Gadgets > Computers & Laptops > Laptops": [
        {
            "name": "Brand",
            "data_type": "select",
            "required": True,
            "filterable": True,
            "options": ["HP", "Dell", "Lenovo", "Apple", "Asus", "Acer", "MSI", "Huawei", "Microsoft"],
        },
        {"name": "RAM", "data_type": "select", "required": True, "filterable": True, "options": ["4 GB", "8 GB", "16 GB", "32 GB", "64 GB"]},
        {"name": "Storage", "data_type": "select", "required": True, "filterable": True, "options": ["128 GB SSD", "256 GB SSD", "512 GB SSD", "1 TB SSD", "1 TB HDD", "2 TB HDD"]},
        {"name": "Processor", "data_type": "select", "required": True, "filterable": True, "options": ["Intel Core i3", "Intel Core i5", "Intel Core i7", "Intel Core i9", "AMD Ryzen 3", "AMD Ryzen 5", "AMD Ryzen 7"]},
    ],
    "Vehicles > Cars": [
        {"name": "Make", "data_type": "select", "required": True, "filterable": True, "options": ["Toyota", "Mazda", "Nissan", "Honda", "Subaru", "BMW", "Mercedes-Benz", "Volkswagen", "Hyundai", "Kia"]},
        {"name": "Model", "data_type": "text", "required": True, "filterable": True, "options": []},
        {"name": "Year", "data_type": "number", "required": True, "filterable": True, "options": []},
        {"name": "Mileage", "data_type": "number", "required": False, "filterable": True, "options": []},
        {"name": "Transmission", "data_type": "select", "required": False, "filterable": True, "options": ["Automatic", "Manual", "CVT"]},
        {"name": "Fuel Type", "data_type": "select", "required": False, "filterable": True, "options": ["Petrol", "Diesel", "Hybrid", "Electric"]},
    ],
    "Vehicles > Motorcycles & Scooters > Motorcycles": [
        {"name": "Brand", "data_type": "select", "required": True, "filterable": True, "options": ["Honda", "Yamaha", "Suzuki", "Kawasaki", "Bajaj", "TVS", "Hero"]},
        {"name": "Model", "data_type": "text", "required": True, "filterable": True, "options": []},
        {"name": "Engine Capacity", "data_type": "select", "required": True, "filterable": True, "options": ["50cc", "100cc", "125cc", "150cc", "200cc", "250cc", "400cc", "600cc"]},
    ],
}


class Command(BaseCommand):
    help = "Seed attribute definitions and options for products"

    def handle(self, *args, **options):
        created_definitions = 0
        created_options = 0

        for category_path, attributes in ATTRIBUTE_SPEC.items():
            category = Category.objects.filter(full_path=category_path).first()
            if not category:
                self.stdout.write(self.style.WARNING(f"Skipping missing category: {category_path}"))
                continue

            for sort_order, spec in enumerate(attributes):
                definition, was_created = AttributeDefinition.objects.get_or_create(
                    category=category,
                    code=slugify(spec["name"]),
                    defaults={
                        "name": spec["name"],
                        "data_type": spec["data_type"],
                        "is_required": spec["required"],
                        "is_filterable": spec["filterable"],
                        "sort_order": sort_order,
                    },
                )
                if was_created:
                    created_definitions += 1
                for opt_order, option_label in enumerate(spec["options"]):
                    _, option_created = AttributeOption.objects.get_or_create(
                        definition=definition,
                        value=slugify(option_label),
                        defaults={"label": option_label, "sort_order": opt_order},
                    )
                    if option_created:
                        created_options += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created_definitions} attribute definitions and {created_options} options."
            )
        )
