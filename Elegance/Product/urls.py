from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r"category-api", CategoryViewSet, basename="category-api")
router.register(r"subcategory-api", SubCategoryViewSet, basename="subcategory-api")
router.register(r"product-type-api", ProductTypeViewSet, basename="product-type-api")
router.register(r"attribute-api", AttributeViewSet, basename="attribute-api")
router.register(r"attribute-value-api", AttributeValueViewSet, basename="attribute-value-api")
router.register(r"product-api", ProductViewSet, basename="product-api")
router.register(r"product-image-api", ProductImageViewSet, basename="product-image-api")
router.register(r"product-variant-api", ProductVariantViewSet, basename="product-variant-api")
router.register(r"product-specification-api", ProductSpecificationViewSet, basename="product-specification-api")
router.register(r"product-care-instruction-api", ProductCareInstructionViewSet, basename="product-care-instruction-api")

urlpatterns = [
    path("", include(router.urls)),
    # ProductVideoViewSet only supports update/destroy (no list/create), so
    # DefaultRouter can't auto-generate its routes — register them by hand.
    path(
        "product-video-api/",
        ProductVideoViewSet.as_view({"put": "update"}),
        name="product-video-api-list",
    ),
    path(
        "product-video-api/<int:pk>/",
        ProductVideoViewSet.as_view({"put": "update", "delete": "destroy"}),
        name="product-video-api-detail",
    ),
]
