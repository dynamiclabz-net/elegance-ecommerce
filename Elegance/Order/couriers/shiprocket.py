"""Shiprocket integration (https://apidocs.shiprocket.in)."""
import re
from decimal import Decimal

import requests
from django.conf import settings
from django.core.cache import cache

from .base import (
    BaseCourier, CourierConfigError, CourierError, TrackEvent, TrackResult, parse_datetime,
)

REQUEST_TIMEOUT = 25
TOKEN_TTL_SECONDS = 9 * 24 * 3600  # Shiprocket tokens last 10 days


def normalize_status(text):
    """Map a Shiprocket / courier status string to our internal shipment status."""
    value = (text or "").upper().strip()
    if not value:
        return None
    if "RTO" in value:
        return "rto_delivered" if "DELIVERED" in value else "rto_initiated"
    if "UNDELIVERED" in value or "DELIVERY ATTEMPT" in value or "LOST" in value or "DAMAGED" in value:
        return "undelivered"
    if "OUT FOR DELIVERY" in value:
        return "out_for_delivery"
    if "DELIVERED" in value:
        return "delivered"
    if "CANCEL" in value:
        return "cancelled"
    if "OUT FOR PICKUP" in value or "PICKUP" in value:
        return "pickup_scheduled"
    if "PICKED UP" in value or value == "SHIPPED":
        return "picked_up"
    if "TRANSIT" in value or "REACHED" in value or "MISROUTED" in value or "CUSTOMS" in value:
        return "in_transit"
    if "AWB" in value or value in ("NEW", "READY TO SHIP", "MANIFESTED"):
        return "booked"
    return None


def split_name(full_name):
    parts = (full_name or "").strip().split()
    if not parts:
        return "Customer", ""
    return parts[0], " ".join(parts[1:])


def clean_phone(value):
    digits = re.sub(r"\D", "", value or "")
    return digits[-10:]


def _flatten_errors(errors):
    if isinstance(errors, dict):
        return "; ".join(f"{k}: {_flatten_errors(v)}" for k, v in errors.items())
    if isinstance(errors, (list, tuple)):
        return ", ".join(_flatten_errors(v) for v in errors)
    return str(errors)


