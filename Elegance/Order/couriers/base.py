"""Shared types and helpers for delivery-partner integrations."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from django.utils import timezone


class CourierError(Exception):
    """A delivery partner rejected a request or could not be reached.

    The message is safe to show to the admin."""


class CourierConfigError(CourierError):
    """Credentials / settings for the partner are missing."""


class CourierNotAvailable(CourierError):
    """The partner is not integrated yet (e.g. Velocity)."""


@dataclass
class TrackEvent:
    status: str
    raw_status: str
    activity: str
    location: str
    occurred_at: datetime


@dataclass
class TrackResult:
    events: list = field(default_factory=list)
    status_text: str = ""
    status: Optional[str] = None
    tracking_url: str = ""
    estimated_delivery: Optional[datetime] = None


_DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%d %m %Y %H:%M:%S",
    "%d-%m-%Y %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d",
    "%d-%m-%Y",
)


def parse_datetime(value):
    """Parse the date formats partners send into an aware datetime (store time zone)."""
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        parsed = None
        for fmt in _DATE_FORMATS:
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
        if parsed is None:
            try:
                parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            except ValueError:
                return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


class BaseCourier:
    """Interface every delivery partner implements.

    Methods that talk to the partner mutate and save the passed `Shipment`
    after each remote step, so a failure part-way can be resumed."""

    key = ""
    label = ""
    available = True
    api_based = True

    def is_configured(self):
        return True

    def configuration_hint(self):
        return ""

    def list_pickup_locations(self):
        return []

    def serviceability(self, order, pickup_pincode, weight_kg, cod_amount):
        return []

    def book(self, shipment, courier_id=None):
        raise NotImplementedError

    def request_pickup(self, shipment):
        raise NotImplementedError

    def fetch_documents(self, shipment):
        """Refresh label / invoice / manifest URLs. Returns a list of warnings."""
        return []

    def track(self, shipment):
        return TrackResult()

    def cancel(self, shipment):
        return None
