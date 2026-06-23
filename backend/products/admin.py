from django.contrib import admin

from products.models import Category, Country, Location, Product, ProductImage, ProductReview


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    search_fields = ("name", "code", "slug")
    list_filter = ("is_active",)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("full_path", "level", "parent", "is_active")
    list_filter = ("level", "is_active")
    search_fields = ("name", "full_path", "slug")
    ordering = ("full_path",)


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("full_path", "country", "kind", "level", "parent", "is_active")
    list_filter = ("country", "kind", "level", "is_active")
    search_fields = ("name", "full_path", "slug", "country__name")


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0


class ProductReviewInline(admin.TabularInline):
    model = ProductReview
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "owner", "price", "discount_percent", "negotiable", "is_active", "created_at")
    list_filter = ("is_active", "negotiable", "condition", "category")
    search_fields = ("title", "description", "location", "slug")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [ProductImageInline, ProductReviewInline]


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ("product", "sort_order", "created_at")
    search_fields = ("product__title", "alt_text")


@admin.register(ProductReview)
class ProductReviewAdmin(admin.ModelAdmin):
    list_display = ("product", "reviewer", "rating", "is_approved", "created_at")
    list_filter = ("rating", "is_approved")
    search_fields = ("product__title", "reviewer__username", "title", "body")
