from django.conf import settings
from django.db import models
from django.utils import timezone


PAYMENT_METHOD_CHOICES = (
    ("cod", "Cash on Delivery"),
    ("online", "Full Online Payment (Razorpay)"),
)

PAYMENT_STATUS_CHOICES = (
    ("pending", "Pending"),
    ("partial", "Partially Paid"),
    ("paid", "Paid"),
    ("failed", "Failed"),
    ("refunded", "Refunded"),
)

ORDER_STATUS_CHOICES = (
    ("placed", "Placed"),
    ("confirmed", "Confirmed"),
    ("processing", "Processing"),
    ("shipped", "Shipped"),
    ("out_for_delivery", "Out for Delivery"),
    ("delivered", "Delivered"),
    ("cancelled", "Cancelled"),
    ("returned", "Returned"),
)


class Cart(models.Model):
    """A shopping cart. Can belong either to a logged-in user, or to an
    anonymous visitor identified by a session key. When an anonymous
    user logs in, their session cart is merged/transferred to their
    user-owned cart."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="carts", on_delete=models.CASCADE,
        null=True, blank=True,
    )
    session_key = models.CharField(max_length=100, null=True, blank=True, db_index=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "order_cart"
        verbose_name = "Cart"
        verbose_name_plural = "Carts"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["session_key"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        owner = self.user.contact_number if self.user_id else self.session_key
        return f"Cart #{self.pk} ({owner})"

    @property
    def total_items(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def total_amount(self):
        return sum(item.total_price for item in self.items.all())


class CartItem(models.Model):
    """A single product/variant line item inside a cart."""

    cart = models.ForeignKey(Cart, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey("Product.Product", related_name="cart_items", on_delete=models.CASCADE)
    variant = models.ForeignKey(
        "Product.ProductVariant", related_name="cart_items", on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    quantity = models.PositiveIntegerField(default=1)

    added_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "order_cart_item"
        verbose_name = "Cart Item"
        verbose_name_plural = "Cart Items"
        ordering = ["-added_at"]
        unique_together = ("cart", "product", "variant")

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"

    @property
    def unit_price(self):
        if self.variant:
            return self.variant.effective_price
        return self.product.effective_price

    @property
    def total_price(self):
        return self.unit_price * self.quantity


class Order(models.Model):
    """A placed order. Shipping address fields are stored as a snapshot at
    the time of purchase, so later edits to a saved Address don't rewrite
    order history."""

    order_number = models.CharField(max_length=30, unique=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="orders", on_delete=models.CASCADE)

    address = models.ForeignKey(
        "UserDetail.Address", related_name="orders", on_delete=models.SET_NULL,
        null=True, blank=True,
    )

    # Shipping snapshot
    shipping_full_name = models.CharField(max_length=150)
    shipping_mobile = models.CharField(max_length=15)
    shipping_address_line1 = models.CharField(max_length=255)
    shipping_address_line2 = models.CharField(max_length=255, blank=True, null=True)
    shipping_city = models.CharField(max_length=100)
    shipping_state = models.CharField(max_length=100)
    shipping_pincode = models.CharField(max_length=10)
    shipping_country = models.CharField(max_length=100, default="India")

    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHOD_CHOICES)
    payment_status = models.CharField(max_length=10, choices=PAYMENT_STATUS_CHOICES, default="pending")
    order_status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES, default="placed")

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # COD partial advance payment (e.g. 20% of total order value paid online upfront)
    cod_advance_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    cod_advance_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cod_balance_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Denormalised from the active Shipment so lists and old pages keep working.
    courier_partner = models.CharField(max_length=50, default="", blank=True)
    tracking_id = models.CharField(max_length=100, blank=True, null=True)
    tracking_url = models.URLField(max_length=500, blank=True, null=True)

    # Admin approval — the gate between "customer paid" and "we will ship it".
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="approved_orders", on_delete=models.SET_NULL,
        null=True, blank=True,
    )

    placed_at = models.DateTimeField(default=timezone.now)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    out_for_delivery_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "order_order"
        verbose_name = "Order"
        verbose_name_plural = "Orders"
        ordering = ["-placed_at"]
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["order_status"]),
            models.Index(fields=["payment_status"]),
        ]

    def __str__(self):
        return self.order_number

    def save(self, *args, **kwargs):
        if not self.order_number:
            today_str = timezone.now().strftime("%Y%m%d")
            last_order = Order.objects.filter(order_number__startswith=f"ORD-{today_str}").order_by(
                "-id"
            ).first()
            next_seq = 1
            if last_order:
                try:
                    next_seq = int(last_order.order_number.split("-")[-1]) + 1
                except (ValueError, IndexError):
                    next_seq = 1
            self.order_number = f"ORD-{today_str}-{next_seq:04d}"
        super().save(*args, **kwargs)

    @property
    def is_cod(self):
        return self.payment_method == "cod"

    @property
    def is_approved(self):
        return self.approved_at is not None

    @property
    def active_shipment(self):
        """The shipment currently responsible for delivering this order."""
        return self.shipments.filter(is_active=True).order_by("-created_at").first()

    @property
    def amount_to_collect(self):
        """Cash the courier must collect on delivery (0 for prepaid orders)."""
        if not self.is_cod:
            return 0
        return self.cod_balance_amount if self.payment_status == "partial" else self.total_amount

    @property
    def whatsapp_return_url(self):
        message = f"Want to return an order with id - {self.order_number}"
        return f"https://wa.me/9999999999?text={message}"


class OrderItem(models.Model):
    """A single product/variant line item within a placed order, snapshotted
    at purchase time (name/sku/price won't change even if the product does)."""

    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(
        "Product.Product", related_name="order_items", on_delete=models.SET_NULL, null=True
    )
    variant = models.ForeignKey(
        "Product.ProductVariant", related_name="order_items", on_delete=models.SET_NULL,
        null=True, blank=True,
    )

    product_name = models.CharField(max_length=255)
    variant_label = models.CharField(max_length=255, blank=True, null=True)
    sku = models.CharField(max_length=60, blank=True, null=True)

    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "order_order_item"
        verbose_name = "Order Item"
        verbose_name_plural = "Order Items"
        ordering = ["id"]

    def __str__(self):
        return f"{self.product_name} x {self.quantity}"

    def save(self, *args, **kwargs):
        self.total_price = self.unit_price * self.quantity
        super().save(*args, **kwargs)


class Payment(models.Model):
    """Tracks individual payment transactions against an order — this covers
    both the online-payment flow (Razorpay) and the COD advance amount that
    is collected online upfront."""

    PAYMENT_TYPE_CHOICES = (
        ("cod_advance", "COD Advance (Paid Online)"),
        ("cod_balance", "COD Balance (Collected on Delivery)"),
        ("full_online", "Full Online Payment"),
    )

    PAYMENT_TXN_STATUS_CHOICES = (
        ("created", "Created"),
        ("success", "Success"),
        ("failed", "Failed"),
    )

    order = models.ForeignKey(Order, related_name="payments", on_delete=models.CASCADE)
    payment_type = models.CharField(max_length=20, choices=PAYMENT_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    razorpay_order_id = models.CharField(max_length=100, blank=True, null=True)
    razorpay_payment_id = models.CharField(max_length=100, blank=True, null=True)
    razorpay_signature = models.CharField(max_length=255, blank=True, null=True)

    status = models.CharField(max_length=15, choices=PAYMENT_TXN_STATUS_CHOICES, default="created")

    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "order_payment"
        verbose_name = "Payment"
        verbose_name_plural = "Payments"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.order.order_number} - {self.get_payment_type_display()} - {self.amount}"


class OrderStatusHistory(models.Model):
    """Audit trail of order status changes, shown on the order detail page
    (both admin and customer facing)."""

    order = models.ForeignKey(Order, related_name="status_history", on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES)
    note = models.CharField(max_length=255, blank=True, null=True)

    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="order_status_changes", on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    changed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "order_status_history"
        verbose_name = "Order Status History"
        verbose_name_plural = "Order Status History"
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.order.order_number} -> {self.status}"


