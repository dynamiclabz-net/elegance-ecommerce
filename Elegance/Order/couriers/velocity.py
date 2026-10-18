"""Velocity placeholder. The interface is in place so the admin UI and the
registry already know about it; implement these methods when integrating."""
from .base import BaseCourier, CourierNotAvailable

MESSAGE = "Velocity integration is coming soon. Please choose Shiprocket or Manual delivery."


class VelocityCourier(BaseCourier):
    key = "velocity"
    label = "Velocity"
    available = False

    def is_configured(self):
        return False

    def configuration_hint(self):
        return "Coming soon."

    def list_pickup_locations(self):
        raise CourierNotAvailable(MESSAGE)

    def serviceability(self, order, pickup_pincode, weight_kg, cod_amount):
        raise CourierNotAvailable(MESSAGE)

    def book(self, shipment, courier_id=None):
        raise CourierNotAvailable(MESSAGE)

    def request_pickup(self, shipment):
        raise CourierNotAvailable(MESSAGE)

    def track(self, shipment):
        raise CourierNotAvailable(MESSAGE)

    def cancel(self, shipment):
        raise CourierNotAvailable(MESSAGE)
