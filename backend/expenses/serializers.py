from rest_framework import serializers
from .models import Vendor, PaymentVoucher

class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'

class PaymentVoucherSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.vendor_name', read_only=True)
    class Meta:
        model = PaymentVoucher
        fields = '__all__'
