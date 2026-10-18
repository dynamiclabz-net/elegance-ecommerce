"""Read-side helpers: turn Home models into plain dicts for the home template
and for the admin live previews. One card shape is used everywhere so the
preview always matches what customers see."""

from django.templatetags.static import static

from Product.models import Product

from .models import (
    HomeBanner, HomeCategorySection, HomeCategoryTile, HomeCollection,
    HomeProductPick, HomeSettings,
)

PLACEHOLDER_IMAGE = "images/placeholder-product.png"
SIZE_ATTRIBUTE_SLUGS = ("size", "sizes")


def media_url(field):
    return field.url if field else ""


def format_inr(value):
    """12345 -> '12,345' using the Indian grouping (last 3, then pairs)."""
    n = int(round(float(value or 0)))
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    return ("-" if n < 0 else "") + s


def _images(product):
    imgs = list(product.images.all())
    imgs.sort(key=lambda i: (not i.is_primary, i.display_order, i.id))
    return imgs


def _sizes(product):
    sizes, seen = [], set()
    for variant in product.variants.all():
        if not variant.is_active or variant.stock_quantity <= 0:
            continue
        for av in variant.attribute_values.all():
            if av.attribute.slug in SIZE_ATTRIBUTE_SLUGS and av.value not in seen:
                seen.add(av.value)
                sizes.append((av.display_order, av.value))
    return [value for _, value in sorted(sizes)]


def product_card(product):
    images = _images(product)
    primary = media_url(images[0].image) if images else static(PLACEHOLDER_IMAGE)
    hover = media_url(images[1].image) if len(images) > 1 else primary
    price = product.effective_price
    has_discount = bool(product.discount_price and product.discount_price < product.price)
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "url": f"/product/{product.slug}/",
        "category_id": product.category_id,
        "category_name": product.category.name if product.category_id else "",
        "price": format_inr(price),
        "mrp": format_inr(product.price) if has_discount else "",
        "discount_pct": product.discount_percentage if has_discount else 0,
        "image": primary,
        "hover_image": hover,
        "sizes": _sizes(product),
        "in_stock": product.in_stock,
        "is_active": product.is_active,
    }


def product_queryset():
    return Product.objects.select_related("category").prefetch_related(
        "images", "variants__attribute_values__attribute"
    )


def banner_dict(b):
    return {
        "id": b.id,
        "image": media_url(b.image),
        "eyebrow": b.eyebrow,
        "heading": b.heading,
        "sub_text": b.sub_text,
        "text_align": b.text_align,
        "overlay": b.overlay,
        "btn1_text": b.btn1_text,
        "btn1_url": b.btn1_url,
        "btn2_text": b.btn2_text,
        "btn2_url": b.btn2_url,
        "thumb_label": b.thumb_label,
        "display_order": b.display_order,
        "is_active": b.is_active,
    }


def picks_for(section, only_live=True):
    qs = HomeProductPick.objects.filter(section=section).select_related("product__category").order_by("display_order", "id")
    cards = []
    ids = [p.product_id for p in qs]
    products = {p.id: p for p in product_queryset().filter(id__in=ids)}
    for pick in qs:
        product = products.get(pick.product_id)
        if not product:
            continue
        if only_live and not product.is_active:
            continue
        card = product_card(product)
        card["pick_id"] = pick.id
        cards.append(card)
    return cards


def tile_dict(t):
    return {
        "id": t.id,
        "category_id": t.category_id,
        "category_name": t.category.name,
        "title": t.title or t.category.name,
        "custom_title": t.title,
        "image": media_url(t.image) or media_url(t.category.image) or static(PLACEHOLDER_IMAGE),
        "has_own_image": bool(t.image),
        "url": f"/shop/?category={t.category.slug}",
        "display_order": t.display_order,
        "is_active": t.is_active,
    }


def category_section_dict(section, only_live=True):
    items = section.items.select_related("product__category").order_by("display_order", "id")
    products = {p.id: p for p in product_queryset().filter(id__in=[i.product_id for i in items])}
    cards = []
    for item in items:
        product = products.get(item.product_id)
        if not product or (only_live and not product.is_active):
            continue
        card = product_card(product)
        card["item_id"] = item.id
        cards.append(card)
    return {
        "id": section.id,
        "category_id": section.category_id,
        "category_name": section.category.name,
        "title": section.title or section.category.name,
        "custom_title": section.title,
        "url": f"/shop/?category={section.category.slug}",
        "display_order": section.display_order,
        "is_active": section.is_active,
        "products": cards,
    }


