from .models import HomeSettings


def site_chrome(request):
    """Exposes the editable navbar/footer settings to every template."""
    if request.path.startswith(("/admin", "/user-api", "/product-api", "/order-api", "/home-api")):
        return {}
    return {"site_settings": HomeSettings.load()}
