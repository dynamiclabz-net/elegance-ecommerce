from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.urls import reverse

_SALT = "mailer.order-invoice"


def absolute_url(path):
    """Turn a site path ("/media/x.jpg") into a full URL; leave full URLs alone."""
    if not path:
        return ""
    if path.startswith(("http://", "https://")):
        return path
    return f"{settings.SITE_URL}/{path.lstrip('/')}"


def invoice_token(order):
    return signing.TimestampSigner(salt=_SALT).sign(order.order_number)


def invoice_token_is_valid(order_number, token):
    """True when `token` was issued for exactly this order and has not expired."""
    if not token:
        return False
    max_age = settings.EMAIL_INVOICE_LINK_MAX_AGE_DAYS * 24 * 60 * 60
    try:
        value = signing.TimestampSigner(salt=_SALT).unsign(token, max_age=max_age)
    except signing.BadSignature:
        return False
    return value == order_number


def invoice_link(order):
    """Absolute invoice download URL that works from an email without signing in."""
    path = reverse("order-invoice", kwargs={"order_number": order.order_number})
    return absolute_url(f"{path}?t={quote(invoice_token(order), safe='')}")
