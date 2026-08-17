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

    # Delivery partner (Velocity — wired up later, admin updates status manually for now)
    courier_partner = models.CharField(max_length=50, default="Velocity", blank=True)
    tracking_id = models.CharField(max_length=100, blank=True, null=True)
    tracking_url = models.URLField(blank=True, null=True)

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
