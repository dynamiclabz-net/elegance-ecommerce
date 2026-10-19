"""Customer emails: welcome, order placed, order approved, out for delivery and delivered.

Every public `send_*` function is safe to call from a view or webhook: it never raises, sends each
event at most once per user/order, and records the outcome in EmailLog."""

import logging
from datetime import datetime

from django.conf import settings
from django.templatetags.static import static
from django.urls import NoReverseMatch, reverse

from Order import tax

from .links import absolute_url, invoice_link
from .service import send_email

logger = logging.getLogger(__name__)

TRACKER_STEPS = ["Placed", "Approved", "Shipped", "Out for delivery", "Delivered"]

# event -> (template, steps completed, subject)
ORDER_EVENTS = {
    "order_placed": ("emails/order_placed.html", 1, "We have received your order {number}"),
    "order_approved": ("emails/order_approved.html", 2, "Your order {number} is approved - invoice inside"),
    "order_out_for_delivery": ("emails/order_out_for_delivery.html", 4, "Your order {number} is out for delivery"),
    "order_delivered": ("emails/order_delivered.html", 5, "Your order {number} has been delivered"),
}


def _page_url(name, fallback, **kwargs):
    try:
        return absolute_url(reverse(name, kwargs=kwargs or None))
    except NoReverseMatch:
        return absolute_url(fallback)


def base_context():
    seller = tax.seller()
    support_emails = [e.strip() for e in str(seller.get("email", "")).split("/") if e.strip()]
    whatsapp = "".join(ch for ch in str(settings.STORE_WHATSAPP_NUMBER) if ch.isdigit())
    return {
        "store_name": "Elegance",
        "tagline": "An ethnic regalia",
        "logo_url": absolute_url(static("images/elegance-logo.png")),
        "home_url": absolute_url("/"),
        "shop_url": _page_url("shop-list", "/shop/"),
        "account_url": _page_url("account-list", "/account/"),
        "support_email": support_emails[0] if support_emails else "",
        "support_phone": seller.get("phone", ""),
        "whatsapp_url": f"https://wa.me/{whatsapp}" if whatsapp else "",
        "seller_address": seller.get("address", ""),
        "gstin": seller.get("gstin", ""),
        "year": datetime.now().year,
    }


def _first_name(*names):
    for name in names:
        if name and str(name).strip():
            return str(name).strip().split()[0].title()
    return "there"


def build_welcome_email(user):
    context = {
        **base_context(),
        "first_name": _first_name(getattr(user, "first_name", ""), getattr(user, "full_name", "")),
    }
    return {
        "to": user.email,
        "subject": f"Welcome to {context['store_name']}",
        "template": "emails/welcome.html",
        "context": context,
    }


def _item_rows(order):
    rows = []
    for item in order.items.select_related("product"):
        image = ""
        product = item.product
        if product is not None:
            primary = product.primary_image
            primary = primary() if callable(primary) else primary
            if primary and primary.image:
                image = absolute_url(primary.image.url)
        rows.append({
            "name": item.product_name,
            "variant": item.variant_label,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "total_price": item.total_price,
            "image": image,
        })
    return rows


def _address_lines(order):
    city_line = " ".join(part for part in (f"{order.shipping_city},", order.shipping_state, order.shipping_pincode) if part)
    lines = [order.shipping_full_name, order.shipping_address_line1, order.shipping_address_line2, city_line]
    if order.shipping_country and order.shipping_country.strip().lower() != "india":
        lines.append(order.shipping_country)
    if order.shipping_mobile:
        lines.append(f"Mobile: {order.shipping_mobile}")
    return [line for line in lines if line]


def build_order_email(order, event):
    template, steps_done, subject = ORDER_EVENTS[event]
    tax.ensure_invoice_details(order)

    steps = [
        {"label": label, "done": index < steps_done, "current": index == steps_done - 1}
        for index, label in enumerate(TRACKER_STEPS)
    ]
    context = {
        **base_context(),
        "order": order,
        "first_name": _first_name(order.shipping_full_name, getattr(order.user, "first_name", "")),
        "items": _item_rows(order),
        "summary": tax.build_price_summary(order),
        "address_lines": _address_lines(order),
        "payment_label": order.get_payment_method_display(),
        "is_cod": order.is_cod,
        "cod_advance": order.cod_advance_amount,
        "cod_balance": order.cod_balance_amount,
        "amount_to_collect": order.amount_to_collect,
        "steps": steps,
        "accent": "#3F6B4A" if event == "order_delivered" else "#b8860b",
        "order_url": _page_url("order-detail-detail", f"/order-detail/{order.pk}/", pk=order.pk),
        "courier": order.courier_partner,
        "tracking_id": order.tracking_id,
        "tracking_url": order.tracking_url,
        "placed_on": order.placed_at,
    }
    if event in ("order_approved", "order_delivered"):
        context["invoice_url"] = invoice_link(order)
        context["invoice_number"] = order.invoice_number

    return {
        "to": order.user.email if order.user_id else "",
        "subject": subject.format(number=order.order_number),
        "template": template,
        "context": context,
    }


def _send_order_event(order, event):
    try:
        built = build_order_email(order, event)
        return send_email(
            event=event, dedupe_key=f"{event}:{order.pk}", order=order, user=order.user, **built,
        )
    except Exception:
        logger.exception("Could not prepare %s email for order %s", event, getattr(order, "pk", "?"))
        return None


def send_welcome_email(user):
    """Welcome a new customer. Customers sign up with their mobile number, so this is called as soon as
    an email address is saved on their profile; it only ever sends once per customer."""
    try:
        if not user.email:
            return None
        built = build_welcome_email(user)
        return send_email(event="welcome", dedupe_key=f"welcome:{user.pk}", user=user, **built)
    except Exception:
        logger.exception("Could not prepare welcome email for user %s", getattr(user, "pk", "?"))
        return None


def send_order_placed_email(order):
    return _send_order_event(order, "order_placed")


def send_order_approved_email(order):
    return _send_order_event(order, "order_approved")


def send_order_out_for_delivery_email(order):
    return _send_order_event(order, "order_out_for_delivery")


def send_order_delivered_email(order):
    return _send_order_event(order, "order_delivered")


def notify_order_status(order, new_status):
    """Send the email that matches a status the order has just moved to (no-op for other statuses)."""
    if new_status == "out_for_delivery":
        return send_order_out_for_delivery_email(order)
    if new_status == "delivered":
        return send_order_delivered_email(order)
    return None
