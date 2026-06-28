from decimal import Decimal

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from products.models import AttributeDefinition, Category, Country, Location, Product, ProductView
from products.serializers import (
    AttributeDefinitionSerializer,
    CategorySerializer,
    CountrySerializer,
    LocationSerializer,
    ProductCreateSerializer,
    ProductReviewCreateSerializer,
    ProductSerializer,
)


class ProductMetaView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        countries = Country.objects.filter(is_active=True).order_by("name")
        categories = Category.objects.filter(is_active=True).order_by("full_path")
        locations = Location.objects.filter(is_active=True).order_by("full_path")
        attributes = (
            AttributeDefinition.objects.filter(is_active=True)
            .select_related("category")
            .prefetch_related("options")
            .order_by("category__full_path", "sort_order", "name")
        )
        return Response(
            {
                "countries": CountrySerializer(countries, many=True).data,
                "categories": CategorySerializer(categories, many=True).data,
                "locations": LocationSerializer(locations, many=True).data,
                "attributes": AttributeDefinitionSerializer(attributes, many=True).data,
            }
        )


class ProductCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request):
        serializer = ProductCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(
            {
                "message": f"Product '{product.title}' created successfully.",
                "product": ProductSerializer(product, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ProductListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        products = (
            Product.objects.filter(is_active=True)
            .select_related("owner", "category", "country", "location")
            .prefetch_related("images", "reviews")
        )
        products = self.apply_filters(products, request)
        paginator = PageNumberPagination()
        paginator.page_size = self._parse_int(request.query_params.get("page_size"), default=24, minimum=1, maximum=96)
        page = paginator.paginate_queryset(products, request)
        serializer = ProductSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

    def apply_filters(self, queryset, request):
        params = request.query_params

        query = (params.get("q") or params.get("search") or "").strip()
        if query:
            queryset = queryset.filter(
                Q(title__icontains=query)
                | Q(description__icontains=query)
                | Q(category__full_path__icontains=query)
                | Q(location__full_path__icontains=query)
                | Q(country__name__icontains=query)
                | Q(custom_fields__icontains=query)
            )

        category_id = params.get("category")
        if category_id:
            category = self._resolve_category_filter(category_id)
            if category:
                queryset = queryset.filter(category__full_path__startswith=category.full_path)

        country_id = params.get("country")
        if country_id:
            queryset = queryset.filter(country_id=country_id)

        location_id = params.get("location")
        if location_id:
            location = self._resolve_location_filter(location_id)
            if location:
                queryset = queryset.filter(location__full_path__startswith=location.full_path)

        condition = params.get("condition")
        if condition in Product.Condition.values:
            queryset = queryset.filter(condition=condition)

        negotiable = params.get("negotiable")
        if negotiable not in (None, ""):
            normalized = str(negotiable).strip().lower()
            if normalized in {"1", "true", "yes"}:
                queryset = queryset.filter(negotiable=True)
            elif normalized in {"0", "false", "no"}:
                queryset = queryset.filter(negotiable=False)

        min_price = self._parse_decimal(params.get("min_price"))
        max_price = self._parse_decimal(params.get("max_price"))
        if min_price is not None:
            queryset = queryset.filter(price__gte=min_price)
        if max_price is not None:
            queryset = queryset.filter(price__lte=max_price)

        ordering = (params.get("ordering") or params.get("sort") or "newest").strip()
        sort_map = {
            "newest": "-created_at",
            "oldest": "created_at",
            "price_low": "price",
            "price_high": "-price",
        }
        return queryset.order_by(sort_map.get(ordering, "-created_at"))

    def _resolve_category_filter(self, value):
        raw_value = str(value).strip()
        if not raw_value:
            return None

        selected_id = raw_value.split(".")[-1]
        if not selected_id.isdigit():
            return None

        return Category.objects.filter(id=selected_id, is_active=True).first()

    def _resolve_location_filter(self, value):
        raw_value = str(value).strip()
        if not raw_value:
            return None

        selected_id = raw_value.split(".")[-1]
        if not selected_id.isdigit():
            return None

        return Location.objects.filter(id=selected_id, is_active=True).first()

    def _parse_decimal(self, value):
        if value in (None, ""):
            return None
        try:
            return Decimal(str(value))
        except Exception:
            return None

    def _parse_int(self, value, default, minimum=None, maximum=None):
        if value in (None, ""):
            return default
        try:
            parsed = int(str(value))
        except Exception:
            return default
        if minimum is not None:
            parsed = max(minimum, parsed)
        if maximum is not None:
            parsed = min(maximum, parsed)
        return parsed


class ProductDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        product = get_object_or_404(Product, slug=slug, is_active=True)
        if request.user.is_authenticated:
            ProductView.objects.get_or_create(product=product, viewer=request.user)
        product = (
            Product.objects.select_related("owner", "category", "country", "location")
            .prefetch_related("images", "reviews__reviewer", "attribute_values__definition", "attribute_values__option")
            .get(pk=product.pk)
        )
        return Response(ProductSerializer(product, context={"request": request}).data)


class ProductReviewCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, slug):
        product = get_object_or_404(Product, slug=slug, is_active=True)
        serializer = ProductReviewCreateSerializer(data=request.data, context={"request": request, "product": product})
        serializer.is_valid(raise_exception=True)
        review = serializer.save()
        return Response(ProductReviewCreateSerializer(review, context={"request": request}).data, status=status.HTTP_201_CREATED)