class PincodeRange(models.Model):
    """Delivery price for a contiguous range of 6-digit Indian pincodes.

    The price is owned by the range; `state` is stored purely as a label so
    admins can scan and filter the table. Ranges must never overlap — that
    rule is enforced in `clean()` (and therefore on every `save()`), so the
    API, the Django admin and the Excel import script all share it."""

    state = models.CharField(max_length=100, db_index=True)
    pincode_start = models.PositiveIntegerField()
    pincode_end = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=8, decimal_places=2)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("pincode_start",)
        indexes = [models.Index(fields=["pincode_start", "pincode_end"], name="pincode_range_lookup_idx")]
        constraints = [
            models.CheckConstraint(
                check=models.Q(pincode_start__lte=models.F("pincode_end")),
                name="pincode_range_start_lte_end",
            ),
            models.CheckConstraint(
                check=models.Q(pincode_start__gte=100000, pincode_end__lte=999999),
                name="pincode_range_six_digits",
            ),
            models.CheckConstraint(check=models.Q(price__gte=0), name="pincode_range_price_non_negative"),
        ]

    def __str__(self):
        return f"{self.state}: {self.pincode_start}-{self.pincode_end} (Rs {self.price})"

    def clean(self):
        from django.core.exceptions import ValidationError
        from .shipping import normalize_state, validate_range

        self.state = normalize_state(self.state)
        if not self.state:
            raise ValidationError({"state": "State is required."})

        errors, _conflicts = validate_range(self.pincode_start, self.pincode_end, exclude_pk=self.pk)
        if errors:
            raise ValidationError(errors)

        if self.price is None or self.price < 0:
            raise ValidationError({"price": "Price cannot be negative."})

    def save(self, *args, **kwargs):
        self.full_clean(validate_constraints=False)
        super().save(*args, **kwargs)


