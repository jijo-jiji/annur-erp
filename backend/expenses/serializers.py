from rest_framework import serializers
from core.phone import PhoneFieldsMixin
from .models import Vendor, PaymentVoucher

class VendorSerializer(PhoneFieldsMixin, serializers.ModelSerializer):
    phone_fields = ('phone_number',)

    class Meta:
        model = Vendor
        fields = '__all__'

    def validate_status(self, value):
        if value not in ('ACTIVE', 'INACTIVE'):
            raise serializers.ValidationError('Status mesti Aktif atau Tidak aktif.')
        return value

    def validate_supply_type(self, value):
        from business_config.models import DynamicMasterData
        if value and not DynamicMasterData.objects.filter(category='25_supply_type', code=value, status='APPROVED').exists():
            raise serializers.ValidationError('Jenis bekalan ini tidak dijumpai.')
        return value or ''

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
        # validate() needs a category code or label and fills in the other
        extra_kwargs = {'category': {'required': False}}

    def validate(self, attrs):
        """The category and subcategory come from master data (18_expense_cat / 19_expense_subcat): the codes are
        checked and stored with the labels, and a subcategory must belong to its category. A label that is not in
        the lists is still accepted as typed (older records, categories retired since)."""
        if not ({'category', 'category_code', 'subcategory', 'subcategory_code'} & set(attrs)):
            return attrs
        from business_config.models import DynamicMasterData
        lists = DynamicMasterData.objects.filter(status='APPROVED')
        current = lambda f: attrs.get(f, getattr(self.instance, f, '') if self.instance else '') or ''

        cat_code, cat_label = current('category_code').strip(), current('category').strip()
        cat = None
        if cat_code:
            cat = lists.filter(category='18_expense_cat', code=cat_code).first()
            if not cat:
                raise serializers.ValidationError({'category': 'Kategori perbelanjaan ini tidak dijumpai.'})
        elif cat_label:
            cat = lists.filter(category='18_expense_cat', label=cat_label).first()
        if cat:
            attrs['category'], attrs['category_code'] = cat.label, cat.code
        elif not cat_label:
            raise serializers.ValidationError({'category': 'Sila pilih kategori perbelanjaan.'})
        else:
            attrs['category_code'] = ''

        sub_code, sub_label = current('subcategory_code').strip(), current('subcategory').strip()
        sub = None
        if sub_code:
            sub = lists.filter(category='19_expense_subcat', code=sub_code).first()
            if not sub:
                raise serializers.ValidationError({'subcategory': 'Subkategori ini tidak dijumpai.'})
        elif sub_label:
            sub = lists.filter(category='19_expense_subcat', label=sub_label).first()
        if sub and cat and (sub.meta_info or {}).get('cat') != cat.code:
            raise serializers.ValidationError({'subcategory': f'Subkategori ini bukan di bawah kategori {cat.label}.'})
        if sub:
            attrs['subcategory'], attrs['subcategory_code'] = sub.label, sub.code
        else:
            attrs['subcategory_code'] = ''
            if not sub_label and cat and lists.filter(category='19_expense_subcat', meta_info__cat=cat.code).exists():
                raise serializers.ValidationError({'subcategory': 'Sila pilih subkategori bagi kategori ini.'})
        return attrs

    def get_vendor_bank(self, obj):
        if obj.vendor and obj.vendor.bank_name:
            return f"{obj.vendor.bank_name} {obj.vendor.bank_account}".strip()
        return '-'
