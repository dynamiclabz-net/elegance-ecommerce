from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from Product.models import Category, Product


# ─────────────────────────────────────────────
# Defaults for the editable navbar / footer / announcement JSON blocks.
# Callables so every new row gets its own copy.
# ─────────────────────────────────────────────
def default_announcements():
    return [
        {"text": "Free shipping on orders above ₹2,999", "link_text": "", "link_url": ""},
        {"text": "New arrivals every Friday", "link_text": "", "link_url": ""},
        {"text": "Customised stitching available —", "link_text": "Book now", "link_url": "#"},
    ]


def default_nav_items():
    return [
        {"label": "New In", "url": "/shop", "style": "", "columns": []},
        {
            "label": "Shop",
            "url": "/shop",
            "style": "",
            "columns": [
                {
                    "heading": "By Type",
                    "links": [
                        {"label": "Unstitched Suits", "url": "/shop"},
                        {"label": "Semi-Stitched", "url": "/shop"},
                        {"label": "Ready-Mades", "url": "/shop"},
                        {"label": "Salwar Kameez", "url": "/shop"},
                        {"label": "Co-ord Sets", "url": "/shop"},
                        {"label": "Tops / Shirts", "url": "/shop"},
                    ],
                },
                {
                    "heading": "By Occasion",
                    "links": [
                        {"label": "Casual Wear", "url": "/shop"},
                        {"label": "Work Wear", "url": "/shop"},
                        {"label": "Semi-Formal", "url": "/shop"},
                        {"label": "Occasion Wear", "url": "/shop"},
                        {"label": "Trousseau", "url": "/shop"},
                        {"label": "Festive", "url": "/shop"},
                    ],
                },
            ],
        },
        {"label": "About us", "url": "/shop", "style": "", "columns": []},
        {"label": "Sale", "url": "/shop", "style": "sale", "columns": []},
    ]


def default_footer_socials():
    return [
        {"icon": "fab fa-instagram", "label": "Instagram", "url": "https://www.instagram.com/elegance.india_/"},
        {"icon": "fab fa-facebook-f", "label": "Facebook", "url": "#"},
        {"icon": "fab fa-pinterest-p", "label": "Pinterest", "url": "#"},
        {"icon": "fab fa-whatsapp", "label": "WhatsApp", "url": "#"},
    ]


def default_footer_columns():
    return [
        {
            "heading": "Quick Links",
            "links": [
                {"label": "Home", "url": "/home"},
                {"label": "New Arrivals", "url": "/shop"},
                {"label": "Collections", "url": "/shop"},
                {"label": "Sale", "url": "/shop"},
                {"label": "About Us", "url": "#"},
            ],
        },
        {
            "heading": "Shop",
            "links": [
                {"label": "Unstitched Suits", "url": "/shop"},
                {"label": "Semi Stitched", "url": "/shop"},
                {"label": "Ready Mades", "url": "/shop"},
                {"label": "Salwar Kameez", "url": "/shop"},
                {"label": "Co-ord Sets", "url": "/shop"},
                {"label": "Occasion Wear", "url": "/shop"},
            ],
        },
        {
            "heading": "Help",
            "links": [
                {"label": "Shipping & Returns", "url": "#"},
                {"label": "Size Guide", "url": "#"},
                {"label": "Custom Stitching", "url": "#"},
                {"label": "Track Order", "url": "#"},
                {"label": "Contact Us", "url": "#"},
            ],
        },
    ]


