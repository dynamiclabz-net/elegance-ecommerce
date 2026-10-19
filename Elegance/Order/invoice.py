"""GST tax invoice PDF for an order, laid out after the store's invoice format."""
import os
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.conf import settings
from django.contrib.staticfiles import finders
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from . import tax

PRIMARY = colors.HexColor("#b8860b")
PRIMARY_TINT = colors.HexColor("#FBF6E6")
GOLD = colors.HexColor("#C9A03A")
GOLD_TINT = colors.HexColor("#FBF6E6")
INK = colors.HexColor("#2A2A2A")
MUTED = colors.HexColor("#6E6A66")
RULE = colors.HexColor("#E7DECF")

PAGE_W, PAGE_H = A4
MARGIN = 10 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

TERMS = (
    "Goods once sold will not be exchanged or refunded.",
    "First wash must be dry clean only.",
    "No guarantee on handloom, silk, jari, colours, pearls and thread work.",
    "Always wash separately and do not dry in direct sunlight.",
    "Interest @ 18% p.a. is chargeable on overdue payments.",
)

_ONES = (
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
)
_TENS = ("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")


def _below_hundred(n):
    return _ONES[n] if n < 20 else (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else ""))


def _below_thousand(n):
    words = []
    if n >= 100:
        words.append(_ONES[n // 100] + " Hundred")
        n %= 100
    if n:
        words.append(_below_hundred(n))
    return " ".join(words)


def amount_in_words(amount):
    """Indian-system words, e.g. 1250.50 -> 'Rupees One Thousand Two Hundred Fifty and Fifty Paise Only'."""
    amount = Decimal(amount).quantize(Decimal("0.01"))
    rupees, paise = int(amount), int((amount - int(amount)) * 100)
    if rupees == 0 and paise == 0:
        return "Rupees Zero Only"

    parts = []
    for divisor, label in ((10_000_000, "Crore"), (100_000, "Lakh"), (1_000, "Thousand")):
        if rupees >= divisor:
            parts.append(f"{_below_hundred(rupees // divisor) if rupees // divisor < 100 else _below_thousand(rupees // divisor)} {label}")
            rupees %= divisor
    if rupees:
        parts.append(_below_thousand(rupees))

    text = "Rupees " + " ".join(parts) if parts else "Rupees Zero"
    if paise:
        text += f" and {_below_hundred(paise)} Paise"
    return text + " Only"


def inr(value):
    """2-decimal number with Indian digit grouping (12,34,567.00)."""
    value = Decimal(value or 0).quantize(Decimal("0.01"))
    sign = "-" if value < 0 else ""
    whole, fraction = f"{abs(value):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{sign}{whole}.{fraction}"


def pct(rate):
    rate = Decimal(rate or 0)
    return f"{rate.normalize():f}" if rate else "0"


def _style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=8, leading=10.5, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)


S_BODY = _style("body")
S_SMALL = _style("small", fontSize=7, leading=9.2, textColor=MUTED)
S_LABEL = _style("label", fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=PRIMARY)
S_BOLD = _style("bold", fontName="Helvetica-Bold")
S_RIGHT = _style("right", alignment=TA_RIGHT)
S_TITLE = _style("title", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=PRIMARY, alignment=TA_RIGHT)
S_TITLE_SUB = _style("titlesub", fontSize=7.5, textColor=MUTED, alignment=TA_RIGHT)
S_CELL = _style("cell", fontSize=7.5, leading=9.4)
S_CELL_R = _style("cellr", fontSize=7.5, leading=9.4, alignment=TA_RIGHT)
S_CELL_C = _style("cellc", fontSize=7.5, leading=9.4, alignment=TA_CENTER)
S_HEAD = _style("head", fontName="Helvetica-Bold", fontSize=7, leading=8.6, textColor=colors.white, alignment=TA_CENTER)
S_THANKS = _style("thanks", fontName="Helvetica-Oblique", fontSize=9, textColor=GOLD, alignment=TA_CENTER)


def _p(text, style=S_BODY):
    return Paragraph(escape(str(text)), style)


def _logo(width):
    path = finders.find("images/elegance-logo.png") or os.path.join(
        settings.BASE_DIR, "static", "images", "elegance-logo.png"
    )
    if not os.path.exists(path):
        return _p("ELEGANCE", S_TITLE)
    from PIL import Image as PILImage

    with PILImage.open(path) as img:
        ratio = img.height / img.width
    logo = Image(path, width=width, height=width * ratio)
    logo.hAlign = "LEFT"
    return logo


def _lines(*rows):
    """Paragraph with <br/>-joined rows; each row is (label, value) or a plain string."""
    out = []
    for row in rows:
        if isinstance(row, tuple):
            label, value = row
            if value in (None, ""):
                continue
            out.append(f'<font color="#6E6A66">{escape(label)}</font> {escape(str(value))}')
        elif row:
            out.append(escape(str(row)))
    return Paragraph("<br/>".join(out), S_BODY)


def _party_table(order, seller, intra):
    buyer_state = order.shipping_state
    code = tax.state_code(buyer_state)
    address = ", ".join(x for x in (order.shipping_address_line1, order.shipping_address_line2) if x)
    locality = " ".join(x for x in (f"{order.shipping_city},", order.shipping_state, order.shipping_pincode) if x)

    seller_block = [
        Paragraph(f"<b>{escape(seller['legal_name'])}</b>", _style("sn", fontSize=10, leading=12.5)),
        _lines(
            seller["address"],
            ("Tel:", seller["phone"]),
            ("Mobile:", seller["mobile"]),
            ("Email:", seller["email"]),
            ("GSTIN:", seller["gstin"]),
            ("PAN:", seller["pan"]),
            ("State:", f"{seller['state']} (Code {seller['state_code']})"),
        ),
    ]
    buyer_block = [
        Paragraph(f"<b>{escape(order.shipping_full_name)}</b>", _style("bn", fontSize=10, leading=12.5)),
        _lines(
            address, locality, order.shipping_country,
            ("Mobile:", order.shipping_mobile),
            ("State:", f"{buyer_state} (Code {code})" if code else buyer_state),
            ("Buyer GSTIN:", "Not provided"),
        ),
    ]

    invoice_date = timezone.localtime(order.invoice_date or order.placed_at)
    placed = timezone.localtime(order.placed_at)
    meta_block = [
        _lines(
            ("Invoice No:", order.invoice_number),
            ("Invoice Date:", invoice_date.strftime("%d %b %Y")),
            ("Order No:", order.order_number),
            ("Order Date:", placed.strftime("%d %b %Y")),
            ("Place of Supply:", f"{buyer_state} ({code})" if code else buyer_state),
            ("Supply Type:", "Intra-state (CGST + SGST)" if intra else "Inter-state (IGST)"),
        ),
    ]

    w = CONTENT_W / 3
    table = Table(
        [
            [_p("SOLD BY", S_LABEL), _p("BILLED & SHIPPED TO", S_LABEL), _p("INVOICE DETAILS", S_LABEL)],
            [seller_block, buyer_block, meta_block],
        ],
        colWidths=[w + 6 * mm, w, w - 6 * mm],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_TINT),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LINEAFTER", (0, 0), (-2, -1), 0.6, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, 0), 4),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("TOPPADDING", (0, 1), (-1, 1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
    ]))
    return table


