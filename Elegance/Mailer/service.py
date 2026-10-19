import logging
import re
import threading
from datetime import timedelta
from html import unescape

from django.conf import settings
from django.db import connection, transaction
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import strip_tags

from .models import EmailLog

logger = logging.getLogger(__name__)

# A "queued" row younger than this is treated as in flight, so a duplicate trigger does not double-send.
_IN_FLIGHT_WINDOW = timedelta(minutes=5)


def is_configured():
    return bool(settings.RESEND_ENABLED and settings.RESEND_API_KEY and settings.RESEND_FROM_EMAIL)


def html_to_text(html):
    """Plain-text alternative for the HTML email (better deliverability, readable in text-only clients)."""
    html = re.sub(r"(?is)<(style|head|script).*?</\1>", "", html)

    def link(match):
        label = unescape(strip_tags(match.group(2))).strip()
        return f"{label}: {match.group(1)}" if label else ""

    html = re.sub(r'(?is)<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', link, html)
    html = re.sub(r"(?i)<br\s*/?>|</(p|tr|h\d|div|li)>", "\n", html)
    text = unescape(strip_tags(html))
    lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _deliver(log_id, payload, threaded):
    import resend

    try:        
        resend.api_key = settings.RESEND_API_KEY
        response = resend.Emails.send(payload)        
        provider_id = (response or {}).get("id", "") if isinstance(response, dict) else ""
        EmailLog.objects.filter(pk=log_id).update(
            status="sent", provider_id=provider_id, error="", sent_at=timezone.now(),
        )
    except Exception as exc:
        logger.warning("Resend failed for email log %s: %s", log_id, exc)
        EmailLog.objects.filter(pk=log_id).update(status="failed", error=str(exc)[:1000])
    finally:
        if threaded:
            connection.close()


def send_email(*, event, dedupe_key, to, subject, template, context, user=None, order=None):
    """Render `template` and send it through Resend. Never raises; the outcome lives in EmailLog.

    Returns the EmailLog row (or None if something unexpected went wrong)."""
    try:
        log, created = EmailLog.objects.get_or_create(
            dedupe_key=dedupe_key,
            defaults={"event": event, "recipient": to or "", "subject": subject, "user": user, "order": order},
        )
        if not created:
            already_sent = log.status == "sent"
            in_flight = log.status == "queued" and timezone.now() - log.created_at < _IN_FLIGHT_WINDOW
            if already_sent or in_flight:
                return log
            log.recipient, log.subject = to or "", subject

        if not to:
            log.status, log.error = "skipped", "The customer has no email address on file."
            log.save()
            return log

        if not is_configured():
            log.status = "skipped"
            log.error = "Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL."
            log.save()
            return log

        html = render_to_string(template, {**context, "subject": subject, "recipient": to})
        payload = {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
            "text": html_to_text(html),
        }
        if settings.RESEND_REPLY_TO:
            payload["reply_to"] = settings.RESEND_REPLY_TO

        log.status, log.error = "queued", ""
        log.save()

        if settings.RESEND_SEND_ASYNC:
            transaction.on_commit(
                lambda: threading.Thread(target=_deliver, args=(log.pk, payload, True), daemon=True).start()
            )
        else:
            _deliver(log.pk, payload, False)
            log.refresh_from_db()
        return log
    except Exception:
        logger.exception("Could not send %s email (%s)", event, dedupe_key)
        return None
