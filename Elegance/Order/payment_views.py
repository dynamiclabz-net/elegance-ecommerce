"""Razorpay payment endpoints: status check, pay-from-order-detail, the
redirect landing URL, the webhook and the admin re-check."""
import json
import logging
from urllib.parse import urlencode

from django.http import HttpResponse, JsonResponse
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework import status, viewsets
from rest_framework.response import Response

from utils.decorators import check_authentication, handle_exceptions

from . import razorpay_service as rzp
from .models import Order, Payment
from .serializers import OrderDetailSerializer

logger = logging.getLogger(__name__)


def _reply(success, data=None, error=None, http_status=status.HTTP_200_OK):
    return Response({
        "success": success, "user_not_logged_in": False, "user_unauthorized": False,
        "data": data, "error": error,
    }, status=http_status)


def _order_payload(order, request):
    return OrderDetailSerializer(order, context={"request": request}).data


def _pick_payment(order, razorpay_order_id=None):
    """The payment a status check is about: the one named by Razorpay's
    redirect if it belongs to this order, otherwise the newest unpaid one."""
    if razorpay_order_id:
        match = order.payments.filter(razorpay_order_id=razorpay_order_id).first()
        if match:
            return match
    return (
        order.payments.exclude(status="success").order_by("-created_at").first()
        or order.payments.order_by("-created_at").first()
    )


# ─────────────────────────────────────────────
# Payment status — used by the payment-callback screen
# ─────────────────────────────────────────────
class PaymentVerifyViewSet(viewsets.ViewSet):
    """POST /order-api/payment-verify-api/
         body: {order_id, razorpay_payment_id?, razorpay_order_id?, razorpay_signature?,
                error_code?, error_description?}
         -> checks the payment and returns {state: success|failed|pending, message, order}
       GET  /order-api/payment-verify-api/{order_id}/  -> same check without redirect params
       The screen calls this up to 1 + PAYMENT_STATUS_MAX_RETRIES times while the state is pending."""

    def _check(self, request, order_id, params):
        order = Order.objects.filter(pk=order_id, user=request.user).first()
        if not order:
            return _reply(False, error="Order not found.", http_status=status.HTTP_404_NOT_FOUND)

        payment = _pick_payment(order, params.get("razorpay_order_id"))
        if not payment:
            return _reply(False, error="No payment found for this order.", http_status=status.HTTP_400_BAD_REQUEST)

        if params.get("error_code") or params.get("error_description"):
            rzp.record_reported_failure(payment, params.get("error_code"), params.get("error_description"))

        if not rzp.is_configured():
            return _reply(False, error=rzp.NOT_CONFIGURED_MESSAGE, http_status=status.HTTP_503_SERVICE_UNAVAILABLE)

        result = rzp.sync_payment(
            payment, params.get("razorpay_payment_id"), params.get("razorpay_signature"),
        )
        order.refresh_from_db()
        return _reply(True, {
            "state": result.state,
            "message": result.message,
            "order": _order_payload(order, request),
        })

    @handle_exceptions
    @check_authentication()
    def create(self, request):
        return self._check(request, request.data.get("order_id"), {
            key: request.data.get(key) for key in (
                "razorpay_payment_id", "razorpay_order_id", "razorpay_signature",
                "error_code", "error_description",
            )
        })

    @handle_exceptions
    @check_authentication()
    def retrieve(self, request, pk):
        return self._check(request, pk, {})


# ─────────────────────────────────────────────
# Pay (or retry paying) from the checkout or the order detail page
# ─────────────────────────────────────────────
class OrderPaymentViewSet(viewsets.ViewSet):
    """POST /order-api/order-payment-api/  body: {order_id}
    -> {razorpay: <options for new Razorpay(options)>}. Reuses the order's open
    Razorpay order when it is still valid, so retries don't pile up."""

    @handle_exceptions
    @check_authentication()
    def create(self, request):
        order = Order.objects.filter(pk=request.data.get("order_id"), user=request.user).first()
        if not order:
            return _reply(False, error="Order not found.", http_status=status.HTTP_404_NOT_FOUND)

        try:
            payment = rzp.get_payable_payment(order)
        except rzp.RazorpayError as exc:
            return _reply(False, error=exc.message, http_status=status.HTTP_400_BAD_REQUEST)

        return _reply(True, {
            "razorpay": rzp.build_checkout_options(payment, request),
            "status_url": reverse("payment-callback-detail", kwargs={"pk": order.id}),
        })