def _items_table(order, intra):
    head1 = ["Sr", "Description of Goods", "HSN", "Qty", "Rate", "GST %", "Assessable\nValue", "CGST", "", "SGST", "", "IGST", ""]
    head2 = ["", "", "", "", "", "", "", "%", "Amount", "%", "Amount", "%", "Amount"]
    rows = [[_p(h, S_HEAD) if h else "" for h in head1], [_p(h, S_HEAD) if h else "" for h in head2]]
    rows[0][6] = Paragraph("Assessable<br/>Value", S_HEAD)

    items = list(order.items.all())
    totals = {"qty": 0, "taxable": Decimal(0), "cgst": Decimal(0), "sgst": Decimal(0), "igst": Decimal(0)}
    for number, item in enumerate(items, start=1):
        rate = Decimal(item.gst_rate)
        unit_excl = tax.split_inclusive(item.unit_price, rate)[0]
        name = f"<b>{escape(item.product_name)}</b>"
        detail = " | ".join(x for x in (item.variant_label, f"SKU {item.sku}" if item.sku else "") if x)
        if detail:
            name += f'<br/><font size="6.5" color="#6E6A66">{escape(detail)}</font>'

        half = pct(rate / 2)
        rows.append([
            _p(number, S_CELL_C), Paragraph(name, S_CELL), _p(item.hsn_code or "-", S_CELL_C),
            _p(item.quantity, S_CELL_C), _p(inr(unit_excl), S_CELL_R), _p(pct(rate), S_CELL_C),
            _p(inr(item.taxable_value), S_CELL_R),
            _p(half if intra else "-", S_CELL_C), _p(inr(item.cgst_amount) if intra else "-", S_CELL_R),
            _p(half if intra else "-", S_CELL_C), _p(inr(item.sgst_amount) if intra else "-", S_CELL_R),
            _p("-" if intra else pct(rate), S_CELL_C), _p("-" if intra else inr(item.igst_amount), S_CELL_R),
        ])
        totals["qty"] += item.quantity
        totals["taxable"] += item.taxable_value
        totals["cgst"] += item.cgst_amount
        totals["sgst"] += item.sgst_amount
        totals["igst"] += item.igst_amount

    bold_r = _style("tr", fontName="Helvetica-Bold", fontSize=7.5, alignment=TA_RIGHT)
    bold_c = _style("tc", fontName="Helvetica-Bold", fontSize=7.5, alignment=TA_CENTER)
    rows.append([
        "", _p("Total", _style("tt", fontName="Helvetica-Bold", fontSize=7.5)), "", _p(totals["qty"], bold_c), "", "",
        _p(inr(totals["taxable"]), bold_r), "", _p(inr(totals["cgst"]) if intra else "-", bold_r),
        "", _p(inr(totals["sgst"]) if intra else "-", bold_r), "", _p("-" if intra else inr(totals["igst"]), bold_r),
    ])

    widths = [8, 51, 14, 8, 17, 9, 19, 7, 14, 7, 14, 7, 15]
    scale = CONTENT_W / (sum(widths) * mm)
    table = Table(rows, colWidths=[w * mm * scale for w in widths], repeatRows=2)
    last = len(rows) - 1
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 1), PRIMARY),
        ("SPAN", (7, 0), (8, 0)), ("SPAN", (9, 0), (10, 0)), ("SPAN", (11, 0), (12, 0)),
        *[("SPAN", (c, 0), (c, 1)) for c in range(0, 7)],
        ("VALIGN", (0, 0), (-1, 1), "MIDDLE"),
        ("VALIGN", (0, 2), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 2), (-1, last - 1), 0.4, RULE),
        ("LINEAFTER", (6, 0), (6, 1), 0.4, colors.Color(1, 1, 1, 0.35)),
        ("LINEBELOW", (7, 0), (-1, 0), 0.4, colors.Color(1, 1, 1, 0.35)),
        ("BACKGROUND", (0, last), (-1, last), GOLD_TINT),
        ("LINEABOVE", (0, last), (-1, last), 0.8, GOLD),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, 1), 4), ("BOTTOMPADDING", (0, 0), (-1, 1), 4),
        ("TOPPADDING", (0, 2), (-1, -1), 5), ("BOTTOMPADDING", (0, 2), (-1, -1), 5),
    ]))
    return table


