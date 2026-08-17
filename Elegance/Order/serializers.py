from rest_framework import serializers

from .models import Cart, CartItem, Order, OrderItem, Payment, OrderStatusHistory


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    variant_label = serializers.CharField(source="variant.variant_label", read_only=True, default=None)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = (
            "id", "cart", "product", "product_name", "product_slug", "variant",
            "variant_label", "quantity", "unit_price", "total_price", "image_url",
            "added_at", "updated_at",
        )
        read_only_fields = ("id", "added_at", "updated_at")

    def get_image_url(self, obj):
        image = obj.product.primary_image
        if image and image.image:
            request = self.context.get("request")
            url = image.image.url
            return request.build_absolute_uri(url) if request else url
        return None


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    total_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Cart
        fields = (
            "id", "user", "session_key", "is_active", "items",
            "total_items", "total_amount", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class OrderItemSerializer(serializers.ModelSerializer):
    product_slug = serializers.CharField(source="product.slug", read_only=True, default=None)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = (
            "id", "order", "product", "product_slug", "variant", "product_name", "variant_label",
            "sku", "unit_price", "quantity", "total_price", "image_url",
        )
        read_only_fields = ("id", "total_price")

    def get_image_url(self, obj):
        if not obj.product_id:
            return None
        image = obj.product.primary_image
        if image and image.image:
            request = self.context.get("request")
            url = image.image.url
            return request.build_absolute_uri(url) if request else url
        return None


class PaymentSerializer(serializers.ModelSerializer):
    payment_type_display = serializers.CharField(source="get_payment_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id", "order", "payment_type", "payment_type_display", "amount",
            "razorpay_order_id", "razorpay_payment_id", "razorpay_signature",
            "status", "status_display", "paid_at", "created_at",
        )
        read_only_fields = ("id", "created_at")


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True, default=None)

    class Meta:
        model = OrderStatusHistory
        fields = ("id", "order", "status", "status_display", "note", "changed_by", "changed_by_name", "changed_at")
        read_only_fields = ("id", "changed_at")


class OrderListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the admin orders table."""

    customer_name = serializers.CharField(source="shipping_full_name", read_only=True)
    order_status_display = serializers.CharField(source="get_order_status_display", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    item_count = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id", "order_number", "user", "customer_name", "shipping_mobile",
            "order_status", "order_status_display", "payment_status", "payment_status_display",
            "payment_method", "payment_method_display", "total_amount", "item_count", "items",
            "placed_at",
        )

    def get_item_count(self, obj):
        return obj.items.count()

    def get_items(self, obj):
        # Lightweight item summary (used by the customer "My Orders" cards).
        return OrderItemSerializer(obj.items.all(), many=True, context=self.context).data


class OrderDetailSerializer(serializers.ModelSerializer):
    """Full serializer used for the admin order detail page and the
    customer-facing order detail page."""

    items = OrderItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)

    order_status_display = serializers.CharField(source="get_order_status_display", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    is_cod = serializers.BooleanField(read_only=True)
    whatsapp_return_url = serializers.CharField(read_only=True)

    class Meta:
        model = Order
        fields = (
            "id", "order_number", "user",
            "shipping_full_name", "shipping_mobile", "shipping_address_line1",
            "shipping_address_line2", "shipping_city", "shipping_state",
            "shipping_pincode", "shipping_country",
            "payment_method", "payment_method_display", "payment_status", "payment_status_display",
            "order_status", "order_status_display",
            "subtotal", "discount_amount", "shipping_charge", "total_amount",
            "cod_advance_percentage", "cod_advance_amount", "cod_balance_amount", "is_cod",
            "courier_partner", "tracking_id", "tracking_url",
            "placed_at", "confirmed_at", "shipped_at", "out_for_delivery_at",
            "delivered_at", "cancelled_at", "notes",
            "items", "payments", "status_history", "whatsapp_return_url",
        )
        read_only_fields = (
            "id", "order_number", "subtotal", "discount_amount", "total_amount",
            "cod_advance_amount", "cod_balance_amount", "placed_at",
        )
