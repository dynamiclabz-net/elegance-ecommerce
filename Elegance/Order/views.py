from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.response import Response

from utils.decorators import handle_exceptions, check_authentication

from Product.models import Product, ProductVariant
from UserDetail.models import Address

import hmac

from django.conf import settings
from rest_framework.decorators import action
from rest_framework.views import APIView

from . import fulfilment
from .couriers import CourierError, get_courier, provider_catalog
from .models import (
    Cart, CartItem, Order, OrderItem, Payment, OrderStatusHistory, PincodeRange, ORDER_STATUS_CHOICES,
    Shipment,
)
from .serializers import (
    CartSerializer, OrderListSerializer, OrderDetailSerializer, OrderStatusHistorySerializer,
    PincodeRangeSerializer, ShipmentSerializer,
)
from .shipping import find_rate, normalize_pincode, quote_shipping, validate_range

STATUS_TIMESTAMP_FIELD = {
    "confirmed": "confirmed_at",
    "shipped": "shipped_at",
    "out_for_delivery": "out_for_delivery_at",
    "delivered": "delivered_at",
    "cancelled": "cancelled_at",
}

VALID_STATUSES = {choice[0] for choice in ORDER_STATUS_CHOICES}


# ─────────────────────────────────────────────
# Admin — order management
# ─────────────────────────────────────────────
class AdminOrderViewSet(viewsets.ViewSet):
    """GET  /order-api/admin-order-api/          -> list orders (search/filter/paginate)
    GET    /order-api/admin-order-api/{pk}/      -> order detail
    PUT    /order-api/admin-order-api/{pk}/      -> update order status / tracking info"""

    @handle_exceptions
    @check_authentication(required_role="admin")
    def list(self, request):
        params = request.query_params
        orders = Order.objects.select_related("user").prefetch_related("shipments")

        search = params.get("search")
        if params.get("needs_action") == "approval":
            orders = orders.filter(approved_at__isnull=True, order_status__in=["placed", "confirmed"])
        elif params.get("needs_action") == "shipping":
            orders = orders.filter(
                approved_at__isnull=False, order_status="processing",
            ).exclude(shipments__is_active=True)
        if search:
            orders = orders.filter(
                Q(order_number__icontains=search)
                | Q(shipping_full_name__icontains=search)
                | Q(shipping_mobile__icontains=search)
            )

        order_status = params.get("order_status")
        if order_status:
            orders = orders.filter(order_status=order_status)

        payment_status = params.get("payment_status")
        if payment_status:
            orders = orders.filter(payment_status=payment_status)

        payment_method = params.get("payment_method")
        if payment_method:
            orders = orders.filter(payment_method=payment_method)

        date_from = params.get("date_from")
        if date_from:
            orders = orders.filter(placed_at__date__gte=date_from)

        date_to = params.get("date_to")
        if date_to:
            orders = orders.filter(placed_at__date__lte=date_to)

        orders = orders.order_by("-placed_at")

        total_count = orders.count()

        page = int(params.get("page", 1))
        page_size = int(params.get("page_size", 20))
        start = (page - 1) * page_size
        end = start + page_size
        orders_page = orders[start:end]

        # Quick reporting stats for the dashboard cards.
        stats = {
            "total_orders": Order.objects.count(),
            "placed": Order.objects.filter(order_status="placed").count(),
            "processing": Order.objects.filter(order_status="processing").count(),
            "out_for_delivery": Order.objects.filter(order_status="out_for_delivery").count(),
            "delivered": Order.objects.filter(order_status="delivered").count(),
            "cancelled": Order.objects.filter(order_status="cancelled").count(),
        }

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {
                "orders": OrderListSerializer(orders_page, many=True, context={"request": request}).data,
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "stats": stats,
            },
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def retrieve(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Order not found."
            }, status=status.HTTP_404_NOT_FOUND)

        return self._order_response(request, order)

    @staticmethod
    def _order_response(request, order, **extra):
        data = {"order": OrderDetailSerializer(order, context={"request": request, "admin": True}).data}
        data.update(extra)
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": data, "error": None,
        }, status=status.HTTP_200_OK)

    @staticmethod
    def _fail(message, code=status.HTTP_400_BAD_REQUEST):
        return Response({
            "success": False, "user_not_logged_in": False, "user_unauthorized": False,
            "data": None, "error": message,
        }, status=code)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def update(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Order not found."
            }, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("order_status")
        note = request.data.get("note", "")

        if new_status:
            if new_status not in VALID_STATUSES:
                return Response({
                    "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                    "data": None, "error": f"Invalid order_status. Must be one of {sorted(VALID_STATUSES)}."
                }, status=status.HTTP_400_BAD_REQUEST)

            if new_status == "cancelled" and order.order_status != "cancelled":
                try:
                    fulfilment.cancel_order(order, request.user, note)
                except fulfilment.FulfilmentError as exc:
                    return self._fail(str(exc))
                order.refresh_from_db()
            elif new_status != order.order_status:
                order.order_status = new_status
                timestamp_field = STATUS_TIMESTAMP_FIELD.get(new_status)
                if timestamp_field and not getattr(order, timestamp_field):
                    setattr(order, timestamp_field, timezone.now())

                OrderStatusHistory.objects.create(
                    order=order, status=new_status, note=note, changed_by=request.user,
                )

        # Optional tracking info update (courier partner set up later — admin fills manually for now)
        for field in ("tracking_id", "tracking_url", "courier_partner"):
            if field in request.data:
                setattr(order, field, request.data.get(field))

        if "payment_status" in request.data:
            order.payment_status = request.data.get("payment_status")

        order.save()

        return self._order_response(request, order)

    # ── fulfilment actions ────────────────────────────────────────────────
    @handle_exceptions
    @check_authentication(required_role="admin")
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return self._fail("Order not found.", status.HTTP_404_NOT_FOUND)
        try:
            fulfilment.approve_order(order, request.user, request.data.get("note", ""))
        except fulfilment.FulfilmentError as exc:
            return self._fail(str(exc))
        return self._order_response(request, order)

    @handle_exceptions
    @check_authentication(required_role="admin")
    @action(detail=True, methods=["get"], url_path="shipping-options")
    def shipping_options(self, request, pk):
        """Everything the 'Ship this order' form needs in one call."""
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return self._fail("Order not found.", status.HTTP_404_NOT_FOUND)
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {
                "providers": provider_catalog(),
                "pickup_dates": [d.isoformat() for d in fulfilment.pickup_date_options()],
                "parcel": fulfilment.default_parcel(order),
                "amount_to_collect": str(order.amount_to_collect),
                "store_whatsapp": settings.STORE_WHATSAPP_NUMBER,
                "environment": settings.SHIPPING_ENV,
            },
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    @action(detail=False, methods=["get"], url_path="pickup-locations")
    def pickup_locations(self, request):
        provider = request.query_params.get("provider", "")
        try:
            courier = get_courier(provider)
            if not courier.available or not courier.is_configured():
                return self._fail(f"{courier.label} is not available. {courier.configuration_hint()}".strip())
            locations = courier.list_pickup_locations()
        except CourierError as exc:
            return self._fail(str(exc))
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"locations": locations}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    @action(detail=True, methods=["get"], url_path="courier-rates")
    def courier_rates(self, request, pk):
        """Live courier options and prices for this order (Shiprocket)."""
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return self._fail("Order not found.", status.HTTP_404_NOT_FOUND)
        provider = request.query_params.get("provider", "")
        pickup_pincode = request.query_params.get("pickup_pincode", "")
        try:
            weight = fulfilment._positive_decimal(
                request.query_params.get("weight_kg") or fulfilment.default_parcel(order)["weight_kg"],
                "Weight (kg)", 50,
            )
            courier = get_courier(provider)
            if not courier.available or not courier.is_configured():
                return self._fail(f"{courier.label} is not available. {courier.configuration_hint()}".strip())
            if not pickup_pincode:
                return self._fail("Choose a pickup address first.")
            couriers = courier.serviceability(order, pickup_pincode, weight, order.amount_to_collect)
        except (CourierError, fulfilment.FulfilmentError) as exc:
            return self._fail(str(exc))
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"couriers": couriers}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    @action(detail=True, methods=["post"], url_path="ship")
    def ship(self, request, pk):
        """Book the order with the chosen delivery partner for the chosen pickup day."""
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return self._fail("Order not found.", status.HTTP_404_NOT_FOUND)
        try:
            shipment, warnings = fulfilment.create_shipment(order, request.user, request.data)
        except (fulfilment.FulfilmentError, CourierError) as exc:
            return self._fail(str(exc))
        order.refresh_from_db()
        return self._order_response(
            request, order, warnings=warnings, partial=bool(shipment.error_message and not warnings),
        )

    @handle_exceptions
    @check_authentication(required_role="admin")
    @action(detail=True, methods=["post"], url_path="shipment-action")
    def shipment_action(self, request, pk):
        """retry | refresh_documents | sync | cancel | set_status | reschedule"""
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return self._fail("Order not found.", status.HTTP_404_NOT_FOUND)
        shipment = order.active_shipment
        if not shipment:
            return self._fail("This order has no active shipment.")

        action_name = request.data.get("action")
        warnings = []
        try:
            if action_name == "retry":
                _, warnings = fulfilment.retry_shipment(shipment, request.user, request.data.get("pickup_date"))
            elif action_name == "refresh_documents":
                warnings = fulfilment.refresh_documents(shipment)
            elif action_name == "sync":
                if not shipment.is_api_provider:
                    return self._fail("Manual shipments have no partner tracking to sync.")
                fulfilment.sync_shipment(shipment)
            elif action_name == "cancel":
                fulfilment.cancel_shipment(shipment, request.user, request.data.get("reason", ""))
            elif action_name == "set_status":
                fulfilment.update_manual_status(
                    shipment, request.user, request.data.get("status"), request.data.get("note", ""),
                )
            elif action_name == "reschedule":
                fulfilment.update_manual_pickup(shipment, request.data.get("pickup_date"))
            else:
                return self._fail("Unknown shipment action.")
        except (fulfilment.FulfilmentError, CourierError) as exc:
            return self._fail(str(exc))

        order.refresh_from_db()
        return self._order_response(request, order, warnings=warnings)


