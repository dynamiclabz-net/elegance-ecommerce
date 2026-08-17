from rest_framework import serializers

from .models import User, OTPVerification, Address


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "user_id", "contact_number", "email", "first_name", "last_name",
            "full_name", "role", "is_active", "date_joined", "last_login_at",
        )
        read_only_fields = ("user_id", "role", "date_joined", "last_login_at")


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = (
            "id", "user", "full_name", "mobile", "address_line1", "address_line2",
            "landmark", "city", "state", "pincode", "country", "address_type",
            "is_default", "full_address", "created_at", "updated_at",
        )
        read_only_fields = ("id", "user", "full_address", "created_at", "updated_at")
