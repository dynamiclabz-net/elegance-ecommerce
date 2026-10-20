"""Razorpay integration: API client, signature checks, checkout options and
payment syncing.

Every place that needs to know "did this payment go through?" (the status
screen, the webhook, the admin re-check) goes through `sync_payment`, which
asks Razorpay directly instead of trusting what the browser sent.
"""
import hashlib
import hmac
import logging
import re
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from Mailer import emails as mailer_emails

from .models import OrderStatusHistory, Payment

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 15
NOT_CONFIGURED_MESSAGE = "Online payments are not set up yet. Please try again later or contact us."


class RazorpayError(Exception):
    def __init__(self, message, status_code=None, code=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


@dataclass
class SyncResult:
    state: str  # "success" | "failed" | "pending"
    message: str
    payment: Payment


# ─────────────────────────────────────────────
# Config helpers
# ─────────────────────────────────────────────
def is_configured():
    return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)


def environment():
    return "live" if settings.RAZORPAY_ENV == "live" else "test"


def to_paise(amount):
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1"), ROUND_HALF_UP))


# ─────────────────────────────────────────────
# API client
# ─────────────────────────────────────────────
def _request(method, path, *, json=None, params=None):
    if not is_configured():
        raise RazorpayError(NOT_CONFIGURED_MESSAGE)

    try:
        response = requests.request(
            method,
            f"{settings.RAZORPAY_API_BASE}{path}",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json=json,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("Razorpay %s %s failed: %s", method, path, exc)
        raise RazorpayError("We couldn't reach the payment gateway. Please try again.") from exc

    try:
        body = response.json()
    except ValueError:
        body = {}

    if response.status_code >= 400:
        error = body.get("error") or {}
        logger.warning("Razorpay %s %s -> %s %s", method, path, response.status_code, error)
        raise RazorpayError(
            error.get("description") or "The payment gateway rejected the request.",
            status_code=response.status_code,
            code=error.get("code"),
        )
    return body


def create_gateway_order(order, payment):
    """Create the Razorpay order that a checkout window pays against."""
    body = _request("POST", "/orders", json={
        "amount": to_paise(payment.amount),
        "currency": "INR",
        "receipt": f"{order.order_number}-{payment.id}"[:40],
        "notes": {
            "order_number": order.order_number,
            "order_id": str(order.id),
            "payment_id": str(payment.id),
        },
    })
    return body["id"]


def fetch_gateway_order(razorpay_order_id):
    return _request("GET", f"/orders/{razorpay_order_id}")


def fetch_order_payments(razorpay_order_id):
    return _request("GET", f"/orders/{razorpay_order_id}/payments").get("items", [])


def capture_gateway_payment(razorpay_payment_id, amount_paise):
    return _request("POST", f"/payments/{razorpay_payment_id}/capture", json={
        "amount": amount_paise, "currency": "INR",
    })


# ─────────────────────────────────────────────
# Signatures
# ─────────────────────────────────────────────
def _hmac_hex(secret, message):
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_payment_signature(razorpay_order_id, razorpay_payment_id, signature):
    if not (is_configured() and razorpay_order_id and razorpay_payment_id and signature):
        return False
    expected = _hmac_hex(
        settings.RAZORPAY_KEY_SECRET, f"{razorpay_order_id}|{razorpay_payment_id}".encode()
    )
    return hmac.compare_digest(expected, str(signature))


def verify_webhook_signature(raw_body, signature):
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not (secret and signature):
        return False
    return hmac.compare_digest(_hmac_hex(secret, raw_body), str(signature))


# ─────────────────────────────────────────────
# Checkout window options
# ─────────────────────────────────────────────
def _format_contact(raw):
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return ""


def _callback_base(request):
    return settings.RAZORPAY_CALLBACK_BASE_URL or request.build_absolute_uri("/").rstrip("/")


def build_checkout_options(payment, request):
    """Options handed to `new Razorpay(options)` in the browser.

    The settings here are what keep UPI and net banking showing reliably:
    - `redirect` + `callback_url`: the browser leaves for the UPI app or the bank
      page and comes back by a normal page load, so it never depends on a popup
      or an in-page handler surviving the round trip.
    - `method` asks for UPI, cards, net banking and wallets explicitly.
    - a valid +91 `prefill.contact` lets Razorpay offer the right UPI options.
    - `retry` lets the customer try another method after a failed attempt.
    """
    order = payment.order
    user = order.user
    options = {
        "key": settings.RAZORPAY_KEY_ID,
        "amount": to_paise(payment.amount),
        "currency": "INR",
        "order_id": payment.razorpay_order_id,
        "name": settings.RAZORPAY_BUSINESS_NAME,
        "description": f"Order #{order.order_number}",
        "prefill": {
            "name": order.shipping_full_name or user.full_name,
            "email": user.email or "",
            "contact": _format_contact(order.shipping_mobile or user.contact_number),
        },
        "notes": {"order_number": order.order_number},
        "theme": {"color": settings.RAZORPAY_THEME_COLOR},
        "redirect": True,
        "callback_url": f"{_callback_base(request)}/order-api/payment-return/{order.id}/",
        "method": {
            "upi": True, "card": True, "netbanking": True, "wallet": True,
            "emi": False, "paylater": False,
        },
        "retry": {"enabled": True, "max_count": 4},
        "timeout": settings.RAZORPAY_PAYMENT_TIMEOUT_SECONDS,
        "modal": {"confirm_close": True, "escape": False, "backdropclose": False},
        "config": {"display": {"preferences": {"show_default_blocks": True}}},
    }
    if settings.SITE_URL.startswith("https://"):
        options["image"] = f"{settings.SITE_URL}/static/images/elegance-logo.png"
    return options


# ─────────────────────────────────────────────
# Payment records
# ─────────────────────────────────────────────
def amount_due(order):
    """What the customer still has to pay online for this order (0 if nothing)."""
    if order.payment_status not in ("pending", "failed"):
        return Decimal("0")
    if order.order_status in ("cancelled", "returned"):
        return Decimal("0")
    return order.cod_advance_amount if order.is_cod else order.total_amount


def _payment_type(order):
    return "cod_advance" if order.is_cod else "full_online"


def create_payment(order):
    """Create a Payment row backed by a fresh Razorpay order."""
    payment = Payment.objects.create(
        order=order, payment_type=_payment_type(order), amount=amount_due(order),
        status="created", environment=environment(),
    )
    try:
        payment.razorpay_order_id = create_gateway_order(order, payment)
    except RazorpayError as exc:
        payment.status = "failed"
        payment.error_description = exc.message[:255]
        payment.save(update_fields=["status", "error_description"])
        raise
    payment.save(update_fields=["razorpay_order_id"])
    return payment


def get_payable_payment(order):
    """The payment the customer should pay now: reuse the open Razorpay order
    if it is still valid, otherwise open a new one."""
    if amount_due(order) <= 0:
        raise RazorpayError("There is nothing left to pay on this order.")
    if not is_configured():
        raise RazorpayError(NOT_CONFIGURED_MESSAGE)

    open_payment = (
        order.payments.exclude(status="success")
        .filter(payment_type=_payment_type(order), environment=environment())
        .exclude(razorpay_order_id__isnull=True).exclude(razorpay_order_id="")
        .order_by("-created_at").first()
    )

    if open_payment and open_payment.amount == amount_due(order):
        try:
            gateway_order = fetch_gateway_order(open_payment.razorpay_order_id)
        except RazorpayError:
            gateway_order = None

        if gateway_order and gateway_order.get("status") == "paid":
            result = sync_payment(open_payment)
            if result.state == "success":
                raise RazorpayError("This order has already been paid.")
        elif gateway_order:
            if open_payment.status != "created":
                open_payment.status = "created"
                open_payment.save(update_fields=["status"])
            if order.payment_status == "failed":
                order.payment_status = "pending"
                order.save(update_fields=["payment_status"])
            return open_payment

    # Anything still open for this order is replaced by the new attempt.
    order.payments.filter(status="created").update(
        status="failed", error_description="Replaced by a new payment attempt.",
    )
    payment = create_payment(order)
    if order.payment_status == "failed":
        order.payment_status = "pending"
        order.save(update_fields=["payment_status"])
    return payment


# ─────────────────────────────────────────────
# Syncing a payment with Razorpay
# ─────────────────────────────────────────────
def _method_detail(rp):
    method = rp.get("method") or ""
    if method == "upi":
        return f"UPI · {rp['vpa']}" if rp.get("vpa") else "UPI"
    if method == "card":
        card = rp.get("card") or {}
        network = (card.get("network") or "Card").title()
        last4 = card.get("last4")
        return f"{network} card ····{last4}" if last4 else f"{network} card"
    if method == "netbanking":
        return f"Net banking · {rp['bank']}" if rp.get("bank") else "Net banking"
    if method == "wallet":
        return f"Wallet · {rp['wallet'].title()}" if rp.get("wallet") else "Wallet"
    return method.title()


def _bank_reference(rp):
    acquirer = rp.get("acquirer_data") or {}
    return (
        acquirer.get("rrn") or acquirer.get("upi_transaction_id")
        or acquirer.get("bank_transaction_id") or acquirer.get("auth_code") or ""
    )


def _copy_gateway_details(payment, rp):
    payment.razorpay_payment_id = rp.get("id") or payment.razorpay_payment_id
    payment.razorpay_status = rp.get("status") or ""
    payment.method = rp.get("method") or ""
    payment.method_detail = _method_detail(rp)[:150]
    payment.bank_reference = str(_bank_reference(rp))[:100]
    payment.error_code = (rp.get("error_code") or "")[:100]
    payment.error_description = (rp.get("error_description") or "")[:255]
    payment.gateway_response = rp


def _finalize_success(payment, rp=None, razorpay_payment_id=None, signature=None):
    """Mark the payment paid and confirm the order. Safe to call twice."""
    with transaction.atomic():
        locked = Payment.objects.select_for_update().select_related("order").get(pk=payment.pk)
        if locked.status == "success":
            return locked

        if rp:
            _copy_gateway_details(locked, rp)
        else:
            locked.razorpay_payment_id = razorpay_payment_id or locked.razorpay_payment_id
            locked.razorpay_status = "captured"
        if signature:
            locked.razorpay_signature = signature
        locked.error_code = ""
        locked.error_description = ""
        locked.status = "success"
        locked.paid_at = timezone.now()
        locked.last_checked_at = timezone.now()
        locked.environment = locked.environment or environment()
        locked.save()

        order = locked.order
        order.payment_status = "partial" if locked.payment_type == "cod_advance" else "paid"
        if order.order_status == "placed":
            order.order_status = "confirmed"
            order.confirmed_at = timezone.now()
            OrderStatusHistory.objects.create(
                order=order, status="confirmed", note="Payment received — order confirmed.",
            )
        order.save()

        transaction.on_commit(lambda: mailer_emails.send_order_placed_email(order))
    return locked


def _record_failure(payment, rp):
    payment.status = "failed"
    _copy_gateway_details(payment, rp)
    payment.last_checked_at = timezone.now()
    payment.save()
    order = payment.order
    if order.payment_status == "pending":
        order.payment_status = "failed"
        order.save(update_fields=["payment_status"])


def _failure_message(payment):
    return payment.error_description or "Your payment didn't go through."


def sync_payment(payment, razorpay_payment_id=None, signature=None):
    """Work out what really happened to this payment and update our records.

    Razorpay's API is the source of truth. A valid signature from the browser
    redirect is also accepted, so a payment is never lost if the API call
    fails at the moment the customer comes back.
    """
    payment = Payment.objects.select_related("order", "order__user").get(pk=payment.pk)
    if payment.status == "success":
        return SyncResult("success", "Payment received.", payment)

    signature_ok = verify_payment_signature(payment.razorpay_order_id, razorpay_payment_id, signature)
    expected_paise = to_paise(payment.amount)

    try:
        attempts = fetch_order_payments(payment.razorpay_order_id)
    except RazorpayError as exc:
        attempts = None
        logger.warning("Could not read payments for %s: %s", payment.razorpay_order_id, exc.message)

    paid_attempt = None
    if attempts:
        for attempt in attempts:
            if attempt.get("amount") != expected_paise:
                continue
            if attempt.get("status") == "authorized":
                try:
                    attempt = capture_gateway_payment(attempt["id"], expected_paise)
                except RazorpayError as exc:
                    logger.warning("Capture failed for %s: %s", attempt.get("id"), exc.message)
                    continue
            if attempt.get("status") == "captured":
                paid_attempt = attempt
                break

    if paid_attempt:
        payment = _finalize_success(payment, rp=paid_attempt, signature=signature if signature_ok else None)
        return SyncResult("success", "Payment received.", payment)

    if signature_ok:
        payment = _finalize_success(payment, razorpay_payment_id=razorpay_payment_id, signature=signature)
        return SyncResult("success", "Payment received.", payment)

    payment.last_checked_at = timezone.now()

    if attempts is None:
        payment.save(update_fields=["last_checked_at"])
        return SyncResult("pending", "We're still waiting for the bank to confirm your payment.", payment)

    if not attempts:
        payment.razorpay_status = "not_attempted"
        payment.save(update_fields=["razorpay_status", "last_checked_at"])
        return SyncResult("pending", "We haven't received a payment for this order yet.", payment)

    if any(a.get("status") in ("created", "authorized") for a in attempts):
        payment.razorpay_status = "processing"
        payment.save(update_fields=["razorpay_status", "last_checked_at"])
        return SyncResult("pending", "Your bank is still processing the payment.", payment)

    latest_failed = max(
        (a for a in attempts if a.get("status") == "failed"),
        key=lambda a: a.get("created_at", 0), default=None,
    )
    if latest_failed:
        _record_failure(payment, latest_failed)
        return SyncResult("failed", _failure_message(payment), payment)

    payment.save(update_fields=["last_checked_at"])
    return SyncResult("pending", "We're still waiting for the bank to confirm your payment.", payment)


def record_reported_failure(payment, error_code="", error_description=""):
    """The redirect can carry an error before Razorpay's API shows the attempt;
    keep it so the customer sees a reason."""
    if payment.status == "success":
        return
    payment.error_code = (error_code or "")[:100]
    payment.error_description = (error_description or "")[:255]
    payment.save(update_fields=["error_code", "error_description"])
