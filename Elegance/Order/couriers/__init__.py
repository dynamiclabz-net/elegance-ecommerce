from django.conf import settings

from .base import CourierConfigError, CourierError, CourierNotAvailable
from .manual import ManualCourier
from .shiprocket import ShiprocketCourier
from .velocity import VelocityCourier

_REGISTRY = {
    "shiprocket": ShiprocketCourier,
    "velocity": VelocityCourier,
    "manual": ManualCourier,
}


def get_courier(key):
    try:
        return _REGISTRY[key]()
    except KeyError:
        raise CourierError(f"Unknown delivery partner '{key}'.")


def provider_catalog():
    """Providers the admin can choose from, with readiness info for the UI."""
    enabled = getattr(settings, "SHIPPING_PROVIDERS_ENABLED", {})
    catalog = []
    for key, cls in _REGISTRY.items():
        if not enabled.get(key, True):
            continue
        courier = cls()
        configured = courier.is_configured()
        catalog.append({
            "key": key,
            "label": courier.label,
            "api_based": courier.api_based,
            "available": courier.available and configured,
            "reason": "" if courier.available and configured else (
                "Coming soon" if not courier.available else courier.configuration_hint()
            ),
        })
    return catalog


__all__ = [
    "get_courier", "provider_catalog", "CourierError", "CourierConfigError", "CourierNotAvailable",
]
