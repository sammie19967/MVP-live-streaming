from django.urls import path

from products.views import ProductCreateView, ProductListView, ProductMetaView

urlpatterns = [
    path("meta/", ProductMetaView.as_view(), name="product-meta"),
    path("", ProductListView.as_view(), name="product-list"),
    path("create/", ProductCreateView.as_view(), name="product-create"),
]
