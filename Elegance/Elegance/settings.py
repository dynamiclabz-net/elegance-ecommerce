import os
import base64
from pathlib import Path
from datetime import timedelta


IS_LOCAL = True
LOCAL_DB = True

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-bsgc9gg%lebfieqr$3qcu(r=yu2%el35ws*e#h*hioer@f29nv'

DEBUG = IS_LOCAL

ALLOWED_HOSTS = ["*"]


def base64_to_text(b64_text):
    # Decode the Base64 string back to bytes, then to text
    return base64.b64decode(b64_text.encode()).decode()

# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third party
    "rest_framework",
    "corsheaders",

    # Local apps
    "UserDetail",
    "Product",
    "Order",
    "Home",
    "Mailer",
    "FrontEnd",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "Elegance.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "Home.context_processors.site_chrome",
            ],
        },
    },
]

WSGI_APPLICATION = "Elegance.wsgi.application"


# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# Custom user model (defined in the UserDetail app)
AUTH_USER_MODEL = "UserDetail.User"

# Where @login_required / the FrontEnd check_authentication decorator sends
# unauthenticated users for normal (non-admin) pages. There is no separate
# customer login page — the account page itself shows the OTP modal.
LOGIN_URL = "account-list"


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True


# Static / Media files

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Max upload size for admin product/category image uploads (5 MB)
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024


# Django REST Framework

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.AllowAny",
    ),
}


# CORS (frontend is server-rendered from the same Django project, but this
# stays configured in case a separate JS client is added later)

CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
).split(",")
CORS_ALLOW_CREDENTIALS = True


# Cart / OTP related settings

OTP_EXPIRY_MINUTES = 5
OTP_MAX_ATTEMPTS = 5

# COD partial advance payment percentage (of total order value)
COD_ADVANCE_PERCENTAGE = 20

# ─────────────────────────────────────────────
# Razorpay
# ─────────────────────────────────────────────
# RAZORPAY_ENV picks which credential set is used: "test" or "live".
# Webhook secret is the one you set when adding the webhook in the Razorpay
# dashboard (Settings > Webhooks) pointing at /order-api/webhooks/razorpay/.
RAZORPAY_ENV = os.environ.get("RAZORPAY_ENV", "test")
RAZORPAY_CREDENTIALS = {
    "test": {
        "KEY_ID": os.environ.get("RAZORPAY_TEST_KEY_ID", base64_to_text("cnpwX3Rlc3RfUzV6OXlXcFh0d0VkVVg=")),
        "KEY_SECRET": os.environ.get("RAZORPAY_TEST_KEY_SECRET", base64_to_text("NTAyaldFeDBWUFE1b2RuSkJQVzNJblNS")),
        "WEBHOOK_SECRET": os.environ.get("RAZORPAY_TEST_WEBHOOK_SECRET", ""),
    },
    "live": {
        "KEY_ID": os.environ.get("RAZORPAY_LIVE_KEY_ID", ""),
        "KEY_SECRET": os.environ.get("RAZORPAY_LIVE_KEY_SECRET", ""),
        "WEBHOOK_SECRET": os.environ.get("RAZORPAY_LIVE_WEBHOOK_SECRET", ""),
    },
}
_razorpay_active = RAZORPAY_CREDENTIALS.get(RAZORPAY_ENV, RAZORPAY_CREDENTIALS["test"])
RAZORPAY_KEY_ID = _razorpay_active["KEY_ID"]
RAZORPAY_KEY_SECRET = _razorpay_active["KEY_SECRET"]
RAZORPAY_WEBHOOK_SECRET = _razorpay_active["WEBHOOK_SECRET"]

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"
RAZORPAY_CHECKOUT_JS_URL = "https://checkout.razorpay.com/v1/checkout.js"
RAZORPAY_BUSINESS_NAME = os.environ.get("RAZORPAY_BUSINESS_NAME", "Elegance")
RAZORPAY_THEME_COLOR = os.environ.get("RAZORPAY_THEME_COLOR", "#b8964f")
# How long a customer has to finish paying inside the Razorpay window.
RAZORPAY_PAYMENT_TIMEOUT_SECONDS = int(os.environ.get("RAZORPAY_PAYMENT_TIMEOUT_SECONDS", "900"))
# Leave empty to use the host the customer is browsing on. Set it (e.g. an https
# ngrok URL) when Razorpay must reach a different public address for the redirect.
RAZORPAY_CALLBACK_BASE_URL = os.environ.get("RAZORPAY_CALLBACK_BASE_URL", "").rstrip("/")

