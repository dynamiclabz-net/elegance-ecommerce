from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class Category(models.Model):
    """Top level catalog category, e.g. Stiched, Semi-Stiched, Unstiched, Ready-Mades."""

    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=170, unique=True, blank=True)
    description = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to="categories/", blank=True, null=True)

    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_category"
        verbose_name = "Category"
        verbose_name_plural = "Categories"
        ordering = ["display_order", "name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class SubCategory(models.Model):
    """Second level catalog grouping, e.g. under Ready-Mades: Salwar Suits,
    Tops / Shirts, Co-ord Sets. Optional — a product can attach directly
    to a Category without a SubCategory."""

    category = models.ForeignKey(Category, related_name="subcategories", on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=190, blank=True)
    description = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to="subcategories/", blank=True, null=True)

    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_subcategory"
        verbose_name = "Sub Category"
        verbose_name_plural = "Sub Categories"
        ordering = ["display_order", "name"]
        unique_together = ("category", "name")

    def __str__(self):
        return f"{self.category.name} > {self.name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(f"{self.category.name}-{self.name}")
        super().save(*args, **kwargs)


class ProductType(models.Model):
    """Optional cross-cutting product type / occasion tag, e.g. Casual Wear,
    Work Wear, Semi-Formal Wear, Formal / Occasion Wear, Trousseau Collection.
    Independent of category/subcategory — any product can optionally carry one."""

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "product_type"
        verbose_name = "Product Type"
        verbose_name_plural = "Product Types"
        ordering = ["display_order", "name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Attribute(models.Model):
    """Dynamic attribute definition, e.g. Color, Size, Fabric."""

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_color = models.BooleanField(
        default=False,
        help_text="Mark as a color attribute so its values show a name + hex swatch instead of plain text.",
    )

    class Meta:
        db_table = "product_attribute"
        verbose_name = "Attribute"
        verbose_name_plural = "Attributes"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class AttributeValue(models.Model):
    """Concrete value for a dynamic attribute, e.g. Red / Blue for Color,
    S / M / L / XL for Size. When the parent attribute is a color attribute,
    hex_code carries the swatch color, e.g. #C0392B for "Red"."""

    attribute = models.ForeignKey(Attribute, related_name="values", on_delete=models.CASCADE)
    value = models.CharField(max_length=100)
    hex_code = models.CharField(max_length=7, blank=True, null=True, help_text="e.g. #C0392B — only used for color attributes.")
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "product_attribute_value"
        verbose_name = "Attribute Value"
        verbose_name_plural = "Attribute Values"
        ordering = ["attribute", "display_order", "value"]
        unique_together = ("attribute", "value")

    def __str__(self):
        return f"{self.attribute.name}: {self.value}"


class Product(models.Model):
    """A sellable product. Relates to Category directly, or to Category +
    SubCategory. ProductType is an optional occasion/usage tag."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=280, unique=True, blank=True)

    category = models.ForeignKey(Category, related_name="products", on_delete=models.CASCADE)
    subcategory = models.ForeignKey(
        SubCategory, related_name="products", on_delete=models.SET_NULL, null=True, blank=True
    )
    product_type = models.ForeignKey(
        ProductType, related_name="products", on_delete=models.SET_NULL, null=True, blank=True
    )

    sku = models.CharField(max_length=50, unique=True)
    short_description = models.CharField(max_length=500, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    fabric = models.CharField(max_length=150, blank=True, null=True)

    price = models.DecimalField(max_digits=10, decimal_places=2)
    discount_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    stock_quantity = models.PositiveIntegerField(default=0)

    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_product"
        verbose_name = "Product"
        verbose_name_plural = "Products"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["category"]),
            models.Index(fields=["subcategory"]),
            models.Index(fields=["product_type"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1
            while Product.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                counter += 1
                slug = f"{base_slug}-{counter}"
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def effective_price(self):
        return self.discount_price if self.discount_price else self.price

    @property
    def discount_percentage(self):
        if self.discount_price and self.price:
            return round((1 - (self.discount_price / self.price)) * 100)
        return 0

    @property
    def in_stock(self):
        return self.stock_quantity > 0

    @property
    def primary_image(self):
        image = self.images.filter(is_primary=True).first()
        return image or self.images.first()


class ProductSpecification(models.Model):
    """Freeform key/value spec row shown in the product detail page's
    'Product Details' tab, e.g. Occasion -> Festive, Semi-Formal, Casual.
    Admin types both the key and the value — fully dynamic, no fixed schema."""

    product = models.ForeignKey(Product, related_name="specifications", on_delete=models.CASCADE)
    key = models.CharField(max_length=100)
    value = models.CharField(max_length=255)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "product_specification"
        verbose_name = "Product Specification"
        verbose_name_plural = "Product Specifications"
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.product.name} — {self.key}: {self.value}"


class ProductCareInstruction(models.Model):
    """Icon + title + description row shown in the product detail page's
    'Care & Fabric' tab, e.g. Hand Wash Only / Do Not Bleach / Dry in Shade."""

    ICON_CHOICES = [
        ("hand-wash", "Hand Wash Only"),
        ("machine-wash", "Machine Washable"),
        ("no-bleach", "Do Not Bleach"),
        ("dry-shade", "Dry in Shade"),
        ("dry-sun", "Dry in Sun"),
        ("low-iron", "Low Iron"),
        ("no-iron", "Do Not Iron"),
        ("dry-clean", "Dry Clean"),
        ("no-dry-clean", "No Dry Clean"),
        ("store", "Store Carefully"),
        ("delicate", "Handle Delicately"),
        ("general", "General Care"),
    ]

    product = models.ForeignKey(Product, related_name="care_instructions", on_delete=models.CASCADE)
    icon = models.CharField(max_length=30, choices=ICON_CHOICES, default="general")
    title = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True, null=True)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "product_care_instruction"
        verbose_name = "Product Care Instruction"
        verbose_name_plural = "Product Care Instructions"
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.product.name} — {self.title}"


class ProductImage(models.Model):
    """Gallery images for a product."""

    product = models.ForeignKey(Product, related_name="images", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="products/")
    alt_text = models.CharField(max_length=255, blank=True, null=True)
    is_primary = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "product_image"
        verbose_name = "Product Image"
        verbose_name_plural = "Product Images"
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"Image for {self.product.name}"

    def save(self, *args, **kwargs):
        if self.is_primary:
            ProductImage.objects.filter(product=self.product, is_primary=True).exclude(
                pk=self.pk
            ).update(is_primary=False)
        super().save(*args, **kwargs)


class ProductVariant(models.Model):
    """A purchasable variant of a product defined by a combination of
    dynamic attribute values (e.g. Color: Red + Size: M)."""

    product = models.ForeignKey(Product, related_name="variants", on_delete=models.CASCADE)
    sku = models.CharField(max_length=60, unique=True)
    attribute_values = models.ManyToManyField(
        AttributeValue, related_name="variants", blank=True
    )

    price_override = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock_quantity = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_variant"
        verbose_name = "Product Variant"
        verbose_name_plural = "Product Variants"
        ordering = ["product", "id"]

    def __str__(self):
        return f"{self.product.name} - {self.variant_label or self.sku}"

    @property
    def effective_price(self):
        if self.price_override is not None:
            return self.price_override
        return self.product.effective_price

    @property
    def variant_label(self):
        return ", ".join(str(v.value) for v in self.attribute_values.all())

    @property
    def in_stock(self):
        return self.stock_quantity > 0
