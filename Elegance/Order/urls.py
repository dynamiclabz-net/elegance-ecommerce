from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r"admin-order-api", AdminOrderViewSet, basename="admin-order-api")
router.register(r"admin-pincode-rate-api", AdminPincodeRateViewSet, basename="admin-pincode-rate-api")
router.register(r"pincode-rate-api", PincodeRateViewSet, basename="pincode-rate-api")
router.register(r"my-order-api", MyOrderViewSet, basename="my-order-api")
router.register(r"cart-api", CartViewSet, basename="cart-api")
router.register(r"checkout-api", CheckoutViewSet, basename="checkout-api")
router.register(r"payment-verify-api", PaymentVerifyViewSet, basename="payment-verify-api")

urlpatterns = [
    path("webhooks/shiprocket/", ShiprocketWebhookView.as_view(), name="shiprocket-webhook"),
    path("", include(router.urls)),
]
