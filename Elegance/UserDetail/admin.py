from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User, OTPVerification, Address


class AddressInline(admin.TabularInline):
    model = Address
    extra = 0
    fields = (
        "full_name", "mobile", "address_line1", "city", "state",
        "pincode", "address_type", "is_default",
    )


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User

    list_display = (
        "user_id", "contact_number", "full_name", "email", "role",
        "is_active", "is_staff", "date_joined",
    )
    list_filter = ("role", "is_active", "is_staff", "date_joined")
    search_fields = ("contact_number", "email", "first_name", "last_name")
    ordering = ("-date_joined",)
    readonly_fields = ("date_joined", "last_login_at", "last_login")
    inlines = [AddressInline]

    fieldsets = (
        (None, {"fields": ("contact_number", "password")}),
        ("Personal Info", {"fields": ("first_name", "last_name", "email")}),
        ("Role & Permissions", {
            "fields": ("role", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")
        }),
        ("Important Dates", {"fields": ("last_login", "last_login_at", "date_joined")}),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("contact_number", "password1", "password2", "role", "is_staff", "is_superuser"),
        }),
    )

    filter_horizontal = ("groups", "user_permissions")


@admin.register(OTPVerification)
class OTPVerificationAdmin(admin.ModelAdmin):
    list_display = ("mobile", "otp", "is_verified", "attempt_count", "created_at", "expires_at")
    list_filter = ("is_verified", "created_at")
    search_fields = ("mobile",)
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = (
        "id", "user", "full_name", "mobile", "city", "state",
        "pincode", "address_type", "is_default", "updated_at",
    )
    list_filter = ("address_type", "is_default", "state")
    search_fields = ("full_name", "mobile", "city", "pincode", "user__contact_number")
    autocomplete_fields = ("user",)
    ordering = ("-updated_at",)