# ─────────────────────────────────────────────
# Delivery partner webhooks
# ─────────────────────────────────────────────
class ShiprocketWebhookView(APIView):
    """POST /order-api/webhooks/shiprocket/

    Configure in Shiprocket (Settings > API > Webhooks) with this URL and a
    secret token; Shiprocket echoes the token in the `x-api-key` header."""

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        expected = settings.SHIPROCKET_CREDENTIALS.get(settings.SHIPPING_ENV, {}).get("WEBHOOK_TOKEN", "")
        provided = request.headers.get("x-api-key", "")
        if not expected or not hmac.compare_digest(expected, provided):
            return Response({"success": False, "error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            matched = fulfilment.handle_webhook("shiprocket", request.data if isinstance(request.data, dict) else {})
        except Exception as exc:  # never make the partner retry forever on our bug
            print(f"Shiprocket webhook error: {exc}")
            matched = False
        return Response({"success": True, "matched": matched}, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Customer — view own orders (used by the account page in task 2)
# ─────────────────────────────────────────────
class MyOrderViewSet(viewsets.ViewSet):
    """GET /order-api/my-order-api/         -> list my orders
    GET  /order-api/my-order-api/{pk}/      -> my order detail"""

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        orders = Order.objects.filter(user=request.user).order_by("-placed_at")
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"orders": OrderListSerializer(orders, many=True, context={"request": request}).data},
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication()
    def retrieve(self, request, pk):
        order = Order.objects.filter(pk=pk, user=request.user).first()
        if not order:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Order not found."
            }, status=status.HTTP_404_NOT_FOUND)

        fulfilment.refresh_if_stale(order.active_shipment)
        order.refresh_from_db()

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"order": OrderDetailSerializer(order, context={"request": request, "admin": False}).data},
            "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Cart — works for both logged-in users and anonymous (session-based) visitors
