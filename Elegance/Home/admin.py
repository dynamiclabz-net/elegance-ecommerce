from django.contrib import admin

from .models import (
    HomeBanner, HomeProductPick, HomeCategoryTile, HomeCategorySection,
    HomeCategorySectionItem, HomeCollection, HomeCollectionItem, HomeSettings,
)


@admin.register(HomeBanner)
class HomeBannerAdmin(admin.ModelAdmin):
    list_display = ("id", "heading", "display_order", "is_active")
    list_editable = ("display_order", "is_active")


@admin.register(HomeProductPick)
class HomeProductPickAdmin(admin.ModelAdmin):
    list_display = ("section", "product", "display_order")
    list_filter = ("section",)


class HomeCategorySectionItemInline(admin.TabularInline):
    model = HomeCategorySectionItem
    extra = 0


@admin.register(HomeCategorySection)
class HomeCategorySectionAdmin(admin.ModelAdmin):
    list_display = ("id", "category", "title", "display_order", "is_active")
    inlines = [HomeCategorySectionItemInline]


class HomeCollectionItemInline(admin.TabularInline):
    model = HomeCollectionItem
    extra = 0
    max_num = HomeCollection.MAX_PRODUCTS


@admin.register(HomeCollection)
class HomeCollectionAdmin(admin.ModelAdmin):
    list_display = ("id", "tab_label", "display_order", "is_active")
    inlines = [HomeCollectionItemInline]


admin.site.register(HomeCategoryTile)
admin.site.register(HomeSettings)
