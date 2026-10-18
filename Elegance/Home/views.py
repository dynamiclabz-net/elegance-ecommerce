import json

from django.db import transaction
from django.db.models import Max, Q
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from Product.models import Category, Product
from utils.decorators import check_authentication, handle_exceptions

from .models import (
    HomeBanner, HomeCategorySection, HomeCategorySectionItem, HomeCategoryTile,
    HomeCollection, HomeCollectionItem, HomeProductPick, HomeSettings,
)
from .services import (
    banner_dict, category_section_dict, collection_dict, picks_for,
    product_card, product_queryset, settings_dict, tile_dict,
)

ADMIN = "admin"


def ok(data=None, code=status.HTTP_200_OK):
    return Response(
        {"success": True, "user_not_logged_in": False, "user_unauthorized": False, "data": data, "error": None},
        status=code,
    )


def fail(message, code=status.HTTP_400_BAD_REQUEST):
    return Response(
        {"success": False, "user_not_logged_in": False, "user_unauthorized": False, "data": None, "error": message},
        status=code,
    )


def to_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "on", "yes")


def next_order(model, **filters):
    current = model.objects.filter(**filters).aggregate(m=Max("display_order"))["m"]
    return 0 if current is None else current + 1


def apply_reorder(model, ids):
    """Persist a drag/arrow order: position in `ids` becomes display_order."""
    with transaction.atomic():
        for position, pk in enumerate(ids):
            model.objects.filter(pk=pk).update(display_order=position)


def parse_ids(value):
    if not isinstance(value, list):
        raise ValueError("A list of ids is required.")
    ids = []
    for raw in value:
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            raise ValueError("Ids must be integers.")
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate ids are not allowed.")
    return ids


def copy_text_fields(obj, data, fields):
    for field in fields:
        if field in data:
            setattr(obj, field, (data.get(field) or "").strip())


class AdminViewSet(viewsets.ViewSet):
    parser_classes = (MultiPartParser, FormParser, JSONParser)


# ─────────────────────────────────────────────
# Banners
# ─────────────────────────────────────────────
BANNER_TEXT_FIELDS = (
    "eyebrow", "heading", "sub_text", "btn1_text", "btn1_url", "btn2_text", "btn2_url", "thumb_label",
)