class ShiprocketCourier(BaseCourier):
    key = "shiprocket"
    label = "Shiprocket"

    # ── configuration / transport ─────────────────────────────────────────
    def _credentials(self):
        env = getattr(settings, "SHIPPING_ENV", "test")
        creds = settings.SHIPROCKET_CREDENTIALS.get(env, {})
        return env, creds

    def is_configured(self):
        _, creds = self._credentials()
        return bool(creds.get("EMAIL") and creds.get("PASSWORD"))

    def configuration_hint(self):
        env, _ = self._credentials()
        prefix = "SHIPROCKET_PROD" if env == "production" else "SHIPROCKET_TEST"
        return f"Set {prefix}_EMAIL and {prefix}_PASSWORD (SHIPPING_ENV is '{env}')."

    def _token(self, force=False):
        env, creds = self._credentials()
        if not self.is_configured():
            raise CourierConfigError(f"Shiprocket credentials are not configured. {self.configuration_hint()}")
        cache_key = f"shiprocket_token_{env}"
        token = None if force else cache.get(cache_key)
        if token:
            return token
        try:
            response = requests.post(
                f"{settings.SHIPROCKET_BASE_URL}/auth/login",
                json={"email": creds["EMAIL"], "password": creds["PASSWORD"]},
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise CourierError(f"Could not reach Shiprocket: {exc}") from exc
        data = self._json(response)
        token = data.get("token")
        if response.status_code >= 400 or not token:
            raise CourierConfigError(
                f"Shiprocket login failed: {data.get('message') or response.status_code}. "
                "Check the API user email/password."
            )
        cache.set(cache_key, token, TOKEN_TTL_SECONDS)
        return token

    @staticmethod
    def _json(response):
        try:
            return response.json()
        except ValueError:
            return {"message": response.text[:300]}

    def _request(self, method, path, json=None, params=None, _retried=False):
        token = self._token(force=_retried)
        try:
            response = requests.request(
                method,
                f"{settings.SHIPROCKET_BASE_URL}{path}",
                json=json,
                params=params,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise CourierError(f"Could not reach Shiprocket: {exc}") from exc

        if response.status_code == 401 and not _retried:
            return self._request(method, path, json=json, params=params, _retried=True)

        data = self._json(response)
        if response.status_code >= 400:
            detail = data.get("message") or ""
            if data.get("errors"):
                detail = f"{detail} ({_flatten_errors(data['errors'])})".strip()
            raise CourierError(f"Shiprocket error {response.status_code}: {detail or 'request failed'}")
        return data

    # ── pickup locations & rates ──────────────────────────────────────────
    def list_pickup_locations(self):
        data = self._request("GET", "/settings/company/pickup")
        addresses = (data.get("data") or {}).get("shipping_address") or []
        default_name = getattr(settings, "SHIPROCKET_DEFAULT_PICKUP_LOCATION", "")
        locations = []
        for item in addresses:
            if item.get("status") not in (None, 1, 2):
                continue
            name = item.get("pickup_location") or ""
            locations.append({
                "name": name,
                "contact_name": item.get("name") or "",
                "phone": item.get("phone") or "",
                "email": item.get("email") or "",
                "address": item.get("address") or "",
                "address_2": item.get("address_2") or "",
                "city": item.get("city") or "",
                "state": item.get("state") or "",
                "pincode": str(item.get("pin_code") or ""),
                "verified": item.get("phone_verified") in (None, 1, True),
                "is_default": bool(default_name and name == default_name),
            })
        if locations and not any(loc["is_default"] for loc in locations):
            locations[0]["is_default"] = True
        return locations

    def serviceability(self, order, pickup_pincode, weight_kg, cod_amount):
        data = self._request("GET", "/courier/serviceability/", params={
            "pickup_postcode": pickup_pincode,
            "delivery_postcode": order.shipping_pincode,
            "weight": str(weight_kg),
            "cod": 1 if Decimal(cod_amount or 0) > 0 else 0,
            "declared_value": str(order.subtotal),
        })
        payload = data.get("data") or {}
        recommended = payload.get("recommended_courier_company_id")
        couriers = []
        for item in payload.get("available_courier_companies") or []:
            couriers.append({
                "id": str(item.get("courier_company_id")),
                "name": item.get("courier_name") or "",
                "rate": float(item.get("rate") or 0),
                "etd": item.get("etd") or "",
                "etd_days": item.get("estimated_delivery_days") or "",
                "rating": item.get("rating") or 0,
                "recommended": item.get("courier_company_id") == recommended,
            })
        couriers.sort(key=lambda c: (not c["recommended"], c["rate"]))
        return couriers

    # ── booking ───────────────────────────────────────────────────────────
    def _order_payload(self, shipment):
        order = shipment.order
        first_name, last_name = split_name(order.shipping_full_name)
        collect = Decimal(shipment.cod_amount or 0)
        is_cod = collect > 0
        items = []
        for item in order.items.all():
            items.append({
                "name": f"{item.product_name} ({item.variant_label})" if item.variant_label else item.product_name,
                "sku": item.sku or f"ITEM-{item.pk}",
                "units": item.quantity,
                "selling_price": float(item.unit_price),
                "discount": 0,
                "tax": "",
                "hsn": getattr(settings, "SHIPPING_DEFAULT_HSN", ""),
            })
        # Shiprocket collects (sub_total + shipping - discount) on COD orders. We
        # express "advance already paid online" as a discount so the courier
        # collects exactly the remaining balance.
        subtotal = Decimal(order.subtotal)
        shipping = Decimal(order.shipping_charge)
        total_discount = (subtotal + shipping - collect) if is_cod else Decimal(order.discount_amount or 0)

        _, creds = self._credentials()
        email = (order.user.email if order.user_id and order.user.email else None) or getattr(
            settings, "SHIPPING_FALLBACK_EMAIL", "noreply@example.com"
        )
        payload = {
            "order_id": shipment.provider_order_id,
            "order_date": order.placed_at.strftime("%Y-%m-%d %H:%M"),
            "pickup_location": shipment.pickup_location,
            "comment": f"Elegance order {order.order_number}",
            "billing_customer_name": first_name,
            "billing_last_name": last_name,
            "billing_address": order.shipping_address_line1,
            "billing_address_2": order.shipping_address_line2 or "",
            "billing_city": order.shipping_city,
            "billing_pincode": order.shipping_pincode,
            "billing_state": order.shipping_state,
            "billing_country": order.shipping_country or "India",
            "billing_email": email,
            "billing_phone": clean_phone(order.shipping_mobile),
            "shipping_is_billing": True,
            "order_items": items,
            "payment_method": "COD" if is_cod else "Prepaid",
            "shipping_charges": float(shipping),
            "total_discount": float(total_discount),
            "sub_total": float(subtotal),
            "length": float(shipment.length_cm),
            "breadth": float(shipment.breadth_cm),
            "height": float(shipment.height_cm),
            "weight": float(shipment.weight_kg),
        }
        if creds.get("CHANNEL_ID"):
            payload["channel_id"] = creds["CHANNEL_ID"]
        return payload

    def book(self, shipment, courier_id=None):
        """Create order -> assign AWB -> schedule pickup -> fetch documents.

        Each step is skipped if already done, so calling book() again resumes
        a partly-booked shipment instead of duplicating it at Shiprocket."""
        if not shipment.provider_shipment_id:
            payload = self._order_payload(shipment)
            data = self._request("POST", "/orders/create/adhoc", json=payload)
            shipment.booking_payload = payload
            shipment.provider_order_id = str(data.get("order_id") or shipment.provider_order_id)
            shipment.provider_shipment_id = str(data.get("shipment_id") or "")
            if not shipment.provider_shipment_id:
                raise CourierError(f"Shiprocket did not create a shipment: {data.get('message') or data}")
            shipment.save()

        if not shipment.awb_code:
            body = {"shipment_id": shipment.provider_shipment_id}
            if courier_id:
                body["courier_id"] = courier_id
            data = self._request("POST", "/courier/assign/awb", json=body)
            info = ((data.get("response") or {}).get("data")) or {}
            if not info.get("awb_code"):
                raise CourierError(
                    f"Courier assignment failed: {data.get('message') or 'no courier available for this route'}"
                )
            shipment.awb_code = str(info["awb_code"])
            shipment.courier_id = str(info.get("courier_company_id") or courier_id or "")
            shipment.courier_name = info.get("courier_name") or shipment.courier_name
            charge = info.get("freight_charges") or info.get("charge")
            if charge:
                shipment.shipping_cost = Decimal(str(charge))
            shipment.status = "booked"
            shipment.save()

        if not shipment.pickup_requested:
            self.request_pickup(shipment)

        shipment.error_message = ""
        shipment.save()

    def request_pickup(self, shipment):
        body = {"shipment_id": [shipment.provider_shipment_id]}
        if shipment.pickup_date:
            body["pickup_date"] = [shipment.pickup_date.isoformat()]
        data = self._request("POST", "/courier/generate/pickup", json=body)
        info = data.get("response") or {}
        message = str(info.get("data") or data.get("message") or "")
        already = "already" in message.lower()
        if data.get("pickup_status") == 0 and not already:
            raise CourierError(f"Pickup request failed: {message or 'rejected by Shiprocket'}")

        scheduled = parse_datetime(info.get("pickup_scheduled_date"))
        if scheduled:
            shipment.pickup_date = scheduled.date()
        shipment.pickup_token = str(info.get("pickup_token_number") or shipment.pickup_token)[:100]
        shipment.pickup_requested = True
        shipment.status = "pickup_scheduled"
        shipment.save()

    def fetch_documents(self, shipment):
        warnings = []
        if not shipment.provider_shipment_id:
            return warnings

        try:
            data = self._request("POST", "/courier/generate/label", json={"shipment_id": [shipment.provider_shipment_id]})
            shipment.label_url = data.get("label_url") or shipment.label_url
        except CourierError as exc:
            warnings.append(f"Label: {exc}")

        if shipment.provider_order_id:
            try:
                data = self._request("POST", "/orders/print/invoice", json={"ids": [shipment.provider_order_id]})
                shipment.invoice_url = data.get("invoice_url") or shipment.invoice_url
            except CourierError as exc:
                warnings.append(f"Invoice: {exc}")

        if shipment.pickup_requested:
            try:
                data = self._request("POST", "/manifests/generate", json={"shipment_id": [shipment.provider_shipment_id]})
                shipment.manifest_url = data.get("manifest_url") or shipment.manifest_url
            except CourierError as exc:
                warnings.append(f"Manifest: {exc}")

        shipment.save()
        return warnings

    # ── tracking ──────────────────────────────────────────────────────────
    def track(self, shipment):
        result = TrackResult()
        if not shipment.awb_code:
            return result
        data = self._request("GET", f"/courier/track/awb/{shipment.awb_code}")
        tracking = data.get("tracking_data") or {}
        if not tracking.get("track_status"):
            return result

        result.tracking_url = tracking.get("track_url") or ""
        result.estimated_delivery = parse_datetime(tracking.get("etd"))

        for scan in tracking.get("shipment_track_activities") or []:
            raw = scan.get("sr-status-label") or scan.get("status") or ""
            activity = scan.get("activity") or raw
            status = normalize_status(raw) or normalize_status(activity)
            occurred = parse_datetime(scan.get("date"))
            if not status or not occurred:
                continue
            result.events.append(TrackEvent(
                status=status,
                raw_status=str(raw)[:150],
                activity=str(activity)[:500],
                location=str(scan.get("location") or "")[:255],
                occurred_at=occurred,
            ))

        summary = (tracking.get("shipment_track") or [{}])[0]
        result.status_text = summary.get("current_status") or ""
        result.status = normalize_status(result.status_text)
        if not result.status and result.events:
            result.status = max(result.events, key=lambda e: e.occurred_at).status
        return result

    @staticmethod
    def parse_webhook(payload):
        """Turn a Shiprocket webhook body into (awb, TrackResult)."""
        awb = str(payload.get("awb") or "").strip()
        result = TrackResult(status_text=payload.get("current_status") or "")
        result.status = normalize_status(result.status_text)
        result.estimated_delivery = parse_datetime(payload.get("etd"))

        for scan in payload.get("scans") or []:
            raw = scan.get("sr-status-label") or scan.get("status") or ""
            activity = scan.get("activity") or raw
            status = normalize_status(raw) or normalize_status(activity)
            occurred = parse_datetime(scan.get("date"))
            if status and occurred:
                result.events.append(TrackEvent(
                    status=status, raw_status=str(raw)[:150], activity=str(activity)[:500],
                    location=str(scan.get("location") or "")[:255], occurred_at=occurred,
                ))

        if result.status and not any(e.status == result.status for e in result.events):
            occurred = parse_datetime(payload.get("current_timestamp"))
            if occurred:
                result.events.append(TrackEvent(
                    status=result.status, raw_status=result.status_text[:150],
                    activity=result.status_text[:500], location="", occurred_at=occurred,
                ))
        return awb, result

    # ── cancel ────────────────────────────────────────────────────────────
    def cancel(self, shipment):
        if shipment.awb_code:
            self._request("POST", "/orders/cancel/shipment/awbs", json={"awbs": [shipment.awb_code]})
        elif shipment.provider_order_id:
            self._request("POST", "/orders/cancel", json={"ids": [shipment.provider_order_id]})