def _summary_rows(order, summary, intra):
    rows = [("Basic price of goods", summary["basic_value"])]
    if summary["discount_excl_gst"] > 0:
        rows.append(("Less: Discount", -summary["discount_excl_gst"]))
    rows.append(("GST assessable value", summary["taxable_amount"]))
    if intra:
        rows += [("CGST", summary["cgst_amount"]), ("SGST", summary["sgst_amount"])]
    else:
        rows.append(("IGST", summary["igst_amount"]))
    rows.append(("Shipping charges", summary["shipping_charge"]))
    if summary["round_off"] != 0:
        rows.append(("Round off", summary["round_off"]))
    return rows


def _totals_section(order, summary, intra):
    left_w = CONTENT_W * 0.56
    right_w = CONTENT_W - left_w

    payment_lines = [("Payment Method:", order.get_payment_method_display()),
                     ("Payment Status:", order.get_payment_status_display())]
    if order.is_cod:
        payment_lines += [
            (f"COD advance ({pct(order.cod_advance_percentage)}%):", f"INR {inr(order.cod_advance_amount)}"),
            ("Balance on delivery:", f"INR {inr(order.cod_balance_amount)}"),
        ]
    left = Table(
        [
            [_p("AMOUNT IN WORDS", S_LABEL)],
            [Paragraph(f"<b>{escape(amount_in_words(order.total_amount))}</b>", _style("w", fontSize=8.5, leading=11))],
            [_p("PAYMENT DETAILS", S_LABEL)],
            [_lines(*payment_lines)],
        ],
        colWidths=[left_w - 4 * mm],
    )
    left.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_TINT), ("BACKGROUND", (0, 2), (-1, 2), PRIMARY_TINT),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    data = [[_p(label), _p(inr(value), S_RIGHT)] for label, value in _summary_rows(order, summary, intra)]
    net_label = _style("nl", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.white)
    net_value = _style("nv", fontName="Helvetica-Bold", fontSize=10.5, textColor=colors.white, alignment=TA_RIGHT)
    data.append([Paragraph("NET BILL AMOUNT", net_label), Paragraph(f"INR {inr(summary['total_amount'])}", net_value)])
    right = Table(data, colWidths=[right_w * 0.5, right_w * 0.5])
    last = len(data) - 1
    right.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LINEBELOW", (0, 0), (-1, last - 1), 0.4, RULE),
        ("BACKGROUND", (0, last), (-1, last), PRIMARY),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, last), (-1, last), 7), ("BOTTOMPADDING", (0, last), (-1, last), 7),
    ]))

    outer = Table([[left, right]], colWidths=[left_w, right_w])
    outer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return outer


