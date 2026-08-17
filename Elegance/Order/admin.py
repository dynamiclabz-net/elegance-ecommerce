from django.contrib import admin

from .models import Cart, CartItem, Order, OrderItem, Payment, OrderStatusHistory


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    fields = ("product", "variant", "quantity", "unit_price", "total_price")
    readonly_fields = ("unit_price", "total_price")
    autocomplete_fields = ("product", "variant")


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "session_key", "total_items", "total_amount", "is_active", "updated_at")
    list_filter = ("is_active", "created_at")
    search_fields = ("user__contact_number", "session_key")
    autocomplete_fields = ("user",)
    inlines = [CartItemInline]
    ordering = ("-updated_at",)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ("cart", "product", "variant", "quantity", "unit_price", "total_price")
    search_fields = ("product__name", "cart__user__contact_number")
    autocomplete_fields = ("cart", "product", "variant")


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    fields = ("product", "variant", "product_name", "variant_label", "sku", "unit_price", "quantity", "total_price")
    readonly_fields = ("total_price",)
    autocomplete_fields = ("product", "variant")


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    fields = ("payment_type", "amount", "status", "razorpay_payment_id", "paid_at")


class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    fields = ("status", "note", "changed_by", "changed_at")
    readonly_fields = ("changed_at",)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number", "user", "order_status", "payment_method", "payment_status",
        "total_amount", "placed_at",
    )
    list_filter = ("order_status", "payment_method", "payment_status", "placed_at")
    search_fields = ("order_number", "user__contact_number", "shipping_mobile", "tracking_id")
    autocomplete_fields = ("user", "address")
    readonly_fields = ("order_number", "placed_at")
    inlines = [OrderItemInline, PaymentInline, OrderStatusHistoryInline]
    ordering = ("-placed_at",)
    list_editable = ("order_status", "payment_status")

    fieldsets = (
        ("Order Info", {"fields": ("order_number", "user", "order_status", "placed_at")}),
        ("Shipping Address", {
            "fields": (
                "address", "shipping_full_name", "shipping_mobile",
                "shipping_address_line1", "shipping_address_line2",
                "shipping_city", "shipping_state", "shipping_pincode", "shipping_country",
            )
        }),
        ("Payment", {
            "fields": (
                "payment_method", "payment_status",
                "cod_advance_percentage", "cod_advance_amount", "cod_balance_amount",
            )
        }),
        ("Amounts", {"fields": ("subtotal", "discount_amount", "shipping_charge", "total_amount")}),
        ("Delivery (Velocity)", {"fields": ("courier_partner", "tracking_id", "tracking_url")}),
        ("Timeline", {
            "fields": (
                "confirmed_at", "shipped_at", "out_for_delivery_at", "delivered_at", "cancelled_at",
            )
        }),
        ("Notes", {"fields": ("notes",)}),
    )

    def save_model(self, request, obj, form, change):
        status_changed = change and "order_status" in form.changed_data
        super().save_model(request, obj, form, change)
        if status_changed:
            OrderStatusHistory.objects.create(
                order=obj, status=obj.order_status, changed_by=request.user
            )


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ("order", "product_name", "variant_label", "sku", "unit_price", "quantity", "total_price")
    search_fields = ("order__order_number", "product_name", "sku")
    autocomplete_fields = ("order", "product", "variant")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("order", "payment_type", "amount", "status", "razorpay_payment_id", "paid_at")
    list_filter = ("payment_type", "status")
    search_fields = ("order__order_number", "razorpay_order_id", "razorpay_payment_id")
    autocomplete_fields = ("order",)
    ordering = ("-created_at",)


@admin.register(OrderStatusHistory)
class OrderStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ("order", "status", "changed_by", "changed_at")
    list_filter = ("status", "changed_at")
    search_fields = ("order__order_number",)
    autocomplete_fields = ("order", "changed_by")
    ordering = ("-changed_at",)
