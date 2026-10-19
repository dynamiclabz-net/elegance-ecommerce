import uuid
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.template.loader import render_to_string

from Mailer import emails
from Mailer.service import is_configured, send_email
from Order.models import Order
from UserDetail.models import User

EVENTS = ["welcome", *emails.ORDER_EVENTS.keys()]


class Command(BaseCommand):
    help = (
        "Preview or send any customer email. Examples:\n"
        "  manage.py send_test_email welcome --user 1 --preview-dir /tmp/mail\n"
        "  manage.py send_test_email order_approved --order ORD-20260101-0001 --to you@example.com"
    )

    def add_arguments(self, parser):
        parser.add_argument("event", choices=EVENTS)
        parser.add_argument("--order", help="Order number (required for order emails)")
        parser.add_argument("--user", type=int, help="User id (for the welcome email)")
        parser.add_argument("--to", help="Send to this address instead of the customer's")
        parser.add_argument("--preview-dir", help="Write the rendered HTML here instead of sending")

    def handle(self, *args, **options):
        event = options["event"]
        if event == "welcome":
            user = User.objects.filter(pk=options["user"]).first() if options["user"] else User.objects.first()
            if user is None:
                raise CommandError("No user found. Pass --user <id>.")
            built = emails.build_welcome_email(user)
        else:
            if not options["order"]:
                raise CommandError("Order emails need --order <order number>.")
            order = Order.objects.filter(order_number=options["order"]).first()
            if order is None:
                raise CommandError(f"Order {options['order']} not found.")
            built = emails.build_order_email(order, event)

        recipient = options["to"] or built["to"]

        if options["preview_dir"]:
            out_dir = Path(options["preview_dir"])
            out_dir.mkdir(parents=True, exist_ok=True)
            html = render_to_string(built["template"], {**built["context"], "subject": built["subject"], "recipient": recipient or "customer@example.com"})
            target = out_dir / f"{event}.html"
            target.write_text(html, encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Preview written to {target}"))
            return

        if not is_configured():
            raise CommandError("Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.")
        if not recipient:
            raise CommandError("No recipient. Pass --to you@example.com.")

        log = send_email(
            event=f"test_{event}", dedupe_key=f"test:{uuid.uuid4().hex[:12]}",
            to=recipient, subject=f"[TEST] {built['subject']}",
            template=built["template"], context=built["context"],
        )
        if log is None or log.status == "failed":
            raise CommandError(f"Send failed: {log.error if log else 'unexpected error'}")
        self.stdout.write(self.style.SUCCESS(f"{log.status.title()} to {recipient} (Resend id {log.provider_id or 'pending'})"))