# ─────────────────────────────────────────────
# Hero banners
# ─────────────────────────────────────────────
class HomeBanner(models.Model):
    """One slide of the full-width hero slider.

    `heading` supports light markup so the design's italic gold accent stays
    editable: a new line becomes <br>, and *wrapped text* becomes <em>."""

    ALIGN_CHOICES = [("left", "Left"), ("right", "Right"), ("center", "Center")]
    OVERLAY_CHOICES = [
        ("default", "Dark from left"),
        ("light", "Dark from right"),
        ("bottom", "Dark from bottom"),
    ]

    image = models.ImageField(upload_to="home/banners/")
    eyebrow = models.CharField(max_length=120, blank=True)
    heading = models.CharField(max_length=255, blank=True)
    sub_text = models.CharField(max_length=255, blank=True)
    text_align = models.CharField(max_length=10, choices=ALIGN_CHOICES, default="left")
    overlay = models.CharField(max_length=10, choices=OVERLAY_CHOICES, default="default")

    btn1_text = models.CharField(max_length=60, blank=True)
    btn1_url = models.CharField(max_length=300, blank=True)
    btn2_text = models.CharField(max_length=60, blank=True)
    btn2_url = models.CharField(max_length=300, blank=True)

    thumb_label = models.CharField(max_length=30, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "home_banner"
        ordering = ["display_order", "id"]

    def __str__(self):
        return self.heading or f"Banner {self.pk}"


# ─────────────────────────────────────────────
# Product picks (New Arrivals / Bestsellers / Most Trendy)
# ─────────────────────────────────────────────
class HomeProductPick(models.Model):
    SECTION_NEW_ARRIVALS = "new_arrivals"
    SECTION_BESTSELLERS = "bestsellers"
    SECTION_TRENDING = "trending"
    SECTION_CHOICES = [
        (SECTION_NEW_ARRIVALS, "New Arrivals"),
        (SECTION_BESTSELLERS, "Bestsellers"),
        (SECTION_TRENDING, "Most Trendy"),
    ]
    # New Arrivals is an expanding 4-card row in the design.
    SECTION_LIMITS = {SECTION_NEW_ARRIVALS: 4}

    section = models.CharField(max_length=20, choices=SECTION_CHOICES)
    product = models.ForeignKey(Product, related_name="home_picks", on_delete=models.CASCADE)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "home_product_pick"
        ordering = ["section", "display_order", "id"]
        unique_together = ("section", "product")

    def __str__(self):
        return f"{self.section}: {self.product.name}"


# ─────────────────────────────────────────────
# Shop by Category tiles
# ─────────────────────────────────────────────
class HomeCategoryTile(models.Model):
    category = models.OneToOneField(Category, related_name="home_tile", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="home/category-tiles/", blank=True, null=True)
    title = models.CharField(max_length=120, blank=True, help_text="Leave blank to use the category name.")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "home_category_tile"
        ordering = ["display_order", "id"]

    def __str__(self):
        return self.title or self.category.name


# ─────────────────────────────────────────────
# Category showcase carousels
# ─────────────────────────────────────────────
class HomeCategorySection(models.Model):
    category = models.ForeignKey(Category, related_name="home_sections", on_delete=models.CASCADE)
    title = models.CharField(max_length=120, blank=True, help_text="Leave blank to use the category name.")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "home_category_section"
        ordering = ["display_order", "id"]

    def __str__(self):
        return self.title or self.category.name


class HomeCategorySectionItem(models.Model):
    section = models.ForeignKey(HomeCategorySection, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="home_section_items", on_delete=models.CASCADE)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "home_category_section_item"
        ordering = ["display_order", "id"]
        unique_together = ("section", "product")


# ─────────────────────────────────────────────
# Featured collections (tabs → banner + 4 products)
# ─────────────────────────────────────────────
class HomeCollection(models.Model):
    MAX_PRODUCTS = 4

    tab_label = models.CharField(max_length=80)
    banner_title = models.CharField(max_length=120, blank=True)
    banner_text = models.CharField(max_length=255, blank=True)
    banner_image = models.ImageField(upload_to="home/collections/", blank=True, null=True)
    cta_text = models.CharField(max_length=60, default="Discover Collection")
    cta_url = models.CharField(max_length=300, default="/shop")
    meta_left = models.CharField(max_length=120, blank=True, help_text='e.g. "Selected from The Archives"')
    meta_right = models.CharField(max_length=120, blank=True, help_text='e.g. "Founder Favourites"')
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "home_collection"
        ordering = ["display_order", "id"]

    def __str__(self):
        return self.tab_label


class HomeCollectionItem(models.Model):
    collection = models.ForeignKey(HomeCollection, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="home_collection_items", on_delete=models.CASCADE)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "home_collection_item"
        ordering = ["display_order", "id"]
        unique_together = ("collection", "product")

    def clean(self):
        if not self.pk and self.collection_id and self.collection.items.count() >= HomeCollection.MAX_PRODUCTS:
            raise ValidationError(f"A collection can hold at most {HomeCollection.MAX_PRODUCTS} products.")


# ─────────────────────────────────────────────
# Singleton: section copy, toggles, navbar, footer
# ─────────────────────────────────────────────
class HomeSettings(models.Model):
    # Section copy
    na_title = models.CharField(max_length=80, default="New Arrivals")
    na_link_text = models.CharField(max_length=40, default="Shop All")
    na_link_url = models.CharField(max_length=300, default="/shop")

    cat_eyebrow = models.CharField(max_length=60, default="Women", blank=True)
    cat_title = models.CharField(max_length=80, default="Shop by Category")
    cat_all_text = models.CharField(max_length=40, default="Shop All")
    cat_all_url = models.CharField(max_length=300, default="/shop")

    bs_eyebrow = models.CharField(max_length=60, default="The Elegance Edit", blank=True)
    bs_title = models.CharField(max_length=80, default="Bestsellers")

    trend_title = models.CharField(max_length=80, default="Most Trendy")
    trend_link_text = models.CharField(max_length=40, default="Shop All")
    trend_link_url = models.CharField(max_length=300, default="/shop")

    fc_title = models.CharField(max_length=80, default="Featured Collections")
    fc_link_text = models.CharField(max_length=40, default="View All")
    fc_link_url = models.CharField(max_length=300, default="/shop")

    # Section visibility
    show_new_arrivals = models.BooleanField(default=True)
    show_shop_category = models.BooleanField(default=True)
    show_bestsellers = models.BooleanField(default=True)
    show_collections = models.BooleanField(default=True)
    show_category_sections = models.BooleanField(default=True)
    show_trending = models.BooleanField(default=True)
    show_testimonials = models.BooleanField(default=True)
    show_benefits = models.BooleanField(default=True)
    show_stitch_cta = models.BooleanField(default=True)

    # Stitching banner
    stitch_eyebrow = models.CharField(max_length=60, default="Exclusively Yours")
    stitch_heading = models.CharField(max_length=160, default="Customised Stitching *Solutions*")
    stitch_body = models.CharField(max_length=255, default="Pick your fabric. Share your measurements. We stitch it perfectly — just for you.")
    stitch_cta_text = models.CharField(max_length=60, default="Book a Consultation")
    stitch_cta_url = models.CharField(max_length=300, default="/shop")
    stitch_image = models.ImageField(upload_to="home/", blank=True, null=True)

    # Navbar
    logo = models.ImageField(upload_to="home/", blank=True, null=True)
    announcements = models.JSONField(default=default_announcements, blank=True)
    nav_items = models.JSONField(default=default_nav_items, blank=True)
    mega_image = models.ImageField(upload_to="home/", blank=True, null=True)
    mega_image_label = models.CharField(max_length=40, default="New Season", blank=True)

    # Footer
    footer_tagline = models.CharField(
        max_length=255, default="An ethnic regalia — crafted with love for the modern Indian woman."
    )
    footer_socials = models.JSONField(default=default_footer_socials, blank=True)
    footer_columns = models.JSONField(default=default_footer_columns, blank=True)
    newsletter_heading = models.CharField(max_length=80, default="Stay in the Loop")
    newsletter_text = models.CharField(max_length=255, default="Get exclusive updates, new arrivals & offers in your inbox.")
    copyright_text = models.CharField(max_length=200, default="Elegance — An Ethnic Regalia. All rights reserved.")

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "home_settings"
        verbose_name = "Home Settings"
        verbose_name_plural = "Home Settings"

    def __str__(self):
        return "Home Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
