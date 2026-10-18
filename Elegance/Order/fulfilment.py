"""Order fulfilment workflow: approve -> book a delivery partner -> track -> deliver.

Views stay thin and call into this module; everything that touches an order's
status or a shipment's state lives here so the rules are in one place."""
import logging
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from .couriers import CourierError, get_courier
from .models import Order, OrderStatusHistory, Payment, Shipment, ShipmentEvent

logger = logging.getLogger(__name__)

MANUAL_STATUSES = (
    "picked_up", "in_transit", "out_for_delivery", "delivered",
    "undelivered", "rto_initiated", "rto_delivered",
)
# Shipment states in which an API partner will still accept a cancellation.
API_CANCELLABLE = ("pending", "booked", "pickup_scheduled")
ORDER_RANK = {"processing": 1, "shipped": 2, "out_for_delivery": 3, "delivered": 4}


class FulfilmentError(Exception):
    """A rule was violated; the message is safe to show to the admin."""


# ── helpers ───────────────────────────────────────────────────────────────
def log_history(order, note, user=None, status=None):
    OrderStatusHistory.objects.create(
        order=order, status=status or order.order_status, note=(note or "")[:255], changed_by=user,
    )


def pickup_date_options():
    """Dates an admin may schedule a pickup for, honouring the daily cut-off."""
    now = timezone.localtime()
    start = now.date()
    if now.hour >= settings.SHIPPING_PICKUP_CUTOFF_HOUR:
        start += timedelta(days=1)
    return [start + timedelta(days=i) for i in range(settings.SHIPPING_PICKUP_MAX_DAYS_AHEAD)]


def parse_pickup_date(value):
    if not value:
        raise FulfilmentError("Please choose a pickup date.")
    try:
        chosen = value if isinstance(value, date) else date.fromisoformat(str(value))
    except ValueError:
        raise FulfilmentError("Pickup date is invalid.")
    if chosen not in pickup_date_options():
        raise FulfilmentError(
            "Pickup date must be within the next "
            f"{settings.SHIPPING_PICKUP_MAX_DAYS_AHEAD} days "
            f"(today's pickups close at {settings.SHIPPING_PICKUP_CUTOFF_HOUR}:00)."
        )
    return chosen


def default_parcel(order):
    units = sum(item.quantity for item in order.items.all()) or 1
    weight = max(round(units * settings.SHIPPING_DEFAULT_ITEM_WEIGHT_KG, 2), 0.1)
    package = settings.SHIPPING_DEFAULT_PACKAGE_CM
    return {
        "weight_kg": weight,
        "length_cm": package["length"],
        "breadth_cm": package["breadth"],
        "height_cm": package["height"],
    }


def _positive_decimal(value, label, maximum):
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise FulfilmentError(f"{label} must be a number.")
    if number <= 0 or number > maximum:
        raise FulfilmentError(f"{label} must be between 0 and {maximum}.")
    return number


def _parcel_from_input(order, data):
    defaults = default_parcel(order)
    return {
        "weight_kg": _positive_decimal(data.get("weight_kg") or defaults["weight_kg"], "Weight (kg)", 50),
        "length_cm": _positive_decimal(data.get("length_cm") or defaults["length_cm"], "Length (cm)", 200),
        "breadth_cm": _positive_decimal(data.get("breadth_cm") or defaults["breadth_cm"], "Breadth (cm)", 200),
        "height_cm": _positive_decimal(data.get("height_cm") or defaults["height_cm"], "Height (cm)", 200),
    }


def sync_order_tracking(order):
    """Mirror the active shipment's tracking details onto the order."""
    shipment = order.active_shipment
    if shipment:
        order.courier_partner = (shipment.courier_name or shipment.get_provider_display())[:50]
        order.tracking_id = shipment.awb_code or None
        order.tracking_url = shipment.tracking_url or None
    else:
        order.courier_partner = ""
        order.tracking_id = None
        order.tracking_url = None
    order.save(update_fields=["courier_partner", "tracking_id", "tracking_url"])


