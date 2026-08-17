from django.contrib import admin

from .models import (
    Category, SubCategory, ProductType,
    Attribute, AttributeValue,
    Product, ProductImage, ProductVariant,
)


class SubCategoryInline(admin.TabularInline):
    model = SubCategory
    extra = 0
    fields = ("name", "slug", "is_active", "display_order")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "display_order", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [SubCategoryInline]
    ordering = ("display_order", "name")


@admin.register(SubCategory)
class SubCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "slug", "is_active", "display_order")
    list_filter = ("is_active", "category")
    search_fields = ("name", "slug", "category__name")
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ("category",)
    ordering = ("category", "display_order", "name")


@admin.register(ProductType)
class ProductTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "display_order")
    list_filter = ("is_active",)
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("display_order", "name")


class AttributeValueInline(admin.TabularInline):
    model = AttributeValue
    extra = 1
    fields = ("value", "display_order")


@admin.register(Attribute)
class AttributeAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active")
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}
    inlines = [AttributeValueInline]


@admin.register(AttributeValue)
class AttributeValueAdmin(admin.ModelAdmin):
    list_display = ("attribute", "value", "display_order")
    list_filter = ("attribute",)
    search_fields = ("value", "attribute__name")


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ("image", "alt_text", "is_primary", "display_order")


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    fields = ("sku", "price_override", "stock_quantity", "is_active")
    filter_horizontal = ("attribute_values",)
    show_change_link = True


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name", "sku", "category", "subcategory", "product_type",
        "price", "discount_price", "stock_quantity", "is_active", "is_featured", "created_at",
    )
    list_filter = ("is_active", "is_featured", "category", "subcategory", "product_type")
    search_fields = ("name", "sku", "slug")
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ("category", "subcategory", "product_type")
    inlines = [ProductImageInline, ProductVariantInline]
    ordering = ("-created_at",)
    list_editable = ("is_active", "is_featured")

    fieldsets = (
        (None, {"fields": ("name", "slug", "sku")}),
        ("Classification", {"fields": ("category", "subcategory", "product_type")}),
        ("Description", {"fields": ("short_description", "description", "fabric")}),
        ("Pricing & Stock", {"fields": ("price", "discount_price", "stock_quantity")}),
        ("Status", {"fields": ("is_active", "is_featured")}),
    )


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ("product", "sku", "variant_label", "effective_price", "stock_quantity", "is_active")
    list_filter = ("is_active", "product__category")
    search_fields = ("sku", "product__name")
    autocomplete_fields = ("product",)
    filter_horizontal = ("attribute_values",)
