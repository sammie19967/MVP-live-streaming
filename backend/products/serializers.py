from rest_framework import serializers

from products.models import (
    AttributeDefinition,
    AttributeOption,
    Category,
    Country,
    Location,
    Product,
    ProductAttributeValue,
    ProductImage,
    ProductReview,
)
from users.serializers import UserSerializer


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = ["id", "name", "slug", "code"]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "level", "full_path"]


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "slug", "kind", "level", "full_path", "parent", "country"]


class AttributeOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttributeOption
        fields = ["id", "label", "value", "sort_order"]


class AttributeDefinitionSerializer(serializers.ModelSerializer):
    options = AttributeOptionSerializer(many=True, read_only=True)

    class Meta:
        model = AttributeDefinition
        fields = [
            "id",
            "name",
            "code",
            "category",
            "data_type",
            "is_required",
            "is_filterable",
            "help_text",
            "sort_order",
            "options",
        ]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "alt_text", "sort_order", "created_at"]


class ProductReviewSerializer(serializers.ModelSerializer):
    reviewer = UserSerializer(read_only=True)

    class Meta:
        model = ProductReview
        fields = ["id", "reviewer", "rating", "title", "body", "is_approved", "created_at"]


class ProductAttributeValueSerializer(serializers.ModelSerializer):
    definition = AttributeDefinitionSerializer(read_only=True)
    option = AttributeOptionSerializer(read_only=True)

    class Meta:
        model = ProductAttributeValue
        fields = ["id", "definition", "option", "value_text", "value_number", "value_boolean"]


class ProductSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    category = CategorySerializer(read_only=True)
    country = CountrySerializer(read_only=True)
    location = LocationSerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    reviews = ProductReviewSerializer(many=True, read_only=True)
    attribute_values = ProductAttributeValueSerializer(many=True, read_only=True)
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "owner",
            "category",
            "country",
            "location",
            "title",
            "slug",
            "description",
            "price",
            "currency",
            "negotiable",
            "discount_percent",
            "condition",
            "custom_fields",
            "is_active",
            "created_at",
            "updated_at",
            "images",
            "reviews",
            "attribute_values",
            "average_rating",
            "review_count",
            "effective_price",
        ]
        read_only_fields = [
            "id",
            "owner",
            "slug",
            "created_at",
            "updated_at",
            "images",
            "reviews",
            "attribute_values",
            "average_rating",
            "review_count",
            "effective_price",
        ]

    def get_average_rating(self, obj):
        approved_reviews = obj.reviews.filter(is_approved=True)
        if not approved_reviews.exists():
            return None
        return round(sum(review.rating for review in approved_reviews) / approved_reviews.count(), 2)

    def get_review_count(self, obj):
        return obj.reviews.filter(is_approved=True).count()

    def get_effective_price(self, obj):
        return float(obj.discounted_price)


class ProductCreateSerializer(serializers.ModelSerializer):
    image_urls = serializers.ListField(
        child=serializers.URLField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    attribute_values = serializers.ListField(required=False, allow_empty=True, write_only=True)

    class Meta:
        model = Product
        fields = [
            "category",
            "country",
            "location",
            "title",
            "description",
            "price",
            "currency",
            "negotiable",
            "discount_percent",
            "condition",
            "custom_fields",
            "attribute_values",
            "image_urls",
        ]

    def validate(self, attrs):
        country = attrs.get("country")
        location = attrs.get("location")
        if country is not None and location is not None and location.country_id != country.id:
            raise serializers.ValidationError({"location": "Selected location must belong to the selected country."})

        category = attrs.get("category")
        attribute_values = attrs.get("attribute_values") or []
        if category is not None:
            required_definitions = AttributeDefinition.objects.filter(
                is_active=True,
                is_required=True,
                category__in=self._category_lineage(category),
            ).select_related("category").prefetch_related("options")

            provided_definition_ids = {
                item.get("definition")
                for item in attribute_values
                if isinstance(item, dict) and item.get("definition")
            }

            missing = [definition.name for definition in required_definitions if definition.id not in provided_definition_ids]
            if missing:
                raise serializers.ValidationError(
                    {"attribute_values": f"Missing required fields: {', '.join(missing)}."}
                )
        return attrs

    def create(self, validated_data):
        image_urls = validated_data.pop("image_urls", [])
        attribute_values = validated_data.pop("attribute_values", [])
        product = Product.objects.create(owner=self.context["request"].user, **validated_data)
        if attribute_values:
            self._create_attribute_values(product, attribute_values)
        for index, image_url in enumerate(image_urls):
            ProductImage.objects.create(product=product, image=image_url, sort_order=index)
        return product

    def _create_attribute_values(self, product, attribute_values):
        definitions = {
            definition.id: definition
            for definition in AttributeDefinition.objects.filter(
                id__in=[item.get("definition") for item in attribute_values if item.get("definition")]
            ).prefetch_related("options")
        }
        for item in attribute_values:
            definition = definitions.get(item.get("definition"))
            if not definition:
                continue
            option = None
            option_id = item.get("option")
            if option_id:
                option = definition.options.filter(id=option_id, is_active=True).first()
            resolved_value = None
            if option is not None:
                resolved_value = option.label
            elif definition.data_type == "text":
                resolved_value = item.get("value_text", "") or ""
            elif definition.data_type == "number":
                resolved_value = item.get("value_number")
            elif definition.data_type == "boolean":
                resolved_value = item.get("value_boolean")

            ProductAttributeValue.objects.create(
                product=product,
                definition=definition,
                option=option,
                value_text=item.get("value_text", "") or "",
                value_number=item.get("value_number") or None,
                value_boolean=item.get("value_boolean") if "value_boolean" in item else None,
            )
            if resolved_value not in (None, ""):
                product.custom_fields[definition.code] = resolved_value

        if product.custom_fields:
            product.save(update_fields=["custom_fields"])

    def _category_lineage(self, category):
        lineage = []
        current = category
        while current is not None:
            lineage.append(current)
            current = current.parent
        return lineage
