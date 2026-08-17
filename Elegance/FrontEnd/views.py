from functools import wraps

from django.shortcuts import render, redirect
from django.urls import reverse
from rest_framework import viewsets, status
from rest_framework.response import Response

from utils.decorators import handle_exceptions


def check_authentication(required_role=None):
    """Page-rendering variant of check_authentication — redirects to the
    appropriate login page instead of returning a JSON error, since these
    ViewSets render HTML pages rather than serving API responses."""

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(self, request, *args, **kwargs):
            user = request.user

            if not user.is_authenticated:
                if required_role == "admin":
                    return redirect("admin-login-list")
                # No separate customer login page — the account page itself
                # shows the non-dismissable mobile OTP modal on top.
                return redirect(f"{reverse('account-list')}?next={request.path}")

            if required_role:
                allowed_roles = required_role if isinstance(required_role, (list, tuple, set)) else [required_role]
                if getattr(user, "role", None) not in allowed_roles:
                    if required_role == "admin":
                        return redirect("admin-login-list")
                    return redirect(f"{reverse('account-list')}?next={request.path}")

            return view_func(self, request, *args, **kwargs)

        return _wrapped_view
    return decorator


# ─────────────────────────────────────────────
# Admin — auth
# ─────────────────────────────────────────────
class AdminLoginPageViewSet(viewsets.ViewSet):

    @handle_exceptions
    def list(self, request):
        if request.user.is_authenticated and getattr(request.user, "role", None) == "admin":
            return redirect("admin-dashboard-list")
        return render(request, "frontend/admin/admin-login.html")


class AdminDashboardViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role="admin")
    def list(self, request):
        return render(request, "frontend/admin/admin-dashboard.html")


class AdminCategoriesPageViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role="admin")
    def list(self, request):
        return render(request, "frontend/admin/admin-categories.html")


class AdminProductsPageViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role="admin")
    def list(self, request):
        return render(request, "frontend/admin/admin-products.html")


class AdminProductFormPageViewSet(viewsets.ViewSet):
    """list() -> add new product form
    retrieve(pk) -> edit existing product form"""

    @handle_exceptions
    @check_authentication(required_role="admin")
    def list(self, request):
        return render(request, "frontend/admin/admin-product-form.html", {"product_id": None})

    @handle_exceptions
    @check_authentication(required_role="admin")
    def retrieve(self, request, pk):
        return render(request, "frontend/admin/admin-product-form.html", {"product_id": pk})


class AdminOrdersPageViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role="admin")
    def list(self, request):
        return render(request, "frontend/admin/admin-orders.html")


class AdminOrderDetailPageViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role="admin")
    def retrieve(self, request, pk):
        return render(request, "frontend/admin/admin-order-detail.html", {"order_id": pk})


# ─────────────────────────────────────────────
# Customer — account page
# ─────────────────────────────────────────────
class AccountPageViewSet(viewsets.ViewSet):
    """GET /account/  -> renders the customer account page.

    Unlike the admin pages, this is NOT gated by @check_authentication:
    the page itself always renders, and its JS shows a non-dismissable
    mobile OTP login modal on top of it whenever the visitor's session
    is not authenticated (checked via the session-api on page load)."""

    @handle_exceptions
    def list(self, request):
        return render(request, "frontend/account.html")


# ─────────────────────────────────────────────
# Customer — shop, product, cart, checkout, orders
# ─────────────────────────────────────────────
class ShopPageViewSet(viewsets.ViewSet):
    """GET /shop/  -> catalog page with sidebar filters. Public."""

    @handle_exceptions
    def list(self, request):
        return render(request, "frontend/shop.html")


class ProductDetailPageViewSet(viewsets.ViewSet):
    """GET /product/{slug}/  -> product detail page. Public."""

    @handle_exceptions
    def retrieve(self, request, pk):
        return render(request, "frontend/product-detail.html", {"product_slug": pk})


class CartPageViewSet(viewsets.ViewSet):
    """GET /cart/  -> cart page. Public — works for guests via the session cart."""

    @handle_exceptions
    def list(self, request):
        return render(request, "frontend/cart.html")


class CheckoutPageViewSet(viewsets.ViewSet):
    """GET /checkout/  -> checkout page. Requires login (redirects to the
    account page's OTP modal otherwise)."""

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return render(request, "frontend/checkout.html")


class PaymentCallbackPageViewSet(viewsets.ViewSet):
    """GET /payment-callback/{order_id}/  -> the page Razorpay would redirect
    back to after payment. Its JS reads the razorpay_* query params and
    calls payment-verify-api, then redirects to the order detail page."""

    @handle_exceptions
    @check_authentication()
    def retrieve(self, request, pk):
        return render(request, "frontend/payment-callback.html", {"order_id": pk})


class OrderDetailPageViewSet(viewsets.ViewSet):
    """GET /order-detail/{order_id}/  -> customer-facing order detail page."""

    @handle_exceptions
    @check_authentication()
    def retrieve(self, request, pk):
        return render(request, "frontend/order-detail.html", {"order_id": pk})