class BannerViewSet(AdminViewSet):
    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def list(self, request):
        return ok({"banners": [banner_dict(b) for b in HomeBanner.objects.all()]})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def create(self, request):
        image = request.FILES.get("image")
        if not image:
            return fail("Banner image is required.")
        banner = HomeBanner(image=image, display_order=next_order(HomeBanner))
        self._fill(banner, request.data)
        banner.save()
        return ok({"banner": banner_dict(banner)}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def update(self, request, pk):
        banner = HomeBanner.objects.filter(pk=pk).first()
        if not banner:
            return fail("Banner not found.", status.HTTP_404_NOT_FOUND)
        if request.FILES.get("image"):
            banner.image = request.FILES["image"]
        self._fill(banner, request.data)
        banner.save()
        return ok({"banner": banner_dict(banner)})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def destroy(self, request, pk):
        deleted, _ = HomeBanner.objects.filter(pk=pk).delete()
        if not deleted:
            return fail("Banner not found.", status.HTTP_404_NOT_FOUND)
        return ok({"deleted": True})

    @staticmethod
    def _fill(banner, data):
        copy_text_fields(banner, data, BANNER_TEXT_FIELDS)
        if data.get("text_align") in dict(HomeBanner.ALIGN_CHOICES):
            banner.text_align = data["text_align"]
        if data.get("overlay") in dict(HomeBanner.OVERLAY_CHOICES):
            banner.overlay = data["overlay"]
        if "is_active" in data:
            banner.is_active = to_bool(data.get("is_active"), True)


class ReorderMixin:
    reorder_model = None

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def reorder(self, request):
        try:
            ids = parse_ids(request.data.get("ids"))
        except ValueError as exc:
            return fail(str(exc))
        apply_reorder(self.reorder_model, ids)
        return ok({"reordered": len(ids)})


class BannerReorderViewSet(ReorderMixin, AdminViewSet):
    reorder_model = HomeBanner


# ─────────────────────────────────────────────
# Product picks (New Arrivals / Bestsellers / Most Trendy)
# ─────────────────────────────────────────────
class ProductPickViewSet(AdminViewSet):
    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def list(self, request):
        section = request.query_params.get("section")
        if section not in dict(HomeProductPick.SECTION_CHOICES):
            return fail("A valid section is required.")
        return ok({"products": picks_for(section, only_live=False), "limit": HomeProductPick.SECTION_LIMITS.get(section)})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def create(self, request):
        """Replace the ordered product list of a section in one call."""
        section = request.data.get("section")
        if section not in dict(HomeProductPick.SECTION_CHOICES):
            return fail("A valid section is required.")
        try:
            ids = parse_ids(request.data.get("product_ids"))
        except ValueError as exc:
            return fail(str(exc))
        limit = HomeProductPick.SECTION_LIMITS.get(section)
        if limit and len(ids) > limit:
            return fail(f"This section can show at most {limit} products.")
        found = set(Product.objects.filter(id__in=ids).values_list("id", flat=True))
        if len(found) != len(ids):
            return fail("One or more selected products no longer exist.")
        with transaction.atomic():
            HomeProductPick.objects.filter(section=section).delete()
            HomeProductPick.objects.bulk_create(
                [HomeProductPick(section=section, product_id=pid, display_order=i) for i, pid in enumerate(ids)]
            )
        return ok({"products": picks_for(section, only_live=False)})


# ─────────────────────────────────────────────
# Shop by Category tiles
# ─────────────────────────────────────────────
class CategoryTileViewSet(AdminViewSet):
    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def list(self, request):
        tiles = HomeCategoryTile.objects.select_related("category")
        return ok({"tiles": [tile_dict(t) for t in tiles]})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def create(self, request):
        category = Category.objects.filter(pk=request.data.get("category")).first()
        if not category:
            return fail("Select a valid category.")
        if HomeCategoryTile.objects.filter(category=category).exists():
            return fail(f'"{category.name}" is already on the homepage.')
        tile = HomeCategoryTile(category=category, display_order=next_order(HomeCategoryTile))
        if request.FILES.get("image"):
            tile.image = request.FILES["image"]
        copy_text_fields(tile, request.data, ("title",))
        tile.save()
        return ok({"tile": tile_dict(tile)}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def update(self, request, pk):
        tile = HomeCategoryTile.objects.select_related("category").filter(pk=pk).first()
        if not tile:
            return fail("Tile not found.", status.HTTP_404_NOT_FOUND)
        if request.FILES.get("image"):
            tile.image = request.FILES["image"]
        if to_bool(request.data.get("remove_image")):
            tile.image = None
        copy_text_fields(tile, request.data, ("title",))
        if "is_active" in request.data:
            tile.is_active = to_bool(request.data.get("is_active"), True)
        tile.save()
        return ok({"tile": tile_dict(tile)})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def destroy(self, request, pk):
        deleted, _ = HomeCategoryTile.objects.filter(pk=pk).delete()
        if not deleted:
            return fail("Tile not found.", status.HTTP_404_NOT_FOUND)
        return ok({"deleted": True})


class CategoryTileReorderViewSet(ReorderMixin, AdminViewSet):
    reorder_model = HomeCategoryTile


# ─────────────────────────────────────────────
# Category showcase carousels
# ─────────────────────────────────────────────
class CategorySectionViewSet(AdminViewSet):
    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def list(self, request):
        sections = HomeCategorySection.objects.select_related("category")
        return ok({"sections": [category_section_dict(s, only_live=False) for s in sections]})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def create(self, request):
        category = Category.objects.filter(pk=request.data.get("category")).first()
        if not category:
            return fail("Select a valid category.")
        section = HomeCategorySection(category=category, display_order=next_order(HomeCategorySection))
        copy_text_fields(section, request.data, ("title",))
        section.save()
        return ok({"section": category_section_dict(section, only_live=False)}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def update(self, request, pk):
        section = HomeCategorySection.objects.select_related("category").filter(pk=pk).first()
        if not section:
            return fail("Section not found.", status.HTTP_404_NOT_FOUND)
        copy_text_fields(section, request.data, ("title",))
        if "is_active" in request.data:
            section.is_active = to_bool(request.data.get("is_active"), True)
        section.save()
        return ok({"section": category_section_dict(section, only_live=False)})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def destroy(self, request, pk):
        deleted, _ = HomeCategorySection.objects.filter(pk=pk).delete()
        if not deleted:
            return fail("Section not found.", status.HTTP_404_NOT_FOUND)
        return ok({"deleted": True})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def set_products(self, request, pk):
        section = HomeCategorySection.objects.select_related("category").filter(pk=pk).first()
        if not section:
            return fail("Section not found.", status.HTTP_404_NOT_FOUND)
        try:
            ids = parse_ids(request.data.get("product_ids"))
        except ValueError as exc:
            return fail(str(exc))
        if len(Product.objects.filter(id__in=ids)) != len(ids):
            return fail("One or more selected products no longer exist.")
        with transaction.atomic():
            section.items.all().delete()
            HomeCategorySectionItem.objects.bulk_create(
                [HomeCategorySectionItem(section=section, product_id=pid, display_order=i) for i, pid in enumerate(ids)]
            )
        return ok({"section": category_section_dict(section, only_live=False)})


class CategorySectionReorderViewSet(ReorderMixin, AdminViewSet):
    reorder_model = HomeCategorySection


# ─────────────────────────────────────────────
# Featured collections
# ─────────────────────────────────────────────
COLLECTION_TEXT_FIELDS = (
    "tab_label", "banner_title", "banner_text", "cta_text", "cta_url", "meta_left", "meta_right",
)


class CollectionViewSet(AdminViewSet):
    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def list(self, request):
        return ok({"collections": [collection_dict(c, only_live=False) for c in HomeCollection.objects.all()]})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def create(self, request):
        label = (request.data.get("tab_label") or "").strip()
        if not label:
            return fail("Collection name is required.")
        collection = HomeCollection(display_order=next_order(HomeCollection))
        copy_text_fields(collection, request.data, COLLECTION_TEXT_FIELDS)
        if request.FILES.get("banner_image"):
            collection.banner_image = request.FILES["banner_image"]
        collection.cta_text = collection.cta_text or "Discover Collection"
        collection.cta_url = collection.cta_url or "/shop"
        collection.save()
        return ok({"collection": collection_dict(collection, only_live=False)}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def update(self, request, pk):
        collection = HomeCollection.objects.filter(pk=pk).first()
        if not collection:
            return fail("Collection not found.", status.HTTP_404_NOT_FOUND)
        copy_text_fields(collection, request.data, COLLECTION_TEXT_FIELDS)
        if not collection.tab_label:
            return fail("Collection name is required.")
        if request.FILES.get("banner_image"):
            collection.banner_image = request.FILES["banner_image"]
        if to_bool(request.data.get("remove_image")):
            collection.banner_image = None
        if "is_active" in request.data:
            collection.is_active = to_bool(request.data.get("is_active"), True)
        collection.save()
        return ok({"collection": collection_dict(collection, only_live=False)})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def destroy(self, request, pk):
        deleted, _ = HomeCollection.objects.filter(pk=pk).delete()
        if not deleted:
            return fail("Collection not found.", status.HTTP_404_NOT_FOUND)
        return ok({"deleted": True})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def set_products(self, request, pk):
        collection = HomeCollection.objects.filter(pk=pk).first()
        if not collection:
            return fail("Collection not found.", status.HTTP_404_NOT_FOUND)
        try:
            ids = parse_ids(request.data.get("product_ids"))
        except ValueError as exc:
            return fail(str(exc))
        if len(ids) > HomeCollection.MAX_PRODUCTS:
            return fail(f"A collection can hold at most {HomeCollection.MAX_PRODUCTS} products.")
        if len(Product.objects.filter(id__in=ids)) != len(ids):
            return fail("One or more selected products no longer exist.")
        with transaction.atomic():
            collection.items.all().delete()
            HomeCollectionItem.objects.bulk_create(
                [HomeCollectionItem(collection=collection, product_id=pid, display_order=i) for i, pid in enumerate(ids)]
            )
        return ok({"collection": collection_dict(collection, only_live=False)})


class CollectionReorderViewSet(ReorderMixin, AdminViewSet):
    reorder_model = HomeCollection


# ─────────────────────────────────────────────
# Product picker used by every tab
# ─────────────────────────────────────────────
class ProductSearchViewSet(AdminViewSet):
    PAGE_SIZE = 24

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def list(self, request):
        qs = product_queryset().filter(is_active=True)
        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category_id=category)
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(Q(name__icontains=term) | Q(sku__icontains=term))
        try:
            page = max(int(request.query_params.get("page", 1)), 1)
        except ValueError:
            page = 1
        total = qs.count()
        start = (page - 1) * self.PAGE_SIZE
        rows = qs.order_by("-created_at")[start:start + self.PAGE_SIZE]
        return ok({
            "products": [product_card(p) for p in rows],
            "total": total,
            "page": page,
            "has_more": start + self.PAGE_SIZE < total,
        })


# ─────────────────────────────────────────────
# Settings: copy, toggles, navbar, footer
# ─────────────────────────────────────────────
SETTINGS_TEXT_FIELDS = (
    "na_title", "na_link_text", "na_link_url",
    "cat_eyebrow", "cat_title", "cat_all_text", "cat_all_url",
    "bs_eyebrow", "bs_title",
    "trend_title", "trend_link_text", "trend_link_url",
    "fc_title", "fc_link_text", "fc_link_url",
    "stitch_eyebrow", "stitch_heading", "stitch_body", "stitch_cta_text", "stitch_cta_url",
    "mega_image_label", "footer_tagline", "newsletter_heading", "newsletter_text", "copyright_text",
)
SETTINGS_BOOL_FIELDS = (
    "show_new_arrivals", "show_shop_category", "show_bestsellers", "show_collections",
    "show_category_sections", "show_trending", "show_testimonials", "show_benefits", "show_stitch_cta",
)
REQUIRED_SETTINGS_TEXT = ("na_title", "cat_title", "bs_title", "trend_title", "fc_title")
IMAGE_FIELDS = ("logo", "mega_image", "stitch_image")


def _json_field(request, name):
    raw = request.data.get(name)
    if raw is None:
        return None
    value = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(value, list):
        raise ValueError(f"{name} must be a list.")
    return value


def _clean_links(links):
    cleaned = []
    for link in links or []:
        label = str(link.get("label", "")).strip()
        if label:
            cleaned.append({"label": label, "url": str(link.get("url", "")).strip() or "#"})
    return cleaned


def _clean_columns(columns):
    cleaned = []
    for col in columns or []:
        heading = str(col.get("heading", "")).strip()
        links = _clean_links(col.get("links"))
        if heading or links:
            cleaned.append({"heading": heading, "links": links})
    return cleaned


class SettingsViewSet(AdminViewSet):
    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def list(self, request):
        return ok({"settings": settings_dict(HomeSettings.load())})

    @handle_exceptions
    @check_authentication(required_role=ADMIN)
    def create(self, request):
        s = HomeSettings.load()
        copy_text_fields(s, request.data, SETTINGS_TEXT_FIELDS)
        for name in REQUIRED_SETTINGS_TEXT:
            if name in request.data and not getattr(s, name):
                return fail("Section titles cannot be empty.")
        for name in SETTINGS_BOOL_FIELDS:
            if name in request.data:
                setattr(s, name, to_bool(request.data.get(name), True))
        for name in IMAGE_FIELDS:
            if request.FILES.get(name):
                setattr(s, name, request.FILES[name])
            if to_bool(request.data.get(f"remove_{name}")):
                setattr(s, name, None)
        try:
            announcements = _json_field(request, "announcements")
            nav_items = _json_field(request, "nav_items")
            footer_columns = _json_field(request, "footer_columns")
            footer_socials = _json_field(request, "footer_socials")
        except (ValueError, json.JSONDecodeError) as exc:
            return fail(f"Invalid data: {exc}")
        if announcements is not None:
            s.announcements = [
                {
                    "text": str(a.get("text", "")).strip(),
                    "link_text": str(a.get("link_text", "")).strip(),
                    "link_url": str(a.get("link_url", "")).strip(),
                }
                for a in announcements if str(a.get("text", "")).strip()
            ]
        if nav_items is not None:
            cleaned = []
            for item in nav_items:
                label = str(item.get("label", "")).strip()
                if not label:
                    continue
                cleaned.append({
                    "label": label,
                    "url": str(item.get("url", "")).strip() or "#",
                    "style": "sale" if item.get("style") == "sale" else "",
                    "columns": _clean_columns(item.get("columns")),
                })
            s.nav_items = cleaned
        if footer_columns is not None:
            s.footer_columns = _clean_columns(footer_columns)
        if footer_socials is not None:
            s.footer_socials = [
                {
                    "icon": str(x.get("icon", "")).strip() or "fas fa-link",
                    "label": str(x.get("label", "")).strip(),
                    "url": str(x.get("url", "")).strip() or "#",
                }
                for x in footer_socials if str(x.get("url", "")).strip()
            ]
        s.save()
        return ok({"settings": settings_dict(s)})