# ─────────────────────────────────────────────
class CartViewSet(viewsets.ViewSet):
    """GET    /order-api/cart-api/         -> current cart (creates one if needed)
    POST     /order-api/cart-api/          -> add an item {product, variant, quantity}
    PUT      /order-api/cart-api/{pk}/     -> update a cart item's quantity {quantity}
    DELETE   /order-api/cart-api/{pk}/     -> remove a cart item"""

    @staticmethod
    def _get_cart(request):
        if request.user.is_authenticated:
            cart, _ = Cart.objects.get_or_create(user=request.user, is_active=True)
            return cart

        if not request.session.session_key:
            request.session.create()
        session_key = request.session.session_key
        cart, _ = Cart.objects.get_or_create(session_key=session_key, user=None, is_active=True)
        return cart

    @handle_exceptions
    def list(self, request):
        cart = self._get_cart(request)
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"cart": CartSerializer(cart, context={"request": request}).data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    def create(self, request):
        product_id = request.data.get("product")
        variant_id = request.data.get("variant")
        quantity = int(request.data.get("quantity", 1))

        if not product_id or quantity < 1:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "product and a positive quantity are required."
            }, status=status.HTTP_400_BAD_REQUEST)

        product = Product.objects.filter(pk=product_id, is_active=True).first()
        if not product:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Product not found."
            }, status=status.HTTP_404_NOT_FOUND)

        variant = None
        if variant_id:
            variant = ProductVariant.objects.filter(pk=variant_id, product=product, is_active=True).first()
            if not variant:
                return Response({
                    "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                    "data": None, "error": "Selected variant not found."
                }, status=status.HTTP_404_NOT_FOUND)

        available_stock = variant.stock_quantity if variant else product.stock_quantity
        if available_stock < 1:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "This item is currently out of stock."
            }, status=status.HTTP_400_BAD_REQUEST)

        cart = self._get_cart(request)
        item, created = CartItem.objects.get_or_create(
            cart=cart, product=product, variant=variant, defaults={"quantity": quantity}
        )
        if not created:
            item.quantity += quantity
        item.quantity = min(item.quantity, available_stock)
        item.save()

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"cart": CartSerializer(cart, context={"request": request}).data}, "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    def update(self, request, pk):
        cart = self._get_cart(request)
        item = CartItem.objects.filter(pk=pk, cart=cart).first()
        if not item:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Cart item not found."
            }, status=status.HTTP_404_NOT_FOUND)

        quantity = int(request.data.get("quantity", item.quantity))
        if quantity < 1:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Quantity must be at least 1."
            }, status=status.HTTP_400_BAD_REQUEST)

        available_stock = item.variant.stock_quantity if item.variant else item.product.stock_quantity
        item.quantity = min(quantity, available_stock) if available_stock else quantity
        item.save()

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"cart": CartSerializer(cart, context={"request": request}).data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    def destroy(self, request, pk):
        cart = self._get_cart(request)
        item = CartItem.objects.filter(pk=pk, cart=cart).first()
        if not item:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Cart item not found."
            }, status=status.HTTP_404_NOT_FOUND)

        item.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"cart": CartSerializer(cart, context={"request": request}).data}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Checkout — places the order from the current cart
