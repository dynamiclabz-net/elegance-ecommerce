from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *
from .invoice_views import order_invoice
from .payment_views import (
    AdminPaymentSyncViewSet, OrderPaymentViewSet, PaymentVerifyViewSet,
    razorpay_return, razorpay_webhook,
)

router = DefaultRouter()
router.register(r"admin-order-api", AdminOrderViewSet, basename="admin-order-api")
router.register(r"admin-pincode-rate-api", AdminPincodeRateViewSet, basename="admin-pincode-rate-api")
router.register(r"pincode-rate-api", PincodeRateViewSet, basename="pincode-rate-api")
router.register(r"my-order-api", MyOrderViewSet, basename="my-order-api")
router.register(r"cart-api", CartViewSet, basename="cart-api")
router.register(r"checkout-api", CheckoutViewSet, basename="checkout-api")
router.register(r"payment-verify-api", PaymentVerifyViewSet, basename="payment-verify-api")
router.register(r"order-payment-api", OrderPaymentViewSet, basename="order-payment-api")
router.register(r"admin-payment-sync-api", AdminPaymentSyncViewSet, basename="admin-payment-sync-api")

urlpatterns = [
    # Shiprocket rejects webhook URLs containing "shiprocket", "sr", "kr" etc., so
    # the dashboard must use the neutral `courier-updates` path.
    path("webhooks/courier-updates/", ShiprocketWebhookView.as_view(), name="courier-updates-webhook"),
    path("webhooks/shiprocket/", ShiprocketWebhookView.as_view(), name="shiprocket-webhook"),
    path("webhooks/razorpay/", razorpay_webhook, name="razorpay-webhook"),
    path("payment-return/<int:order_id>/", razorpay_return, name="razorpay-return"),
    path("invoice/<str:order_number>/", order_invoice, name="order-invoice"),
    path("", include(router.urls)),
]
