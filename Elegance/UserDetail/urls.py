from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r"otp-api", OtpAuthViewSet, basename="otp-api")
router.register(r"admin-login-api", AdminLoginViewSet, basename="admin-login-api")
router.register(r"logout-api", LogoutViewSet, basename="logout-api")
router.register(r"session-api", SessionViewSet, basename="session-api")
router.register(r"profile-api", ProfileViewSet, basename="profile-api")
router.register(r"address-api", AddressViewSet, basename="address-api")
router.register(r"admin-users-api", AdminUserViewSet, basename="admin-users-api")

urlpatterns = [
    path("", include(router.urls)),
]
