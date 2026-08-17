import random
from datetime import timedelta

from django.contrib.auth import authenticate, login, logout
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.response import Response

from utils.decorators import handle_exceptions, check_authentication

from .models import User, OTPVerification, Address
from .serializers import UserSerializer, AddressSerializer


# ─────────────────────────────────────────────
# Customer auth — mobile number + OTP
# ─────────────────────────────────────────────
class OtpAuthViewSet(viewsets.ViewSet):
    """POST /user-api/otp-api/          -> generate OTP
    PUT  /user-api/otp-api/{otp_id}/    -> verify OTP + login/create user"""

    @handle_exceptions
    def create(self, request):
        """Generate an OTP for the given mobile number.
        No SMS gateway wired up — OTP is printed to console and also
        returned in the response so the frontend can auto-fill it."""

        mobile = str(request.data.get("mobile") or "").strip()
        if not mobile:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Mobile number is required."
            }, status=status.HTTP_400_BAD_REQUEST)

        otp = "".join(random.choices("0123456789", k=6))
        print(f"[OTP] {otp} -> {mobile}")

        otp_obj = OTPVerification.objects.create(
            mobile=mobile, otp=otp,
            expires_at=timezone.now() + timedelta(minutes=5),
        )

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"otp_id": otp_obj.id, "otp": otp, "mobile": mobile},
            "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    def update(self, request, pk):
        """Verify OTP, then create-or-fetch the customer and log them in."""

        otp = request.data.get("otp")
        if not otp:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "otp is required."
            }, status=status.HTTP_400_BAD_REQUEST)

        otp_obj = OTPVerification.objects.filter(id=pk).first()
        if not otp_obj:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Invalid OTP request."
            }, status=status.HTTP_404_NOT_FOUND)

        if otp_obj.is_verified or otp_obj.otp != str(otp) or otp_obj.is_expired:
            otp_obj.attempt_count += 1
            otp_obj.save(update_fields=["attempt_count"])
            return Response({
                "success": True, "user_not_logged_in": False, "user_unauthorized": False,
                "data": {"otp_verified": False, "message": "Invalid or expired OTP."},
                "error": None,
            }, status=status.HTTP_200_OK)

        otp_obj.is_verified = True
        otp_obj.save(update_fields=["is_verified"])

        user, created = User.objects.get_or_create(
            contact_number=otp_obj.mobile,
            defaults={"role": "customer"},
        )
        user.last_login_at = timezone.now()
        user.save(update_fields=["last_login_at"])

        login(request, user)

        # Merge any anonymous session cart into this user's cart.
        try:
            from Order.models import Cart

            session_key = request.session.session_key
            if session_key:
                anon_cart = Cart.objects.filter(session_key=session_key, user__isnull=True).first()
                if anon_cart:
                    user_cart = Cart.objects.filter(user=user, is_active=True).first()
                    if user_cart and user_cart.pk != anon_cart.pk:
                        for item in anon_cart.items.all():
                            existing = user_cart.items.filter(
                                product=item.product, variant=item.variant
                            ).first()
                            if existing:
                                existing.quantity += item.quantity
                                existing.save(update_fields=["quantity"])
                            else:
                                item.cart = user_cart
                                item.save(update_fields=["cart"])
                        anon_cart.delete()
                    else:
                        anon_cart.user = user
                        anon_cart.session_key = None
                        anon_cart.save(update_fields=["user", "session_key"])
        except Exception as cart_ex:
            print(cart_ex)

        profile_data_filled = bool(user.first_name and user.last_name)

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {
                "otp_verified": True,
                "user_id": user.user_id,
                "new_user": created,
                "profile_data_filled": profile_data_filled,
                "role": user.role,
            },
            "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Admin auth — mobile number + password