# ── approval ──────────────────────────────────────────────────────────────
def approve_order(order, user, note=""):
    if order.order_status in ("cancelled", "returned", "delivered"):
        raise FulfilmentError(f"A {order.get_order_status_display().lower()} order cannot be approved.")
    if order.is_approved:
        raise FulfilmentError("This order is already approved.")
    paid_enough = order.payment_status in ("paid", "partial") or (
        order.is_cod and Decimal(order.cod_advance_amount or 0) == 0
    )
    if not paid_enough:
        raise FulfilmentError(
            "Payment has not been received for this order yet. Approve it after the payment succeeds."
        )

    now = timezone.now()
    order.approved_at = now
    order.approved_by = user
    order.order_status = "processing"
    if not order.confirmed_at:
        order.confirmed_at = now
    order.save(update_fields=["approved_at", "approved_by", "order_status", "confirmed_at"])
    log_history(order, note or "Order approved by admin.", user)
    return order


# ── booking ───────────────────────────────────────────────────────────────
def _resolve_pickup_location(courier, name):
    if not name:
        raise FulfilmentError("Please choose a pickup address.")
    for location in courier.list_pickup_locations():
        if location["name"] == name:
            return location
    raise FulfilmentError(f"Pickup address '{name}' was not found with this delivery partner.")


def _provider_order_id(order):
    previous = order.shipments.count()
    return order.order_number if previous == 0 else f"{order.order_number}-R{previous}"


def create_shipment(order, user, data):
    """Create and book a shipment. `data` is the admin's form input."""
    if not order.is_approved:
        raise FulfilmentError("Approve the order before booking a delivery partner.")
    if order.order_status != "processing":
        raise FulfilmentError(
            f"Cannot book delivery for an order that is {order.get_order_status_display().lower()}."
        )
    if order.active_shipment:
        raise FulfilmentError("This order already has an active shipment. Cancel it before booking a new one.")

    provider = data.get("provider")
    courier = get_courier(provider)
    if not courier.available:
        raise FulfilmentError(f"{courier.label} is not available yet.")
    if not courier.is_configured():
        raise FulfilmentError(f"{courier.label} is not configured. {courier.configuration_hint()}")

    pickup_date = parse_pickup_date(data.get("pickup_date"))
    parcel = _parcel_from_input(order, data)

    try:
        location = _resolve_pickup_location(courier, data.get("pickup_location"))
    except CourierError as exc:
        raise FulfilmentError(str(exc))

    if provider == "manual" and not (data.get("courier_name") or "").strip():
        raise FulfilmentError("Enter who will deliver this order (e.g. 'Own delivery - Ramesh' or 'Porter').")

    try:
        shipping_cost = Decimal(str(data.get("shipping_cost") or 0))
    except InvalidOperation:
        shipping_cost = Decimal(0)

    try:
        with transaction.atomic():
            shipment = Shipment.objects.create(
                order=order,
                provider=provider,
                provider_order_id=_provider_order_id(order),
                pickup_location=location["name"],
                pickup_address=location,
                pickup_date=pickup_date,
                cod_amount=order.amount_to_collect,
                shipping_cost=shipping_cost,
                courier_name=(data.get("courier_name") or "").strip()[:150],
                awb_code=(data.get("awb_code") or "").strip()[:100] if provider == "manual" else "",
                tracking_url=(data.get("tracking_url") or "").strip()[:700] if provider == "manual" else "",
                note=(data.get("note") or "").strip()[:255],
                created_by=user,
                **parcel,
            )
    except IntegrityError:
        raise FulfilmentError("This order already has an active shipment.")

    courier_id = data.get("courier_id") or None
    try:
        courier.book(shipment, courier_id=courier_id)
    except CourierError as exc:
        shipment.refresh_from_db()
        shipment.error_message = str(exc)
        if not shipment.provider_shipment_id:
            # Nothing exists at the partner, so there is nothing to resume.
            shipment.status = "failed"
            shipment.is_active = False
            shipment.save()
            raise FulfilmentError(f"Booking failed: {exc}")
        shipment.save()
        log_history(order, f"Shipment partly booked with {courier.label}: {exc}", user)
        sync_order_tracking(order)
        return shipment, []

    warnings = _finish_booking(shipment, courier)
    log_history(order, _booking_note(shipment), user)
    return shipment, warnings


