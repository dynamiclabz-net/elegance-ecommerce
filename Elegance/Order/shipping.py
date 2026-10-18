"""Pincode based delivery pricing.

Everything that needs to read or validate delivery rates goes through this
module: the admin API, the public rate lookup, checkout, the model's own
`clean()` and the Excel import script."""

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

MIN_PINCODE = 100000
MAX_PINCODE = 999999

# Orders at or above this subtotal ship free regardless of the pincode rate.
FREE_SHIPPING_THRESHOLD = Decimal("2999")

_LOWERCASE_WORDS = {"and", "of", "the"}
_RANGE_PATTERN = re.compile(r"^\s*(\d{6})\s*(?:[-\u2010-\u2015]|to)?\s*(\d{6})?\s*$", re.IGNORECASE)


def normalize_state(value) -> str:
    """'  uttar   PRADESH ' -> 'Uttar Pradesh' (keeps 'and'/'of' lowercase)."""
    words = re.sub(r"\s+", " ", str(value or "")).strip().split(" ")
    cleaned = []
    for index, word in enumerate(w for w in words if w):
        lowered = word.lower()
        cleaned.append(lowered if (index and lowered in _LOWERCASE_WORDS) else lowered.capitalize())
    return " ".join(cleaned)


def normalize_pincode(value) -> Optional[int]:
    """Returns a valid 6-digit pincode as int, or None."""
    text = str(value if value is not None else "").strip()
    if not re.fullmatch(r"\d{6}", text):
        return None
    number = int(text)
    return number if MIN_PINCODE <= number <= MAX_PINCODE else None


def parse_pincode_range(value):
    """'380001-396590', '380001 – 396590' or a single '110001' -> (start, end).
    Raises ValueError with a readable message for anything else."""
    match = _RANGE_PATTERN.match(str(value or ""))
    if not match:
        raise ValueError(f"'{value}' is not a valid pincode range. Use the format 380001-396590.")
    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else start
    return start, end


def format_range(start, end) -> str:
    return f"{start}" if start == end else f"{start}\u2013{end}"


def find_conflicts(start, end, exclude_pk=None):
    """Existing ranges that share at least one pincode with start..end."""
    from .models import PincodeRange

    queryset = PincodeRange.objects.filter(pincode_start__lte=end, pincode_end__gte=start)
    if exclude_pk:
        queryset = queryset.exclude(pk=exclude_pk)
    return queryset.order_by("pincode_start")


def validate_range(start, end, exclude_pk=None):
    """Returns (errors, conflicts). `errors` is a list of readable messages,
    `conflicts` a list of dicts describing the overlapping ranges."""
    errors = []

    if start is None or end is None:
        return ["Both the 'From' and 'To' pincodes are required."], []

    for label, number in (("From", start), ("To", end)):
        if not isinstance(number, int) or not (MIN_PINCODE <= number <= MAX_PINCODE):
            errors.append(f"'{label}' pincode must be a 6-digit number between {MIN_PINCODE} and {MAX_PINCODE}.")
    if errors:
        return errors, []

    if start > end:
        return ["'From' pincode cannot be greater than 'To' pincode."], []

    conflicts = [
        {
            "id": existing.pk,
            "state": existing.state,
            "pincode_start": existing.pincode_start,
            "pincode_end": existing.pincode_end,
            "price": str(existing.price),
            "is_active": existing.is_active,
        }
        for existing in find_conflicts(start, end, exclude_pk)
    ]

    if conflicts:
        shown = ", ".join(
            f"{format_range(c['pincode_start'], c['pincode_end'])} ({c['state']})" for c in conflicts[:3]
        )
        extra = f" and {len(conflicts) - 3} more" if len(conflicts) > 3 else ""
        errors.append(
            f"Range {format_range(start, end)} overlaps with existing "
            f"{'range' if len(conflicts) == 1 else 'ranges'}: {shown}{extra}. "
            "Edit or delete the existing range first."
        )

    return errors, conflicts


def find_rate(pincode):
    """The active PincodeRange covering `pincode`, or None."""
    from .models import PincodeRange

    number = normalize_pincode(pincode)
    if number is None:
        return None
    return (
        PincodeRange.objects.filter(is_active=True, pincode_start__lte=number, pincode_end__gte=number)
        .order_by("pincode_start")
        .first()
    )


@dataclass
class ShippingQuote:
    pincode: str
    serviceable: bool
    state: str = ""
    rate: Decimal = Decimal("0")
    shipping_charge: Decimal = Decimal("0")
    is_free_shipping: bool = False
    message: str = ""

    def as_dict(self):
        return {
            "pincode": self.pincode,
            "serviceable": self.serviceable,
            "state": self.state,
            "rate": float(self.rate),
            "shipping_charge": float(self.shipping_charge),
            "is_free_shipping": self.is_free_shipping,
            "free_shipping_threshold": float(FREE_SHIPPING_THRESHOLD),
            "message": self.message,
        }


def quote_shipping(pincode, subtotal=None) -> ShippingQuote:
    """Delivery price for a pincode. When `subtotal` is given, the free
    shipping threshold is applied on top of the pincode rate."""
    text = str(pincode or "").strip()

    if normalize_pincode(text) is None:
        return ShippingQuote(pincode=text, serviceable=False, message="Enter a valid 6-digit pincode.")

    matched = find_rate(text)
    if matched is None:
        return ShippingQuote(
            pincode=text, serviceable=False,
            message="Sorry, we don't deliver to this pincode yet.",
        )

    is_free = subtotal is not None and Decimal(subtotal) >= FREE_SHIPPING_THRESHOLD
    return ShippingQuote(
        pincode=text,
        serviceable=True,
        state=matched.state,
        rate=matched.price,
        shipping_charge=Decimal("0") if is_free else matched.price,
        is_free_shipping=is_free,
    )