# ─────────────────────────────────────────────
class AdminLoginViewSet(viewsets.ViewSet):
    """POST /user-api/admin-login-api/   -> authenticate admin user"""

    @handle_exceptions
    def create(self, request):
        contact_number = str(request.data.get("contact_number") or "").strip()
        password = request.data.get("password")

        if not contact_number or not password:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "contact_number and password are required."
            }, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=contact_number, password=password)

        if not user:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Invalid contact number or password."
            }, status=status.HTTP_400_BAD_REQUEST)

        if user.role != "admin" or not user.is_staff:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": True,
                "data": None, "error": "You are not authorized to access the admin dashboard."
            }, status=status.HTTP_403_FORBIDDEN)

        login(request, user)
        user.last_login_at = timezone.now()
        user.save(update_fields=["last_login_at"])

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"user_id": user.user_id, "full_name": user.full_name, "role": user.role},
            "error": None,
        }, status=status.HTTP_200_OK)


class LogoutViewSet(viewsets.ViewSet):
    """POST /user-api/logout-api/  -> logout any logged-in user (admin or customer)."""

    @handle_exceptions
    @check_authentication()
    def create(self, request):
        logout(request)
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"logged_out": True}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Profile
# ─────────────────────────────────────────────
class ProfileViewSet(viewsets.ViewSet):
    """GET /user-api/profile-api/       -> current user's profile
    PUT  /user-api/profile-api/{pk}/    -> update profile"""

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        data = UserSerializer(request.user).data
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"profile": data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication()
    def update(self, request, pk):
        user = request.user
        if str(user.user_id) != str(pk):
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": True,
                "data": None, "error": "You can only update your own profile."
            }, status=status.HTTP_403_FORBIDDEN)

        for field in ("first_name", "last_name", "email"):
            if field in request.data:
                setattr(user, field, request.data.get(field))
        user.save()

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"profile": UserSerializer(user).data}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Addresses (customer-owned, used at checkout + account page)
# ─────────────────────────────────────────────
class AddressViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        addresses = Address.objects.filter(user=request.user)
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"addresses": AddressSerializer(addresses, many=True).data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication()
    def retrieve(self, request, pk):
        address = Address.objects.filter(pk=pk, user=request.user).first()
        if not address:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Address not found."
            }, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"address": AddressSerializer(address).data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication()
    def create(self, request):
        serializer = AddressSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        address = serializer.save(user=request.user)
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"address": AddressSerializer(address).data}, "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication()
    def update(self, request, pk):
        address = Address.objects.filter(pk=pk, user=request.user).first()
        if not address:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Address not found."
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = AddressSerializer(address, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"address": serializer.data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication()
    def destroy(self, request, pk):
        address = Address.objects.filter(pk=pk, user=request.user).first()
        if not address:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Address not found."
            }, status=status.HTTP_404_NOT_FOUND)

        address.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Admin — customer management (list/detail, read-mostly)
# ─────────────────────────────────────────────
class AdminUserViewSet(viewsets.ViewSet):
    """GET /user-api/admin-users-api/         -> list customers (search/paginate)
    GET  /user-api/admin-users-api/{pk}/      -> customer detail"""

    @handle_exceptions
    @check_authentication(required_role="admin")
    def list(self, request):
        search = request.query_params.get("search")
        users = User.objects.filter(role="customer")
        if search:
            users = users.filter(contact_number__icontains=search)

        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
        start = (page - 1) * page_size
        end = start + page_size

        total_count = users.count()
        users_page = users[start:end]

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {
                "users": UserSerializer(users_page, many=True).data,
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
            },
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def retrieve(self, request, pk):
        user = User.objects.filter(pk=pk, role="customer").first()
        if not user:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Customer not found."
            }, status=status.HTTP_404_NOT_FOUND)

        addresses = Address.objects.filter(user=user)
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {
                "user": UserSerializer(user).data,
                "addresses": AddressSerializer(addresses, many=True).data,
            },
            "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Session info — used by frontend JS on load to know who's logged in
# ─────────────────────────────────────────────
class SessionViewSet(viewsets.ViewSet):

    @handle_exceptions
    def list(self, request):
        if not request.user.is_authenticated:
            return Response({
                "success": True, "user_not_logged_in": True, "user_unauthorized": False,
                "data": {"is_authenticated": False}, "error": None,
            }, status=status.HTTP_200_OK)

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {
                "is_authenticated": True,
                "user": UserSerializer(request.user).data,
            },
            "error": None,
        }, status=status.HTTP_200_OK)