def _finish_booking(shipment, courier):
    warnings = courier.fetch_documents(shipment) if shipment.is_api_provider else []
    if shipment.provider == "shiprocket" and shipment.awb_code and not shipment.tracking_url:
        shipment.tracking_url = f"https://shiprocket.co/tracking/{shipment.awb_code}"
        shipment.save(update_fields=["tracking_url", "updated_at"])
    if warnings:
        shipment.error_message = "; ".join(warnings)
        shipment.save(update_fields=["error_message", "updated_at"])
    sync_order_tracking(shipment.order)
    return warnings


def _booking_note(shipment):
    parts = [f"Booked with {shipment.get_provider_display()}"]
    if shipment.courier_name:
        parts.append(f"courier {shipment.courier_name}")
    if shipment.awb_code:
        parts.append(f"AWB {shipment.awb_code}")
    if shipment.pickup_date:
        parts.append(f"pickup on {shipment.pickup_date.strftime('%d %b %Y')}")
    return ", ".join(parts) + "."


def retry_shipment(shipment, user, pickup_date=None):
    """Resume a partly-booked shipment from the step that failed."""
    if not shipment.is_active or shipment.is_final:
        raise FulfilmentError("This shipment can no longer be retried.")
    if not shipment.is_api_provider:
        raise FulfilmentError("Manual shipments don't need a retry.")

    if pickup_date:
        shipment.pickup_date = parse_pickup_date(pickup_date)
        shipment.save(update_fields=["pickup_date", "updated_at"])

    courier = get_courier(shipment.provider)
    try:
        courier.book(shipment, courier_id=shipment.courier_id or None)
    except CourierError as exc:
        shipment.error_message = str(exc)
        shipment.save(update_fields=["error_message", "updated_at"])
        raise FulfilmentError(f"Retry failed: {exc}")

    warnings = _finish_booking(shipment, courier)
    log_history(shipment.order, _booking_note(shipment), user)
    return shipment, warnings


def refresh_documents(shipment):
    if not shipment.is_api_provider:
        raise FulfilmentError("Manual shipments have no partner documents. Use the printable packing slip.")
    courier = get_courier(shipment.provider)
    try:
        warnings = courier.fetch_documents(shipment)
    except CourierError as exc:
        raise FulfilmentError(str(exc))
    shipment.error_message = "; ".join(warnings)
    shipment.save(update_fields=["error_message", "updated_at"])
    return warnings


def update_manual_pickup(shipment, pickup_date):
    if shipment.provider != "manual":
        raise FulfilmentError("Only manual shipments can be rescheduled here.")
    if shipment.status not in ("pickup_scheduled", "booked"):
        raise FulfilmentError("Pickup can only be rescheduled before the parcel is picked up.")
    shipment.pickup_date = parse_pickup_date(pickup_date)
    shipment.save(update_fields=["pickup_date", "updated_at"])
    return shipment


# ── cancellation ──────────────────────────────────────────────────────────
def cancel_shipment(shipment, user, reason=""):
    if not shipment.is_active:
        raise FulfilmentError("This shipment is already closed.")
    if shipment.status in ("delivered", "rto_delivered"):
        raise FulfilmentError("A delivered shipment cannot be cancelled.")

    if shipment.is_api_provider:
        if shipment.status not in API_CANCELLABLE:
            raise FulfilmentError(
                "The courier has already picked this parcel up, so it can't be cancelled here. "
                "Contact the courier or wait for it to return."
            )
        try:
            get_courier(shipment.provider).cancel(shipment)
        except CourierError as exc:
            raise FulfilmentError(f"{shipment.get_provider_display()} refused the cancellation: {exc}")

    _close_shipment(shipment, "cancelled", reason or "Cancelled by admin")
    log_history(shipment.order, f"Shipment cancelled. {reason}".strip(), user)
    return shipment


