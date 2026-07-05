from django.urls import path

from products.views import (
    ProductCreateView,
    ProductDetailView,
    ProductListView,
    ProductMetaView,
    ProductOwnerDetailView,
    ProductReviewCreateView,
)

urlpatterns = [
    path("meta/", ProductMetaView.as_view(), name="product-meta"),
    path("", ProductListView.as_view(), name="product-list"),
    path("create/", ProductCreateView.as_view(), name="product-create"),
    path("<slug:slug>/", ProductDetailView.as_view(), name="product-detail"),
    path("<slug:slug>/manage/", ProductOwnerDetailView.as_view(), name="product-manage"),
    path("<slug:slug>/reviews/", ProductReviewCreateView.as_view(), name="product-review-create"),
]
