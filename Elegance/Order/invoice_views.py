from django.http import Http404, HttpResponse
from django.views.decorators.http import require_GET

from .invoice import build_invoice_pdf
from .models import Order


@require_GET
def order_invoice(request, order_number):
    """GET /order-api/invoice/<order_number>/ streams the invoice PDF.

    Add ?inline=1 to open it in the browser instead of downloading. Admins can fetch any
    invoice; customers only their own (other orders look like they do not exist)."""
    user = request.user
    if not user.is_authenticated:
        return HttpResponse("Please sign in to download this invoice.", status=401, content_type="text/plain")

    order = Order.objects.filter(order_number=order_number).first()
    is_admin = getattr(user, "role", None) == "admin" or user.is_superuser
    if order is None or (order.user_id != user.pk and not is_admin):
        raise Http404("Invoice not found.")

    pdf = build_invoice_pdf(order)
    filename = f"Invoice-{order.invoice_number.replace('/', '-')}.pdf"
    disposition = "inline" if request.GET.get("inline") else "attachment"

    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = f'{disposition}; filename="{filename}"'
    response["Cache-Control"] = "private, no-store"
    return response
