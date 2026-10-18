import re

from django import template
from django.utils.html import escape
from django.utils.safestring import mark_safe

register = template.Library()

_EMPHASIS = re.compile(r"\*(.+?)\*")


@register.filter
def heading_markup(value):
    """Escape the text, then turn a newline into <br> and *word* into <em>word</em>."""
    text = escape(value or "")
    text = _EMPHASIS.sub(r"<em>\1</em>", text)
    text = text.replace("\r\n", "\n").replace("\n", "<br>")
    return mark_safe(text)


@register.filter
def plain_markup(value):
    """Same text with the markup characters removed (for alt text / titles)."""
    return (value or "").replace("*", "").replace("\r\n", " ").replace("\n", " ")