SHIPMENT_PROVIDER_CHOICES = (
    ("shiprocket", "Shiprocket"),
    ("velocity", "Velocity"),
    ("manual", "Manual / Own delivery"),
)

SHIPMENT_STATUS_CHOICES = (
    ("pending", "Booking in progress"),
    ("booked", "Booked"),
    ("pickup_scheduled", "Pickup scheduled"),
    ("picked_up", "Picked up"),
    ("in_transit", "In transit"),
    ("out_for_delivery", "Out for delivery"),
    ("delivered", "Delivered"),
    ("undelivered", "Delivery attempt failed"),
    ("rto_initiated", "Returning to seller"),
    ("rto_delivered", "Returned to seller"),
    ("cancelled", "Cancelled"),
    ("failed", "Booking failed"),
)

# Shipment statuses after which the courier is no longer expected to send updates.
SHIPMENT_FINAL_STATUSES = ("delivered", "rto_delivered", "cancelled", "failed")


class Shipment(models.Model):
    """One booking with a delivery partner for an order.

    An order can have several shipments over its life (e.g. the first was
    cancelled and re-booked with another courier), but at most one is
    `is_active`. Booking with an API partner is several remote calls; progress
    is saved after each one so a partial failure can be resumed instead of
    creating duplicates at the partner."""

    order = models.ForeignKey(Order, related_name="shipments", on_delete=models.CASCADE)
    provider = models.CharField(max_length=20, choices=SHIPMENT_PROVIDER_CHOICES)
    status = models.CharField(max_length=20, choices=SHIPMENT_STATUS_CHOICES, default="pending")
    is_active = models.BooleanField(default=True)

    # Partner identifiers
    provider_order_id = models.CharField(max_length=100, blank=True, default="")
    provider_shipment_id = models.CharField(max_length=100, blank=True, default="")
    awb_code = models.CharField(max_length=100, blank=True, default="", db_index=True)
    courier_id = models.CharField(max_length=50, blank=True, default="")
    courier_name = models.CharField(max_length=150, blank=True, default="")

    # Pickup
    pickup_location = models.CharField(max_length=150, blank=True, default="")
    pickup_address = models.JSONField(default=dict, blank=True)
    pickup_date = models.DateField(null=True, blank=True)
    pickup_token = models.CharField(max_length=100, blank=True, default="")
    pickup_requested = models.BooleanField(default=False)

    # Parcel
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, default=0.5)
    length_cm = models.DecimalField(max_digits=6, decimal_places=1, default=30)
    breadth_cm = models.DecimalField(max_digits=6, decimal_places=1, default=25)
    height_cm = models.DecimalField(max_digits=6, decimal_places=1, default=5)

    # Money
    shipping_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cod_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Documents
    label_url = models.URLField(max_length=700, blank=True, default="")
    invoice_url = models.URLField(max_length=700, blank=True, default="")
    manifest_url = models.URLField(max_length=700, blank=True, default="")

    # Tracking
    tracking_url = models.URLField(max_length=700, blank=True, default="")
    estimated_delivery = models.DateTimeField(null=True, blank=True)
    last_status_text = models.CharField(max_length=255, blank=True, default="")
    last_synced_at = models.DateTimeField(null=True, blank=True)

    # Admin / diagnostics
    note = models.CharField(max_length=255, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    booking_payload = models.JSONField(default=dict, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="created_shipments", on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "order_shipment"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["order", "is_active"])]
        constraints = [
            models.UniqueConstraint(
                fields=["order"], condition=models.Q(is_active=True), name="one_active_shipment_per_order",
            ),
        ]

    def __str__(self):
        return f"{self.order.order_number} via {self.get_provider_display()} ({self.status})"

    @property
    def is_final(self):
        return self.status in SHIPMENT_FINAL_STATUSES

    @property
    def is_api_provider(self):
        return self.provider != "manual"


class ShipmentEvent(models.Model):
    """A single tracking scan/update for a shipment, shown as the timeline."""

    shipment = models.ForeignKey(Shipment, related_name="events", on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=SHIPMENT_STATUS_CHOICES)
    raw_status = models.CharField(max_length=150, blank=True, default="")
    activity = models.CharField(max_length=500, blank=True, default="")
    location = models.CharField(max_length=255, blank=True, default="")
    occurred_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "order_shipment_event"
        ordering = ["-occurred_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["shipment", "occurred_at", "raw_status", "activity"], name="unique_shipment_event",
            ),
        ]

    def __str__(self):
        return f"{self.shipment_id}: {self.raw_status or self.status}"