def _terms_section(seller):
    terms = [_p("TERMS & CONDITIONS", S_LABEL)] + [
        Paragraph(f"{i}. {escape(t)}", S_SMALL) for i, t in enumerate(TERMS, start=1)
    ] + [Paragraph(f"{len(TERMS) + 1}. Subject to {escape(seller['jurisdiction'])} jurisdiction only. E. &amp; O. E.", S_SMALL)]

    sign = [
        Paragraph(f"For, <b>{escape(seller['legal_name'])}</b>", _style("fs", alignment=TA_CENTER, fontSize=9)),
        Spacer(1, 15 * mm),
        HRFlowable(width="80%", thickness=0.5, color=MUTED, spaceBefore=0, spaceAfter=3, hAlign="CENTER"),
        Paragraph("Authorised Signatory", _style("as", alignment=TA_CENTER, fontSize=7.5, textColor=MUTED)),
    ]
    w_left = CONTENT_W * 0.66
    table = Table([[terms, sign]], colWidths=[w_left, CONTENT_W - w_left])
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LINEAFTER", (0, 0), (0, 0), 0.6, RULE),
        ("BACKGROUND", (0, 0), (0, 0), GOLD_TINT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _draw_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.8)
    canvas.rect(MARGIN - 3 * mm, MARGIN - 3 * mm, PAGE_W - 2 * MARGIN + 6 * mm, PAGE_H - 2 * MARGIN + 6 * mm)
    canvas.setFont("Helvetica", 6.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, MARGIN - 1.5 * mm, "This is a computer generated invoice.")
    canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 1.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_invoice_pdf(order):
    """Render the GST tax invoice for `order` and return the PDF bytes."""
    tax.ensure_invoice_details(order)
    order.refresh_from_db()

    seller = tax.seller()
    summary = tax.build_price_summary(order)
    intra = not summary["is_igst"]

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN,
        bottomMargin=MARGIN + 3 * mm,
        title=f"Invoice {order.invoice_number}", author=seller["legal_name"],
        subject=f"GST tax invoice for order {order.order_number}",
    )

    header = Table(
        [[_logo(64 * mm), [_p("GST TAX INVOICE", S_TITLE), _p("Original for Recipient", S_TITLE_SUB)]]],
        colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    story = [
        header,
        HRFlowable(width="100%", thickness=1.4, color=GOLD, spaceBefore=3, spaceAfter=7),
        _party_table(order, seller, intra),
        Spacer(1, 6 * mm),
        _items_table(order, intra),
        Spacer(1, 4 * mm),
        KeepTogether([
            _totals_section(order, summary, intra),
            Spacer(1, 4 * mm),
            _terms_section(seller),
            Spacer(1, 5 * mm),
            Paragraph("Thank you for choosing Elegance - an ethnic regalia.", S_THANKS),
        ]),
    ]
    doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)
    return buffer.getvalue()
