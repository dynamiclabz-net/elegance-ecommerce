from django.conf import settings
from django.db import models


class EmailLog(models.Model):
    """One row per email the store tries to send.

    `dedupe_key` (for example "order_approved:42") makes every event send at most once, even if the
    status sync or a webhook fires repeatedly."""

    STATUS_CHOICES = (
        ("queued", "Queued"),
        ("sent", "Sent"),
        ("failed", "Failed"),
        ("skipped", "Skipped"),
    )

    event = models.CharField(max_length=40, db_index=True)
    dedupe_key = models.CharField(max_length=80, unique=True)
    recipient = models.CharField(max_length=254, blank=True)
    subject = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="queued", db_index=True)
    provider_id = models.CharField(max_length=100, blank=True)
    error = models.TextField(blank=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="email_logs",
    )
    order = models.ForeignKey(
        "Order.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="email_logs",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mailer_email_log"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event} -> {self.recipient or 'no recipient'} ({self.status})"