# ────────────────────────────────────────────���
class CheckoutViewSet(viewsets.ViewSet):
    """POST /order-api/checkout-api/  -> create Order (+ initial Payment record) from the cart.

    Since Razorpay is not wired up yet, this simulates the redirect-based
    Standard Checkout flow: it creates a placeholder Razorpay order id and
    returns a `redirect_url` pointing at our own payment-callback page, with
    the same query params (razorpay_payment_id / razorpay_order_id /
    razorpay_signature) that Razorpay itself would append on a real
    callback redirect. Swapping in the real gateway later only means
    replacing the placeholder id generation with an actual
    `client.order.create(...)` call — the rest of the flow (Payment model,
    callback page, verification endpoint) stays the same."""

    @handle_exceptions
    @check_authentication()
    def create(self, request):
        cart = CartViewSet._get_cart(request)
        cart_items = list(cart.items.select_related("product", "variant"))

        if not cart_items:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Your cart is empty."
            }, status=status.HTTP_400_BAD_REQUEST)

        payment_method = request.data.get("payment_method")
        if payment_method not in ("cod", "online"):
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "payment_method must be 'cod' or 'online'."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Resolve shipping address — either a saved address id, or inline fields.
        address_id = request.data.get("address_id")
        address = None
        if address_id:
            address = Address.objects.filter(pk=address_id, user=request.user).first()
            if not address:
                return Response({
                    "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                    "data": None, "error": "Selected address not found."
                }, status=status.HTTP_404_NOT_FOUND)
            shipping_fields = {
                "shipping_full_name": address.full_name,
                "shipping_mobile": address.mobile,
                "shipping_address_line1": address.address_line1,
                "shipping_address_line2": address.address_line2,
                "shipping_city": address.city,
                "shipping_state": address.state,
                "shipping_pincode": address.pincode,
                "shipping_country": address.country,
            }
        else:
            required = ["full_name", "mobile", "address_line1", "city", "state", "pincode"]
            missing = [f for f in required if not request.data.get(f)]
            if missing:
                return Response({
                    "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                    "data": None, "error": f"Missing required address fields: {', '.join(missing)}."
                }, status=status.HTTP_400_BAD_REQUEST)
            shipping_fields = {
                "shipping_full_name": request.data.get("full_name"),
                "shipping_mobile": request.data.get("mobile"),
                "shipping_address_line1": request.data.get("address_line1"),
                "shipping_address_line2": request.data.get("address_line2", ""),
                "shipping_city": request.data.get("city"),
                "shipping_state": request.data.get("state"),
                "shipping_pincode": request.data.get("pincode"),
                "shipping_country": request.data.get("country", "India"),
            }

        # Reject undeliverable pincodes before anything is persisted.
        if find_rate(shipping_fields["shipping_pincode"]) is None:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None,
                "error": f"Sorry, we don't deliver to pincode {shipping_fields['shipping_pincode']} yet.",
            }, status=status.HTTP_400_BAD_REQUEST)

        if not address_id and request.data.get("save_address"):
            Address.objects.create(
                user=request.user,
                full_name=shipping_fields["shipping_full_name"],
                mobile=shipping_fields["shipping_mobile"],
                address_line1=shipping_fields["shipping_address_line1"],
                address_line2=shipping_fields["shipping_address_line2"],
                city=shipping_fields["shipping_city"],
                state=shipping_fields["shipping_state"],
                pincode=shipping_fields["shipping_pincode"],
                country=shipping_fields["shipping_country"],
                is_default=not Address.objects.filter(user=request.user).exists(),
            )

        # Validate stock + compute totals server-side (never trust client prices).
        subtotal = Decimal("0")
        for item in cart_items:
            available_stock = item.variant.stock_quantity if item.variant else item.product.stock_quantity
            if item.quantity > available_stock:
                return Response({
                    "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                    "data": None,
                    "error": f"Only {available_stock} unit(s) of '{item.product.name}' left in stock."
                }, status=status.HTTP_400_BAD_REQUEST)
            subtotal += item.unit_price * item.quantity

        shipping_charge = quote_shipping(shipping_fields["shipping_pincode"], subtotal).shipping_charge
        discount_amount = Decimal("0")
        total_amount = (subtotal - discount_amount + shipping_charge).quantize(Decimal("1"), ROUND_HALF_UP)

        order = Order.objects.create(
            user=request.user,
            address=address,
            payment_method=payment_method,
            subtotal=subtotal,
            discount_amount=discount_amount,
            shipping_charge=shipping_charge,
            total_amount=total_amount,
            **shipping_fields,
        )

        for item in cart_items:
            OrderItem.objects.create(
                order=order,
                product=item.product,
                variant=item.variant,
                product_name=item.product.name,
                variant_label=item.variant.variant_label if item.variant else "",
                sku=item.variant.sku if item.variant else item.product.sku,
                unit_price=item.unit_price,
                quantity=item.quantity,
            )
            # Decrement stock now that the order is placed.
            if item.variant:
                ProductVariant.objects.filter(pk=item.variant_id).update(
                    stock_quantity=item.variant.stock_quantity - item.quantity
                )
            else:
                Product.objects.filter(pk=item.product_id).update(
                    stock_quantity=item.product.stock_quantity - item.quantity
                )

        if payment_method == "cod":
            advance_pct = order.cod_advance_percentage
            order.cod_advance_amount = (total_amount * advance_pct / Decimal("100")).quantize(
                Decimal("1"), ROUND_HALF_UP
            )
            order.cod_balance_amount = total_amount - order.cod_advance_amount
            payment_type = "cod_advance"
            payment_amount = order.cod_advance_amount
        else:
            order.cod_advance_amount = Decimal("0")
            order.cod_balance_amount = Decimal("0")
            payment_type = "full_online"
            payment_amount = total_amount
        order.save(update_fields=["cod_advance_amount", "cod_balance_amount"])

        # Placeholder Razorpay order — swap for a real client.order.create() call
        # once the Razorpay integration is added; everything downstream is ready.
        razorpay_order_id = f"order_dummy_{order.id}"
        payment = Payment.objects.create(
            order=order, payment_type=payment_type, amount=payment_amount,
            razorpay_order_id=razorpay_order_id, status="created",
        )

        OrderStatusHistory.objects.create(
            order=order, status="placed", note="Order placed by customer.", changed_by=request.user,
        )

        cart.items.all().delete()

        callback_path = reverse("payment-callback-detail", kwargs={"pk": order.id})
        dummy_payment_id = f"pay_dummy_{payment.id}"
        redirect_url = (
            f"{callback_path}?razorpay_payment_id={dummy_payment_id}"
            f"&razorpay_order_id={razorpay_order_id}&razorpay_signature=dummy_signature"
        )

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {
                "order_id": order.id,
                "order_number": order.order_number,
                "payment_amount": payment_amount,
                "redirect_url": redirect_url,
            },
            "error": None,
        }, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────
