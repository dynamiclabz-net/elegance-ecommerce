from django.contrib import admin
from django.conf import settings
from django.urls import path, include
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),

    # Page routes (server-rendered HTML) — no "-api" suffix.
    path("", include("FrontEnd.urls")),

    # JSON API routes — every individual endpoint name ends with "-api".
    path("user-api/", include("UserDetail.urls")),
    path("product-api/", include("Product.urls")),
    path("order-api/", include("Order.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
