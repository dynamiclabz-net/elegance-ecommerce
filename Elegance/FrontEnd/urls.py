from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r"admin-login", AdminLoginPageViewSet, basename="admin-login")
router.register(r"admin-dashboard", AdminDashboardViewSet, basename="admin-dashboard")
router.register(r"admin-categories", AdminCategoriesPageViewSet, basename="admin-categories")
router.register(r"admin-pincodes", AdminPincodesPageViewSet, basename="admin-pincodes")
router.register(r"admin-homepage", AdminHomepagePageViewSet, basename="admin-homepage")
router.register(r"home", HomePageViewSet, basename="home")
router.register(r"admin-products", AdminProductsPageViewSet, basename="admin-products")
router.register(r"admin-product-form", AdminProductFormPageViewSet, basename="admin-product-form")
router.register(r"admin-orders", AdminOrdersPageViewSet, basename="admin-orders")
router.register(r"admin-order-detail", AdminOrderDetailPageViewSet, basename="admin-order-detail")
router.register(r"admin-packing-slip", AdminPackingSlipPageViewSet, basename="admin-packing-slip")

# Customer-facing pages
router.register(r"account", AccountPageViewSet, basename="account")
router.register(r"shop", ShopPageViewSet, basename="shop")
router.register(r"product", ProductDetailPageViewSet, basename="product")
router.register(r"cart", CartPageViewSet, basename="cart")
router.register(r"checkout", CheckoutPageViewSet, basename="checkout")
router.register(r"payment-callback", PaymentCallbackPageViewSet, basename="payment-callback")
router.register(r"order-detail", OrderDetailPageViewSet, basename="order-detail")

urlpatterns = [
    path("", include(router.urls)),
]