def _close_shipment(shipment, status, text):
    shipment.status = status
    shipment.is_active = False
    shipment.cancelled_at = timezone.now()
    shipment.last_status_text = text[:255]
    shipment.save()
    ShipmentEvent.objects.get_or_create(
        shipment=shipment, occurred_at=timezone.now(), raw_status="CANCELLED", activity=text[:500],
        defaults={"status": status},
    )
    sync_order_tracking(shipment.order)


def restock_order(order):
    for item in order.items.select_related("product", "variant"):
        if item.variant_id:
            type(item.variant).objects.filter(pk=item.variant_id).update(
                stock_quantity=F("stock_quantity") + item.quantity
            )
        elif item.product_id:
            type(item.product).objects.filter(pk=item.product_id).update(
                stock_quantity=F("stock_quantity") + item.quantity
            )


def cancel_order(order, user, reason=""):
    """Cancel an order: close any shipment, return stock, flag refunds."""
    if order.order_status == "cancelled":
        raise FulfilmentError("This order is already cancelled.")
    if order.order_status in ("delivered", "returned"):
        raise FulfilmentError(f"A {order.get_order_status_display().lower()} order cannot be cancelled.")

    shipment = order.active_shipment
    if shipment:
        cancel_shipment(shipment, user, reason or "Order cancelled")

    with transaction.atomic():
        order.order_status = "cancelled"
        order.cancelled_at = order.cancelled_at or timezone.now()
        order.save(update_fields=["order_status", "cancelled_at"])
        restock_order(order)
        note = reason or "Order cancelled by admin."
        if order.payment_status in ("paid", "partial"):
            paid = order.cod_advance_amount if order.is_cod else order.total_amount
            note += f" Refund of Rs.{paid} is pending - process it manually."
        log_history(order, note, user, status="cancelled")
    return order


# ── tracking ──────────────────────────────────────────────────────────────
def _apply_events(shipment, events):
    for event in events:
        ShipmentEvent.objects.get_or_create(
            shipment=shipment, occurred_at=event.occurred_at,
            raw_status=event.raw_status, activity=event.activity,
            defaults={"status": event.status, "location": event.location},
        )


def apply_track_result(shipment, result):
    """Store scans and move the shipment (and order) forward. Returns True on change."""
    _apply_events(shipment, result.events)

    shipment.last_synced_at = timezone.now()
    if result.tracking_url:
        shipment.tracking_url = result.tracking_url
    if result.estimated_delivery:
        shipment.estimated_delivery = result.estimated_delivery

    latest = shipment.events.order_by("-occurred_at", "-id").first()
    new_status = (latest.status if latest else None) or result.status
    if latest:
        shipment.last_status_text = (latest.activity or latest.raw_status)[:255]
    elif result.status_text:
        shipment.last_status_text = result.status_text[:255]

    changed = False
    if new_status and new_status != shipment.status and not shipment.is_final:
        if new_status == "cancelled":
            shipment.save()
            _close_shipment(shipment, "cancelled", "Cancelled by the delivery partner")
            log_history(
                shipment.order,
                f"{shipment.get_provider_display()} cancelled the shipment. Book it again to continue.",
            )
            return True
        shipment.status = new_status
        changed = True
    shipment.save()

    if changed:
        sync_order_from_shipment(shipment)
    sync_order_tracking(shipment.order)
    return changed


