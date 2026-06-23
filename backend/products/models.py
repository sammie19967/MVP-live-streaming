from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import Q
from django.utils.text import slugify


class Country(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    code = models.CharField(max_length=8, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)
            slug = base
            suffix = 2
            while Country.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base}-{suffix}"
                suffix += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Category(models.Model):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    level = models.PositiveSmallIntegerField(default=1)
    full_path = models.CharField(max_length=500, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_path"]
        constraints = [
            models.UniqueConstraint(fields=["parent", "name"], name="unique_category_name_per_parent"),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)
            slug = base
            suffix = 2
            while Category.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base}-{suffix}"
                suffix += 1
            self.slug = slug

        if self.parent:
            self.level = self.parent.level + 1
            self.full_path = f"{self.parent.full_path} > {self.name}"
        else:
            self.level = 1
            self.full_path = self.name

        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_path


class Product(models.Model):
    class Condition(models.TextChoices):
        NEW = "new", "New"
        USED = "used", "Used"
        REFURBISHED = "refurbished", "Refurbished"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="products")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name="products", null=True, blank=True)
    location = models.ForeignKey("Location", on_delete=models.PROTECT, related_name="products", null=True, blank=True)
    title = models.CharField(max_length=180)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField()
    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    currency = models.CharField(max_length=8, default="KES")
    negotiable = models.BooleanField(default=True)
    discount_percent = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(100)])
    condition = models.CharField(max_length=20, choices=Condition.choices, default=Condition.USED)
    custom_fields = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["category", "is_active", "created_at"]),
            models.Index(fields=["country", "is_active"]),
            models.Index(fields=["location", "is_active"]),
            models.Index(fields=["price", "is_active"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(discount_percent__gte=0) & Q(discount_percent__lte=100),
                name="product_discount_percent_range",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)
            slug = base
            suffix = 2
            while Product.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base}-{suffix}"
                suffix += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def discounted_price(self):
        if not self.discount_percent:
            return self.price
        multiplier = (100 - self.discount_percent) / 100
        return self.price * multiplier

    def __str__(self):
        return self.title


class AttributeDefinition(models.Model):
    class DataType(models.TextChoices):
        TEXT = "text", "Text"
        NUMBER = "number", "Number"
        BOOLEAN = "boolean", "Boolean"
        SELECT = "select", "Select"

    name = models.CharField(max_length=120)
    code = models.SlugField(max_length=140)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="attribute_definitions")
    data_type = models.CharField(max_length=20, choices=DataType.choices)
    is_required = models.BooleanField(default=False)
    is_filterable = models.BooleanField(default=True)
    help_text = models.CharField(max_length=240, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category__full_path", "sort_order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["category", "code"], name="unique_attribute_code_per_category"),
        ]

    def __str__(self):
        return f"{self.category.full_path}: {self.name}"


class AttributeOption(models.Model):
    definition = models.ForeignKey(AttributeDefinition, on_delete=models.CASCADE, related_name="options")
    label = models.CharField(max_length=120)
    value = models.SlugField(max_length=140)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "label"]
        constraints = [
            models.UniqueConstraint(fields=["definition", "value"], name="unique_attribute_option_value"),
        ]

    def __str__(self):
        return f"{self.definition.name}: {self.label}"


class ProductAttributeValue(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="attribute_values")
    definition = models.ForeignKey(AttributeDefinition, on_delete=models.CASCADE, related_name="product_values")
    option = models.ForeignKey(AttributeOption, on_delete=models.SET_NULL, null=True, blank=True, related_name="product_values")
    value_text = models.CharField(max_length=255, blank=True)
    value_number = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["product", "definition"], name="unique_attribute_value_per_product"),
        ]

    def __str__(self):
        return f"{self.product.title} - {self.definition.name}"


class Location(models.Model):
    class Kind(models.TextChoices):
        COUNTY = "county", "County"
        CITY = "city", "City"
        MUNICIPALITY = "municipality", "Municipality"
        TOWN = "town", "Town"
        AREA = "area", "Area"
        SUB_LOCATION = "sub_location", "Sub-location"
        REGION = "region", "Region"
        PROVINCE = "province", "Province"
        DISTRICT = "district", "District"

    country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name="locations")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180)
    kind = models.CharField(max_length=24, choices=Kind.choices)
    level = models.PositiveSmallIntegerField(default=1)
    full_path = models.CharField(max_length=600, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_path"]
        constraints = [
            models.UniqueConstraint(fields=["country", "parent", "name"], name="unique_location_name_per_parent"),
            models.UniqueConstraint(fields=["country", "full_path"], name="unique_location_full_path_per_country"),
        ]

    def save(self, *args, **kwargs):
        if self.parent:
            self.country = self.parent.country
            self.level = self.parent.level + 1
            self.full_path = f"{self.parent.full_path} > {self.name}"
        else:
            self.level = 1
            self.full_path = self.name

        if not self.slug:
            base = slugify(self.name)
            slug = base
            suffix = 2
            while Location.objects.exclude(pk=self.pk).filter(country=self.country, slug=slug).exists():
                slug = f"{base}-{suffix}"
                suffix += 1
            self.slug = slug

        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_path


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    image = models.FileField(upload_to="product_images/")
    alt_text = models.CharField(max_length=180, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "created_at"]

    def __str__(self):
        return f"{self.product.title} image {self.sort_order}"


class ProductReview(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="product_reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    title = models.CharField(max_length=120, blank=True)
    body = models.TextField(blank=True)
    is_approved = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["product", "reviewer"], name="unique_review_per_user_per_product"),
        ]

    def __str__(self):
        return f"{self.product.title} review by {self.reviewer}"
