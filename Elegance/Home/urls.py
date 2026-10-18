from django.urls import path

from .views import (
    BannerViewSet, BannerReorderViewSet, ProductPickViewSet,
    CategoryTileViewSet, CategoryTileReorderViewSet,
    CategorySectionViewSet, CategorySectionReorderViewSet,
    CollectionViewSet, CollectionReorderViewSet,
    ProductSearchViewSet, SettingsViewSet,
)

CRUD_LIST = {"get": "list", "post": "create"}
CRUD_DETAIL = {"put": "update", "post": "update", "delete": "destroy"}

urlpatterns = [
    path("banner-api/", BannerViewSet.as_view(CRUD_LIST), name="home-banner-api"),
    path("banner-api/reorder/", BannerReorderViewSet.as_view({"post": "reorder"}), name="home-banner-reorder"),
    path("banner-api/<int:pk>/", BannerViewSet.as_view(CRUD_DETAIL), name="home-banner-detail"),

    path("product-pick-api/", ProductPickViewSet.as_view(CRUD_LIST), name="home-product-pick-api"),

    path("category-tile-api/", CategoryTileViewSet.as_view(CRUD_LIST), name="home-category-tile-api"),
    path("category-tile-api/reorder/", CategoryTileReorderViewSet.as_view({"post": "reorder"}), name="home-category-tile-reorder"),
    path("category-tile-api/<int:pk>/", CategoryTileViewSet.as_view(CRUD_DETAIL), name="home-category-tile-detail"),

    path("category-section-api/", CategorySectionViewSet.as_view(CRUD_LIST), name="home-category-section-api"),
    path("category-section-api/reorder/", CategorySectionReorderViewSet.as_view({"post": "reorder"}), name="home-category-section-reorder"),
    path("category-section-api/<int:pk>/", CategorySectionViewSet.as_view(CRUD_DETAIL), name="home-category-section-detail"),
    path("category-section-api/<int:pk>/products/", CategorySectionViewSet.as_view({"post": "set_products"}), name="home-category-section-products"),

    path("collection-api/", CollectionViewSet.as_view(CRUD_LIST), name="home-collection-api"),
    path("collection-api/reorder/", CollectionReorderViewSet.as_view({"post": "reorder"}), name="home-collection-reorder"),
    path("collection-api/<int:pk>/", CollectionViewSet.as_view(CRUD_DETAIL), name="home-collection-detail"),
    path("collection-api/<int:pk>/products/", CollectionViewSet.as_view({"post": "set_products"}), name="home-collection-products"),

    path("product-search-api/", ProductSearchViewSet.as_view({"get": "list"}), name="home-product-search-api"),
    path("settings-api/", SettingsViewSet.as_view(CRUD_LIST), name="home-settings-api"),
]