# ─────────────────────────────────────────────
# Admin — re-check a payment with Razorpay
# ─────────────────────────────────────────────
class AdminPaymentSyncViewSet(viewsets.ViewSet):
    """POST /order-api/admin-payment-sync-api/  body: {payment_id}"""

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        payment = Payment.objects.select_related("order").filter(pk=request.data.get("payment_id")).first()
        if not payment:
            return _reply(False, error="Payment not found.", http_status=status.HTTP_404_NOT_FOUND)
        if not rzp.is_configured():
            return _reply(False, error=rzp.NOT_CONFIGURED_MESSAGE, http_status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not payment.razorpay_order_id:
            return _reply(False, error="This payment has no Razorpay order to check.",
                          http_status=status.HTTP_400_BAD_REQUEST)

        result = rzp.sync_payment(payment)
        order = Order.objects.get(pk=payment.order_id)
        return _reply(True, {
            "state": result.state,
            "message": result.message,
            "order": OrderDetailSerializer(order, context={"request": request, "admin": True}).data,
        })


# ─────────────────────────────────────────────
# Redirect landing URL (Razorpay sends the browser here)
# ─────────────────────────────────────────────
@csrf_exempt
@require_http_methods(["GET", "POST"])
def razorpay_return(request, order_id):
    """Razorpay POSTs the customer here after paying (callback_url). The browser's
    session cookie isn't sent on that cross-site POST, so nothing is checked here:
    we hand the values to the logged-in status screen with a normal redirect and
    it verifies them."""
    source = request.POST if request.method == "POST" else request.GET
    params = {
        "razorpay_payment_id": source.get("razorpay_payment_id"),
        "razorpay_order_id": source.get("razorpay_order_id"),
        "razorpay_signature": source.get("razorpay_signature"),
        "error_code": source.get("error[code]") or source.get("error_code"),
        "error_description": source.get("error[description]") or source.get("error_description"),
    }
    query = urlencode({key: value for key, value in params.items() if value})
    target = reverse("payment-callback-detail", kwargs={"pk": order_id})

    response = HttpResponse(status=303)
    response["Location"] = f"{target}?{query}" if query else target
    return response


# ─────────────────────────────────────────────
# Webhook — confirms payments even if the customer closes the tab
# ─────────────────────────────────────────────
@csrf_exempt
@require_http_methods(["POST"])
def razorpay_webhook(request):
    """Set this URL under Razorpay Dashboard > Settings > Webhooks and use the same
    secret as RAZORPAY_*_WEBHOOK_SECRET. Subscribe to payment.captured,
    payment.failed and order.paid. The payload is only used to find the order;
    the real status is read back from Razorpay."""
    if not rzp.verify_webhook_signature(request.body, request.headers.get("X-Razorpay-Signature")):
        return JsonResponse({"error": "invalid signature"}, status=400)

    try:
        event = json.loads(request.body)
    except ValueError:
        return JsonResponse({"error": "invalid payload"}, status=400)

    payload = event.get("payload") or {}
    entity = (payload.get("payment") or {}).get("entity") or (payload.get("order") or {}).get("entity") or {}
    razorpay_order_id = entity.get("order_id") or entity.get("id")

    payment = Payment.objects.filter(razorpay_order_id=razorpay_order_id).first() if razorpay_order_id else None
    if payment:
        try:
            rzp.sync_payment(payment)
        except Exception:
            logger.exception("Webhook sync failed for %s", razorpay_order_id)
            return JsonResponse({"error": "sync failed"}, status=500)

    return JsonResponse({"ok": True})
