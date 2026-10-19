"""GST maths shared by checkout, the order APIs and the invoice PDF.

Product prices are GST-inclusive. For each order line:

    taxable value = gross / (1 + rate / 100)
    GST           = gross - taxable value

The GST is split into CGST + SGST when the buyer is in the seller's state, and
charged as IGST otherwise. Shipping is shown separately and is not taxed here.
"""
import re
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

CENT = Decimal("0.01")
ZERO = Decimal("0.00")

GST_STATE_CODES = {
    "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03", "chandigarh": "04",
    "uttarakhand": "05", "haryana": "06", "delhi": "07", "rajasthan": "08", "uttar pradesh": "09",
    "bihar": "10", "sikkim": "11", "arunachal pradesh": "12", "nagaland": "13", "manipur": "14",
    "mizoram": "15", "tripura": "16", "meghalaya": "17", "assam": "18", "west bengal": "19",
    "jharkhand": "20", "odisha": "21", "chhattisgarh": "22", "madhya pradesh": "23", "gujarat": "24",
    "dadra and nagar haveli and daman and diu": "26", "maharashtra": "27", "karnataka": "29",
    "goa": "30", "lakshadweep": "31", "kerala": "32", "tamil nadu": "33", "puducherry": "34",
    "andaman and nicobar islands": "35", "telangana": "36", "andhra pradesh": "37", "ladakh": "38",
}

STATE_ALIASES = {
    "orissa": "odisha", "jammu & kashmir": "jammu and kashmir", "nct of delhi": "delhi",
    "new delhi": "delhi", "pondicherry": "puducherry", "uttaranchal": "uttarakhand",
    "andaman & nicobar islands": "andaman and nicobar islands",
    "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
    "daman and diu": "dadra and nagar haveli and daman and diu",
    "dadra & nagar haveli and daman & diu": "dadra and nagar haveli and daman and diu",
}


def _money(value):
    return Decimal(value or 0).quantize(CENT, ROUND_HALF_UP)


def _normalize_state(name):
    key = re.sub(r"\s+", " ", (name or "").strip().lower())
    return STATE_ALIASES.get(key, key)


def state_code(name):
    """GST state code for a state name, or '' when it is not recognised."""
    return GST_STATE_CODES.get(_normalize_state(name), "")


def seller():
    return settings.STORE_INVOICE


def is_intra_state(buyer_state):
    """True when CGST + SGST applies (buyer in the seller's state)."""
    return _normalize_state(buyer_state) == _normalize_state(seller()["state"])


def default_hsn():
    return str(getattr(settings, "SHIPPING_DEFAULT_HSN", "") or "")


def split_inclusive(gross, rate):
    """Split a GST-inclusive amount into (taxable value, gst)."""
    gross = _money(gross)
    rate = Decimal(rate or 0)
    taxable = _money(gross * Decimal(100) / (Decimal(100) + rate))
    return taxable, gross - taxable


def _item_gst_rate(item):
    product = item.product
    return Decimal(product.gst_rate) if product is not None else Decimal(0)


def _item_hsn(item):
    product = item.product
    return (product.hsn_code if product is not None and product.hsn_code else default_hsn())


