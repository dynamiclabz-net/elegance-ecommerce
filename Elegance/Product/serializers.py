from rest_framework import serializers

from .models import (
    Category, SubCategory, ProductType,
    Attribute, AttributeValue,
    Product, ProductImage, ProductVariant,
    ProductSpecification, ProductCareInstruction,
)


class SubCategorySerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = SubCategory
        fields = (
            "id", "category", "category_name", "name", "slug", "description",
            "image", "is_active", "display_order", "created_at", "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")


class CategorySerializer(serializers.ModelSerializer):
    subcategories = SubCategorySerializer(many=True, read_only=True)
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = (
            "id", "name", "slug", "description", "image", "is_active",
            "display_order", "subcategories", "product_count",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

    def get_product_count(self, obj):
        return obj.products.count()


class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
        fields = (
            "id", "name", "slug", "description", "is_active",
            "display_order", "created_at",
        )
        read_only_fields = ("id", "slug", "created_at")


class AttributeValueSerializer(serializers.ModelSerializer):
    attribute_name = serializers.CharField(source="attribute.name", read_only=True)

    class Meta:
        model = AttributeValue
        fields = ("id", "attribute", "attribute_name", "value", "hex_code", "display_order")
        read_only_fields = ("id",)


class AttributeSerializer(serializers.ModelSerializer):
    values = AttributeValueSerializer(many=True, read_only=True)

    class Meta:
        model = Attribute
        fields = ("id", "name", "slug", "is_active", "is_color", "values")
        read_only_fields = ("id", "slug")


class ProductSpecificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductSpecification
        fields = ("id", "product", "key", "value", "display_order", "created_at")
        read_only_fields = ("id", "created_at")


class ProductCareInstructionSerializer(serializers.ModelSerializer):
    icon_label = serializers.CharField(source="get_icon_display", read_only=True)

    class Meta:
        model = ProductCareInstruction
        fields = ("id", "product", "icon", "icon_label", "title", "description", "display_order", "created_at")
        read_only_fields = ("id", "created_at")


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "product", "image", "alt_text", "is_primary", "display_order", "created_at")
        read_only_fields = ("id", "created_at")


class ProductVariantSerializer(serializers.ModelSerializer):
    attribute_values_detail = AttributeValueSerializer(
        source="attribute_values", many=True, read_only=True
    )
    variant_label = serializers.CharField(read_only=True)
    effective_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = ProductVariant
        fields = (
            "id", "product", "sku", "attribute_values", "attribute_values_detail",
            "variant_label", "price_override", "effective_price", "stock_quantity",
            "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight serializer used for list/grid views (admin table + shop grid)."""

    category_name = serializers.CharField(source="category.name", read_only=True)
    subcategory_name = serializers.CharField(source="subcategory.name", read_only=True, default=None)
    product_type_name = serializers.CharField(source="product_type.name", read_only=True, default=None)
    primary_image_url = serializers.SerializerMethodField()
    effective_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    discount_percentage = serializers.IntegerField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = (
            "id", "name", "slug", "sku", "category", "category_name",
            "subcategory", "subcategory_name", "product_type", "product_type_name",
            "price", "discount_price", "effective_price", "discount_percentage",
            "stock_quantity", "in_stock", "is_active", "is_featured",
            "primary_image_url", "created_at",
        )

    def get_primary_image_url(self, obj):
        image = obj.primary_image
        if image and image.image:
            request = self.context.get("request")
            url = image.image.url
            return request.build_absolute_uri(url) if request else url
        return None


class ProductDetailSerializer(serializers.ModelSerializer):
    """Full serializer used for admin create/update forms and the product detail page."""

    images = ProductImageSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    specifications = ProductSpecificationSerializer(many=True, read_only=True)
    care_instructions = ProductCareInstructionSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    subcategory_name = serializers.CharField(source="subcategory.name", read_only=True, default=None)
    product_type_name = serializers.CharField(source="product_type.name", read_only=True, default=None)
    effective_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    discount_percentage = serializers.IntegerField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = (
            "id", "name", "slug", "category", "category_name", "subcategory",
            "subcategory_name", "product_type", "product_type_name", "sku",
            "short_description", "description", "fabric", "price", "discount_price",
            "effective_price", "discount_percentage", "stock_quantity", "in_stock",
            "is_active", "is_featured", "images", "variants",
            "specifications", "care_instructions", "created_at", "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

    def validate(self, attrs):
        subcategory = attrs.get("subcategory") or getattr(self.instance, "subcategory", None)
        category = attrs.get("category") or getattr(self.instance, "category", None)
        if subcategory and category and subcategory.category_id != category.id:
            raise serializers.ValidationError(
                {"subcategory": "Selected sub-category does not belong to the selected category."}
            )
        return attrs