def sync_order_from_shipment(shipment, user=None):
    """Translate a shipment status into the matching order status (never backwards)."""
    order = shipment.order
    if order.order_status in ("cancelled", "returned"):
        return

    status = shipment.status
    target = {
        "picked_up": "shipped", "in_transit": "shipped",
        "out_for_delivery": "out_for_delivery", "delivered": "delivered",
    }.get(status)

    if status == "rto_delivered":
        order.order_status = "returned"
        order.save(update_fields=["order_status"])
        log_history(order, "Parcel returned to seller (RTO). Refund / restock needs review.", user)
        return

    if status in ("undelivered", "rto_initiated"):
        text = "Delivery attempt failed." if status == "undelivered" else "Parcel is returning to the seller (RTO)."
        log_history(order, f"{text} {shipment.last_status_text}".strip(), user)
        return

    if not target:
        return
    if ORDER_RANK.get(target, 0) <= ORDER_RANK.get(order.order_status, 0):
        return

    order.order_status = target
    stamp = {
        "shipped": "shipped_at", "out_for_delivery": "out_for_delivery_at", "delivered": "delivered_at",
    }[target]
    if not getattr(order, stamp):
        setattr(order, stamp, timezone.now())
    order.save()

    if target == "delivered":
        _record_cod_collection(order)
    log_history(order, f"{shipment.get_status_display()} ({shipment.get_provider_display()}).", user)


def _record_cod_collection(order):
    """COD balance is collected by the courier at the door; mark it paid on delivery."""
    if not order.is_cod or order.payment_status == "paid":
        return
    balance = Decimal(order.cod_balance_amount or 0)
    if balance > 0 and not order.payments.filter(payment_type="cod_balance", status="success").exists():
        Payment.objects.create(
            order=order, payment_type="cod_balance", amount=balance, status="success", paid_at=timezone.now(),
        )
    order.payment_status = "paid"
    order.save(update_fields=["payment_status"])


def update_manual_status(shipment, user, new_status, note="", occurred_at=None):
    if shipment.provider != "manual":
        raise FulfilmentError("Status for courier shipments is updated automatically from tracking.")
    if not shipment.is_active or shipment.is_final:
        raise FulfilmentError("This shipment is closed.")
    if new_status not in MANUAL_STATUSES:
        raise FulfilmentError("Invalid shipment status.")

    when = occurred_at or timezone.now()
    ShipmentEvent.objects.create(
        shipment=shipment, status=new_status, raw_status=new_status.upper(),
        activity=(note or dict(shipment._meta.get_field("status").choices)[new_status])[:500],
        location="", occurred_at=when,
    )
    shipment.status = new_status
    shipment.last_status_text = (note or shipment.get_status_display())[:255]
    shipment.last_synced_at = timezone.now()
    shipment.save()
    sync_order_from_shipment(shipment, user)
    sync_order_tracking(shipment.order)
    return shipment


def sync_shipment(shipment):
    """Pull the latest scans from the partner. Returns True if anything changed."""
    if not shipment.is_api_provider or not shipment.awb_code:
        return False
    result = get_courier(shipment.provider).track(shipment)
    return apply_track_result(shipment, result)


def refresh_if_stale(shipment):
    """Best-effort refresh used when a customer opens their order."""
    if not (shipment and shipment.is_active and shipment.is_api_provider and shipment.awb_code):
        return
    if shipment.is_final:
        return
    stale_after = timedelta(minutes=settings.SHIPPING_TRACKING_STALE_MINUTES)
    if shipment.last_synced_at and timezone.now() - shipment.last_synced_at < stale_after:
        return
    try:
        sync_shipment(shipment)
    except Exception:
        logger.exception("Tracking refresh failed for shipment %s", shipment.pk)
        shipment.last_synced_at = timezone.now()
        shipment.save(update_fields=["last_synced_at"])


def handle_webhook(provider, payload):
    """Apply a partner webhook. Returns True if a matching shipment was found."""
    if provider != "shiprocket":
        return False
    from .couriers.shiprocket import ShiprocketCourier

    awb, result = ShiprocketCourier.parse_webhook(payload)
    if not awb:
        return False
    shipment = Shipment.objects.filter(provider="shiprocket", awb_code=awb).order_by("-created_at").first()
    if not shipment:
        return False
    apply_track_result(shipment, result)
    return True
