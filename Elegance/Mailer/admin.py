from django.contrib import admin

from .models import EmailLog


@admin.register(EmailLog)
class EmailLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "event", "recipient", "status", "order", "provider_id")
    list_filter = ("status", "event")
    search_fields = ("recipient", "subject", "dedupe_key", "order__order_number", "provider_id")
    readonly_fields = [f.name for f in EmailLog._meta.fields]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False
