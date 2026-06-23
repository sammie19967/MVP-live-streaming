from django.db.models import Prefetch
from rest_framework import permissions, status
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from products.models import AttributeDefinition, Category, Country, Location, Product
from products.serializers import (
    AttributeDefinitionSerializer,
    CategorySerializer,
    CountrySerializer,
    LocationSerializer,
    ProductCreateSerializer,
    ProductSerializer,
)


class ProductMetaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        countries = Country.objects.filter(is_active=True).order_by("name")
        categories = Category.objects.filter(is_active=True).order_by("full_path")
        locations = Location.objects.filter(is_active=True).order_by("full_path")
        attributes = AttributeDefinition.objects.filter(is_active=True).select_related("category").prefetch_related("options").order_by("category__full_path", "sort_order", "name")
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
        return Response(ProductSerializer(products, many=True, context={"request": request}).data)