# Payment verification — called by the payment-callback page after the
# (simulated) redirect back from Razorpay.
# ────────────────────────────────────��────────
class PaymentVerifyViewSet(viewsets.ViewSet):
    """POST /order-api/payment-verify-api/
    body: {order_id, razorpay_payment_id, razorpay_order_id, razorpay_signature}"""

    @handle_exceptions
    @check_authentication()
    def create(self, request):
        order_id = request.data.get("order_id")
        razorpay_payment_id = request.data.get("razorpay_payment_id")
        razorpay_order_id = request.data.get("razorpay_order_id")
        razorpay_signature = request.data.get("razorpay_signature")

        order = Order.objects.filter(pk=order_id, user=request.user).first()
        if not order:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Order not found."
            }, status=status.HTTP_404_NOT_FOUND)

        payment = order.payments.filter(status="created").order_by("-created_at").first()
        if not payment:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "No pending payment found for this order."
            }, status=status.HTTP_400_BAD_REQUEST)

        # NOTE: real signature verification (via razorpay.utility.verify_payment_signature)
        # goes here once RAZORPAY_KEY_SECRET is configured. For now we trust the redirect.
        payment.razorpay_payment_id = razorpay_payment_id
        payment.razorpay_order_id = razorpay_order_id or payment.razorpay_order_id
        payment.razorpay_signature = razorpay_signature
        payment.status = "success"
        payment.paid_at = timezone.now()
        payment.save()

        order.payment_status = "partial" if payment.payment_type == "cod_advance" else "paid"
        if order.order_status == "placed":
            order.order_status = "confirmed"
            order.confirmed_at = timezone.now()
            OrderStatusHistory.objects.create(
                order=order, status="confirmed",
                note="Payment received — order confirmed.", changed_by=request.user,
            )
        order.save()

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"order": OrderDetailSerializer(order, context={"request": request}).data},
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication()
    def retrieve(self, request, pk):
        order = Order.objects.filter(pk=pk, user=request.user).first()
        if not order:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Order not found."
            }, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"order": OrderDetailSerializer(order, context={"request": request}).data},
            "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Shipping — pincode range pricing