def snapshot_order_tax(order):
    """Compute and store the per-line and order-level GST snapshot."""
    items = list(order.items.select_related("product").all())
    intra = is_intra_state(order.shipping_state)

    subtotal = sum((_money(i.total_price) for i in items), ZERO)
    discount = _money(order.discount_amount)
    remaining_discount = discount

    totals = {"taxable": ZERO, "cgst": ZERO, "sgst": ZERO, "igst": ZERO}
    for index, item in enumerate(items):
        gross = _money(item.total_price)
        if discount and subtotal:
            if index == len(items) - 1:
                share = remaining_discount
            else:
                share = _money(discount * gross / subtotal)
                remaining_discount -= share
            gross = max(gross - share, ZERO)

        rate = _item_gst_rate(item)
        taxable, gst = split_inclusive(gross, rate)
        cgst = sgst = igst = ZERO
        if intra:
            cgst = _money(gst / 2)
            sgst = gst - cgst
        else:
            igst = gst

        item.hsn_code = item.hsn_code or _item_hsn(item)
        item.gst_rate = rate
        item.taxable_value = taxable
        item.cgst_amount, item.sgst_amount, item.igst_amount = cgst, sgst, igst
        item.save(update_fields=[
            "hsn_code", "gst_rate", "taxable_value", "cgst_amount", "sgst_amount", "igst_amount",
        ])

        totals["taxable"] += taxable
        totals["cgst"] += cgst
        totals["sgst"] += sgst
        totals["igst"] += igst

    order.taxable_amount = totals["taxable"]
    order.cgst_amount = totals["cgst"]
    order.sgst_amount = totals["sgst"]
    order.igst_amount = totals["igst"]
    order.gst_amount = totals["cgst"] + totals["sgst"] + totals["igst"]
    order.tax_computed = True
    order.save(update_fields=[
        "taxable_amount", "cgst_amount", "sgst_amount", "igst_amount", "gst_amount", "tax_computed",
    ])


def financial_year(moment):
    """Indian financial year label, e.g. '26-27' for any date between Apr 2026 and Mar 2027."""
    start = moment.year if moment.month >= 4 else moment.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


def assign_invoice_number(order):
    """Give the order the next invoice number of its financial year (GUJ/26-27/00001)."""
    from .models import Order

    moment = timezone.localtime(order.placed_at or timezone.now())
    prefix = f"{seller()['state_abbr']}/{financial_year(moment)}/"
    for _ in range(5):
        last = (
            Order.objects.filter(invoice_number__startswith=prefix)
            .order_by("-invoice_number").values_list("invoice_number", flat=True).first()
        )
        try:
            sequence = int(last.rsplit("/", 1)[-1]) + 1 if last else 1
        except ValueError:
            sequence = 1
        order.invoice_number = f"{prefix}{sequence:05d}"
        order.invoice_date = order.invoice_date or moment
        try:
            with transaction.atomic():
                order.save(update_fields=["invoice_number", "invoice_date"])
            return
        except IntegrityError:
            order.invoice_number = None
    raise RuntimeError("Could not allocate an invoice number.")


def ensure_invoice_details(order):
    """Idempotent: fills in the tax snapshot and invoice number if missing.

    Called when an order is placed, and lazily for orders that pre-date GST support."""
    if not order.tax_computed:
        snapshot_order_tax(order)
    if not order.invoice_number:
        assign_invoice_number(order)
    return order


def build_price_summary(order):
    """The price breakup shown on the admin and customer order pages and on the invoice."""
    items = list(order.items.all())
    subtotal = _money(order.subtotal)
    discount = _money(order.discount_amount)
    shipping = _money(order.shipping_charge)
    total = _money(order.total_amount)

    taxable = _money(order.taxable_amount)
    basic_value = sum(
        (split_inclusive(i.total_price, i.gst_rate)[0] for i in items), ZERO
    ) if order.tax_computed else subtotal
    discount_excl_gst = basic_value - taxable if order.tax_computed else discount

    return {
        "tax_computed": order.tax_computed,
        "is_igst": _money(order.igst_amount) > 0,
        "items_total": subtotal,
        "basic_value": basic_value,
        "discount": discount,
        "discount_excl_gst": discount_excl_gst,
        "taxable_amount": taxable,
        "cgst_amount": _money(order.cgst_amount),
        "sgst_amount": _money(order.sgst_amount),
        "igst_amount": _money(order.igst_amount),
        "gst_amount": _money(order.gst_amount),
        "shipping_charge": shipping,
        "round_off": total - (subtotal - discount + shipping),
        "total_amount": total,
    }