# The payment-status screen checks 1 time, then retries this many times.
PAYMENT_STATUS_MAX_RETRIES = 3
PAYMENT_STATUS_RETRY_DELAYS_MS = [3000, 5000, 8000]


# ─────────────────────────────────────────────
# Delivery partners
# ─────────────────────────────────────────────
# SHIPPING_ENV picks which credential set is used: "test" or "production".
# Shiprocket has no separate sandbox host, so "test" should be a dedicated
# test API user / account; both sets talk to the same base URL.
SHIPPING_ENV = os.environ.get("SHIPPING_ENV", "production")

SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external"
SHIPROCKET_CREDENTIALS = {
    "test": {
        "EMAIL": os.environ.get("SHIPROCKET_TEST_EMAIL", base64_to_text("aW5mbythcGlAcmVjYXJ2aXQuY29t")),
        "PASSWORD": os.environ.get("SHIPROCKET_TEST_PASSWORD", base64_to_text("NTBmN2VmMmM5MDU2MmU2NzdkZjgzMmU0MjYwMDRlNmE=")),
        "CHANNEL_ID": os.environ.get("SHIPROCKET_TEST_CHANNEL_ID", "1843794"),
        "WEBHOOK_TOKEN": os.environ.get("SHIPROCKET_TEST_WEBHOOK_TOKEN", ""),
    },
    "production": {
        "EMAIL": os.environ.get("SHIPROCKET_PROD_EMAIL", base64_to_text("ZGl2eWFtc2hhaDIwMjBAZ21haWwuY29t")),
        "PASSWORD": os.environ.get("SHIPROCKET_PROD_PASSWORD", base64_to_text("T0ZYZ2lHS3B1JGM1OCRld2hLT0UmciRjWkljTGNkM1o=")),
        "CHANNEL_ID": os.environ.get("SHIPROCKET_PROD_CHANNEL_ID", "1843794"),
        "WEBHOOK_TOKEN": os.environ.get("SHIPROCKET_PROD_WEBHOOK_TOKEN", ""),
    },
}
# Nickname of the pickup location preselected in the admin (as named in Shiprocket).
SHIPROCKET_DEFAULT_PICKUP_LOCATION = os.environ.get("SHIPROCKET_DEFAULT_PICKUP_LOCATION", "")

# Velocity delivery partner (to be integrated later; shown as "coming soon" in admin)
VELOCITY_API_KEY = os.environ.get("VELOCITY_API_KEY", "")

# Delivery partners admins can pick from. Set a key's value to False to hide it.
SHIPPING_PROVIDERS_ENABLED = {"shiprocket": True, "velocity": True, "manual": True}

# Parcel defaults used when a shipment doesn't override them (Shiprocket needs
# weight + dimensions; products don't store them). Weight is per unit, in kg.
SHIPPING_DEFAULT_ITEM_WEIGHT_KG = float(os.environ.get("SHIPPING_DEFAULT_ITEM_WEIGHT_KG", "0.5"))
SHIPPING_DEFAULT_PACKAGE_CM = {"length": 30, "breadth": 25, "height": 5}
# Default GST rate / HSN code sent on the Shiprocket invoice line items.
SHIPPING_DEFAULT_TAX_PERCENT = float(os.environ.get("SHIPPING_DEFAULT_TAX_PERCENT", "5"))
SHIPPING_DEFAULT_HSN = os.environ.get("SHIPPING_DEFAULT_HSN", "6204")

