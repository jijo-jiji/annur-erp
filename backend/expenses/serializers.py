from rest_framework import serializers
from .models import Vendor, PaymentVoucher

class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'

class PaymentVoucherSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.vendor_name', read_only=True)
    vendor_tin = serializers.CharField(source='vendor.tin_number', read_only=True)
    vendor_bank = serializers.SerializerMethodField()
    pv_number = serializers.CharField(read_only=True)
    date = serializers.DateField(required=False)

    class Meta:
        model = PaymentVoucher
        fields = '__all__'
        # Set by the server: tier from amount, status/approver through approve/reject actions
        read_only_fields = ('tier_level', 'status', 'prepared_by', 'approved_by', 'approval_comment')

    def get_vendor_bank(self, obj):
        if obj.vendor and obj.vendor.bank_name:
            return f"{obj.vendor.bank_name} {obj.vendor.bank_account}".strip()
        return '-'
