from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Custom manager for the mobile-number based User model."""

    def create_user(self, contact_number, password=None, **extra_fields):
        if not contact_number:
            raise ValueError("Contact number is required.")

        extra_fields.setdefault("role", "customer")
        user = self.model(contact_number=contact_number, **extra_fields)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save(using=self._db)
        return user

    def create_superuser(self, contact_number, password=None, **extra_fields):
        extra_fields.setdefault("role", "admin")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(contact_number, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom abstracted user model. Customers authenticate via mobile OTP,
    admins authenticate via mobile number + password (Django admin)."""

    ROLE_CHOICES = (
        ("admin", "Admin"),
        ("customer", "Customer"),
    )

    user_id = models.AutoField(primary_key=True)

    contact_number = models.CharField(max_length=15, unique=True, db_index=True)
    email = models.EmailField(blank=True, null=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="customer")

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    date_joined = models.DateTimeField(default=timezone.now)
    last_login_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "contact_number"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "userdetail_user"
        verbose_name = "User"
        verbose_name_plural = "Users"
        ordering = ["-date_joined"]

    def __str__(self):
        full_name = self.full_name
        return f"{full_name} ({self.contact_number})" if full_name else self.contact_number

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_admin(self):
        return self.role == "admin"

    @property
    def is_customer(self):
        return self.role == "customer"


class OTPVerification(models.Model):
    """Stores generated OTPs for mobile number verification.
    (No SMS gateway wired up yet — OTP is printed to console / returned in dev responses.)"""

    mobile = models.CharField(max_length=15, db_index=True)
    otp = models.CharField(max_length=6)
    is_verified = models.BooleanField(default=False)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "userdetail_otp_verification"
        verbose_name = "OTP Verification"
        verbose_name_plural = "OTP Verifications"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.mobile} - {self.otp}"

    def save(self, *args, **kwargs):
        if not self.expires_at:
            otp_expiry_minutes = getattr(settings, "OTP_EXPIRY_MINUTES", 5)
            self.expires_at = timezone.now() + timedelta(minutes=otp_expiry_minutes)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at


class Address(models.Model):
    """Saved delivery addresses for a user. A user can have multiple addresses,
    with exactly one marked as default (used for checkout pre-fill)."""

    ADDRESS_TYPE_CHOICES = (
        ("home", "Home"),
        ("work", "Work"),
        ("other", "Other"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="addresses", on_delete=models.CASCADE
    )

    full_name = models.CharField(max_length=150)
    mobile = models.CharField(max_length=15)

    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    landmark = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)
    country = models.CharField(max_length=100, default="India")

    address_type = models.CharField(max_length=10, choices=ADDRESS_TYPE_CHOICES, default="home")
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "userdetail_address"
        verbose_name = "Address"
        verbose_name_plural = "Addresses"
        ordering = ["-is_default", "-updated_at"]

    def __str__(self):
        return f"{self.full_name} - {self.address_line1}, {self.city} ({self.pincode})"

    def save(self, *args, **kwargs):
        # Ensure only one default address per user.
        if self.is_default:
            Address.objects.filter(user=self.user, is_default=True).exclude(pk=self.pk).update(
                is_default=False
            )
        super().save(*args, **kwargs)

    @property
    def full_address(self):
        parts = [
            self.address_line1,
            self.address_line2,
            self.landmark,
            self.city,
            self.state,
            self.pincode,
            self.country,
        ]
        return ", ".join([p for p in parts if p])