# How far ahead admins may schedule a pickup, and the cut-off hour (store local
# time) after which "today" is no longer offered.
SHIPPING_PICKUP_MAX_DAYS_AHEAD = 7
SHIPPING_PICKUP_CUTOFF_HOUR = 16

# Used for the "Manual" provider and printed on packing slips.
STORE_PICKUP_ADDRESS = {
    "name": os.environ.get("STORE_NAME", "Elegance"),
    "phone": os.environ.get("STORE_PHONE", ""),
    "address": os.environ.get("STORE_ADDRESS", "Set STORE_ADDRESS in environment"),
    "city": os.environ.get("STORE_CITY", ""),
    "state": os.environ.get("STORE_STATE", ""),
    "pincode": os.environ.get("STORE_PINCODE", ""),
}

# Tracking is refreshed from the courier when a customer opens their order and
# the stored data is older than this many minutes.
SHIPPING_TRACKING_STALE_MINUTES = 20

# WhatsApp number used for the return/replacement contact link
STORE_WHATSAPP_NUMBER = os.environ.get("STORE_WHATSAPP_NUMBER", "9999999999")


# Seller details printed on the GST tax invoice (override any value via environment).
STORE_INVOICE = {
    "legal_name": os.environ.get("INVOICE_LEGAL_NAME", "ELEGANCE"),
    "address": os.environ.get(
        "INVOICE_ADDRESS",
        "16, Prakash Park Society, Opp. Metro Pillar No. 188, Commerce Six Road, Navrangpura, Ahmedabad - 380009",
    ),
    "phone": os.environ.get("INVOICE_PHONE", "+91 79 2646 2588"),
    "mobile": os.environ.get("INVOICE_MOBILE", "+91 7600 82 8888"),
    "email": os.environ.get("INVOICE_EMAIL", "elegance.ec@gmail.com / elegancecollection@outlook.com"),
    "gstin": os.environ.get("INVOICE_GSTIN", "24AAEFE6941N1Z5"),
    "pan": os.environ.get("INVOICE_PAN", "AAEFE6941N"),
    "state": os.environ.get("INVOICE_STATE", "Gujarat"),
    "state_code": os.environ.get("INVOICE_STATE_CODE", "24"),
    "state_abbr": os.environ.get("INVOICE_STATE_ABBR", "GUJ"),
    "jurisdiction": os.environ.get("INVOICE_JURISDICTION", "Ahmedabad"),
}


# Tracking is refreshed from the courier when a customer opens their order and
# the stored data is older than this many minutes.
SHIPPING_TRACKING_STALE_MINUTES = 20

# WhatsApp number used for the return/replacement contact link
STORE_WHATSAPP_NUMBER = os.environ.get("STORE_WHATSAPP_NUMBER", "9999999999")

# ── Transactional email (Resend) ───────────────────────────────────────────
# Emails are skipped (and logged as "skipped") until both RESEND_API_KEY and
# RESEND_FROM_EMAIL are set. The from address must use a domain verified in Resend;
# "onboarding@resend.dev" only delivers to your own Resend account email.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", base64_to_text("cmVfTmpKNnJ2R1hfRUVNU0xIY3hhSnpEYWJEZ1VrYnpLZnVi"))
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "Elegance <onboarding@updates.sankievents.in>")
RESEND_REPLY_TO = os.environ.get("RESEND_REPLY_TO", "")
RESEND_ENABLED = os.environ.get("RESEND_ENABLED", "True") == "True"
# Send in a background thread after the DB commit so checkout / webhooks never wait on Resend.
RESEND_SEND_ASYNC = os.environ.get("RESEND_SEND_ASYNC", "False") == "True"

# Public base URL used for links and the logo inside emails (must be reachable by mail clients).
SITE_URL = os.environ.get("SITE_URL", "http://localhost:8000").rstrip("/")

# How long the invoice link in an email keeps working without signing in.
EMAIL_INVOICE_LINK_MAX_AGE_DAYS = int(os.environ.get("EMAIL_INVOICE_LINK_MAX_AGE_DAYS", "90"))