# ─────────────────────────────────────────────
def _pincode_response(success, data=None, error=None, http_status=status.HTTP_200_OK):
    return Response({
        "success": success, "user_not_logged_in": False, "user_unauthorized": False,
        "data": data, "error": error,
    }, status=http_status)


class AdminPincodeRateViewSet(viewsets.ViewSet):
    """GET    /order-api/admin-pincode-rate-api/            -> list ranges (search/filter/paginate) + stats
    GET     /order-api/admin-pincode-rate-api/{pk}/        -> one range
    POST    /order-api/admin-pincode-rate-api/             -> create a range
    PUT     /order-api/admin-pincode-rate-api/{pk}/        -> update a range
    DELETE  /order-api/admin-pincode-rate-api/{pk}/        -> delete a range
    POST    /order-api/admin-pincode-rate-api/validate/    -> dry-run overlap check for the form"""

    MAX_PAGE_SIZE = 200

    @handle_exceptions
    @check_authentication(required_role="admin")
    def list(self, request):
        params = request.query_params
        ranges = PincodeRange.objects.all()

        search = (params.get("search") or "").strip()
        if search:
            query = Q(state__icontains=search)
            if search.isdigit():
                number = int(search)
                query |= Q(pincode_start__lte=number, pincode_end__gte=number)
            ranges = ranges.filter(query)

        state = params.get("state")
        if state:
            ranges = ranges.filter(state=state)

        is_active = params.get("is_active")
        if is_active in ("true", "false"):
            ranges = ranges.filter(is_active=(is_active == "true"))

        total_count = ranges.count()
        page = max(int(params.get("page", 1)), 1)
        page_size = min(max(int(params.get("page_size", 25)), 1), self.MAX_PAGE_SIZE)
        start = (page - 1) * page_size

        everything = PincodeRange.objects.all()
        prices = list(everything.values_list("price", flat=True))
        stats = {
            "total_ranges": len(prices),
            "active_ranges": everything.filter(is_active=True).count(),
            "states_covered": everything.values("state").distinct().count(),
            "min_price": str(min(prices)) if prices else None,
            "max_price": str(max(prices)) if prices else None,
        }

        return _pincode_response(True, {
            "ranges": PincodeRangeSerializer(ranges[start:start + page_size], many=True).data,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "stats": stats,
            "states": list(everything.order_by("state").values_list("state", flat=True).distinct()),
        })

    @handle_exceptions
    @check_authentication(required_role="admin")
    def retrieve(self, request, pk):
        instance = PincodeRange.objects.filter(pk=pk).first()
        if not instance:
            return _pincode_response(False, error="Pincode range not found.", http_status=status.HTTP_404_NOT_FOUND)
        return _pincode_response(True, {"range": PincodeRangeSerializer(instance).data})

    @staticmethod
    def _save(serializer):
        """Runs validation and saves. Returns (response, None) on failure."""
        if not serializer.is_valid():
            errors = serializer.errors
            first = next(iter(errors.values()))
            message = first[0] if isinstance(first, (list, tuple)) else str(first)
            return _pincode_response(
                False,
                data={"errors": errors, "conflicts": getattr(serializer, "conflicts", [])},
                error=str(message),
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = PincodeRangeSerializer(data=request.data)
        failure = self._save(serializer)
        if failure:
            return failure
        instance = serializer.save()
        return _pincode_response(
            True, {"range": PincodeRangeSerializer(instance).data}, http_status=status.HTTP_201_CREATED
        )

    @handle_exceptions
    @check_authentication(required_role="admin")
    def update(self, request, pk):
        instance = PincodeRange.objects.filter(pk=pk).first()
        if not instance:
            return _pincode_response(False, error="Pincode range not found.", http_status=status.HTTP_404_NOT_FOUND)
        serializer = PincodeRangeSerializer(instance, data=request.data, partial=True)
        failure = self._save(serializer)
        if failure:
            return failure
        instance = serializer.save()
        return _pincode_response(True, {"range": PincodeRangeSerializer(instance).data})

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        instance = PincodeRange.objects.filter(pk=pk).first()
        if not instance:
            return _pincode_response(False, error="Pincode range not found.", http_status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        return _pincode_response(True, {"deleted": True})

    @action(detail=False, methods=["post"], url_path="validate")
    @handle_exceptions
    @check_authentication(required_role="admin")
    def validate(self, request):
        def to_int(value):
            try:
                return int(str(value).strip())
            except (TypeError, ValueError):
                return None

        errors, conflicts = validate_range(
            to_int(request.data.get("pincode_start")),
            to_int(request.data.get("pincode_end")),
            exclude_pk=to_int(request.data.get("id")),
        )
        return _pincode_response(True, {"valid": not errors, "errors": errors, "conflicts": conflicts})


class PincodeRateViewSet(viewsets.ViewSet):
    """GET /order-api/pincode-rate-api/?pincode=380001 -> delivery price for a pincode.

    Public. The free-shipping threshold is applied against the visitor's
    current cart subtotal, so the same endpoint powers the checkout summary."""

    @handle_exceptions
    def list(self, request):
        pincode = (request.query_params.get("pincode") or "").strip()
        if normalize_pincode(pincode) is None:
            return _pincode_response(
                False, error="Enter a valid 6-digit pincode.", http_status=status.HTTP_400_BAD_REQUEST
            )

        cart = CartViewSet._get_cart(request)
        subtotal = cart.total_amount if cart.items.exists() else None
        quote = quote_shipping(pincode, subtotal)

        return _pincode_response(True, {"shipping": quote.as_dict()})