def collection_dict(collection, only_live=True):
    items = collection.items.select_related("product__category").order_by("display_order", "id")
    products = {p.id: p for p in product_queryset().filter(id__in=[i.product_id for i in items])}
    cards = []
    for item in items:
        product = products.get(item.product_id)
        if not product or (only_live and not product.is_active):
            continue
        card = product_card(product)
        card["item_id"] = item.id
        cards.append(card)
    return {
        "id": collection.id,
        "tab_label": collection.tab_label,
        "banner_title": collection.banner_title or collection.tab_label,
        "custom_banner_title": collection.banner_title,
        "banner_text": collection.banner_text,
        "banner_image": media_url(collection.banner_image),
        "cta_text": collection.cta_text,
        "cta_url": collection.cta_url,
        "meta_left": collection.meta_left or f"Selected from {collection.tab_label}",
        "meta_right": collection.meta_right,
        "display_order": collection.display_order,
        "is_active": collection.is_active,
        "products": cards,
    }


def settings_dict(s):
    return {
        "na_title": s.na_title, "na_link_text": s.na_link_text, "na_link_url": s.na_link_url,
        "cat_eyebrow": s.cat_eyebrow, "cat_title": s.cat_title,
        "cat_all_text": s.cat_all_text, "cat_all_url": s.cat_all_url,
        "bs_eyebrow": s.bs_eyebrow, "bs_title": s.bs_title,
        "trend_title": s.trend_title, "trend_link_text": s.trend_link_text, "trend_link_url": s.trend_link_url,
        "fc_title": s.fc_title, "fc_link_text": s.fc_link_text, "fc_link_url": s.fc_link_url,
        "show_new_arrivals": s.show_new_arrivals, "show_shop_category": s.show_shop_category,
        "show_bestsellers": s.show_bestsellers, "show_collections": s.show_collections,
        "show_category_sections": s.show_category_sections, "show_trending": s.show_trending,
        "show_testimonials": s.show_testimonials, "show_benefits": s.show_benefits,
        "show_stitch_cta": s.show_stitch_cta,
        "stitch_eyebrow": s.stitch_eyebrow, "stitch_heading": s.stitch_heading, "stitch_body": s.stitch_body,
        "stitch_cta_text": s.stitch_cta_text, "stitch_cta_url": s.stitch_cta_url,
        "stitch_image": media_url(s.stitch_image),
        "logo": media_url(s.logo),
        "announcements": s.announcements,
        "nav_items": s.nav_items,
        "mega_image": media_url(s.mega_image),
        "mega_image_label": s.mega_image_label,
        "footer_tagline": s.footer_tagline, "footer_socials": s.footer_socials,
        "footer_columns": s.footer_columns,
        "newsletter_heading": s.newsletter_heading, "newsletter_text": s.newsletter_text,
        "copyright_text": s.copyright_text,
    }


def build_home_context():
    """Everything the public home template needs, live items only."""
    s = HomeSettings.load()
    banners = HomeBanner.objects.filter(is_active=True)
    sections = [
        category_section_dict(sec)
        for sec in HomeCategorySection.objects.filter(is_active=True).select_related("category")
    ]
    return {
        "home": s,
        "banners": [banner_dict(b) for b in banners],
        "new_arrivals": picks_for(HomeProductPick.SECTION_NEW_ARRIVALS)[:4],
        "tiles": [
            tile_dict(t)
            for t in HomeCategoryTile.objects.filter(is_active=True, category__is_active=True).select_related("category")
        ],
        "bestsellers": picks_for(HomeProductPick.SECTION_BESTSELLERS),
        "trending": picks_for(HomeProductPick.SECTION_TRENDING),
        "category_sections": [sec for sec in sections if sec["products"]],
        "collections": [c for c in (collection_dict(c) for c in HomeCollection.objects.filter(is_active=True)) if c["products"]],
    }
