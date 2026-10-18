"""Manual delivery: the store's own delivery person, Porter, or any courier the
admin books outside the system. No remote calls; the admin records status."""
from django.conf import settings

from .base import BaseCourier, TrackResult


class ManualCourier(BaseCourier):
    key = "manual"
    label = "Manual / Own delivery"
    api_based = False

    def list_pickup_locations(self):
        store = dict(settings.STORE_PICKUP_ADDRESS)
        return [{
            "name": store.get("name") or "Store",
            "contact_name": store.get("name") or "",
            "phone": store.get("phone", ""),
            "email": "",
            "address": store.get("address", ""),
            "address_2": "",
            "city": store.get("city", ""),
            "state": store.get("state", ""),
            "pincode": store.get("pincode", ""),
            "verified": True,
            "is_default": True,
        }]

    def book(self, shipment, courier_id=None):
        shipment.status = "pickup_scheduled"
        shipment.pickup_requested = True
        shipment.error_message = ""
        shipment.save()

    def request_pickup(self, shipment):
        shipment.pickup_requested = True
        shipment.status = "pickup_scheduled"
        shipment.save()

    def track(self, shipment):
        return TrackResult()
