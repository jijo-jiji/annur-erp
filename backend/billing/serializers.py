from datetime import date
from rest_framework import serializers
from .models import Discount, Invoice, PaymentReceipt
from . import services


class DiscountSerializer(serializers.ModelSerializer):
    mode_label = serializers.CharField(source='get_mode_display', read_only=True)

    class Meta:
        model = Discount
        fields = '__all__'
        read_only_fields = ['used_count', 'created_by', 'created_at']

    def validate_code(self, value):
        return value.strip().upper()

    def validate(self, attrs):
        mode = attrs.get('mode', getattr(self.instance, 'mode', 'FIXED'))
        value = attrs.get('value', getattr(self.instance, 'value', 0))
        if value <= 0 or (mode == 'PERCENT' and value > 100):
            raise serializers.ValidationError({'value': 'Nilai diskaun mesti lebih 0 (peratus maksimum 100).'})
        start = attrs.get('valid_from', getattr(self.instance, 'valid_from', None))
        end = attrs.get('valid_until', getattr(self.instance, 'valid_until', None))
        if start and end and end < start:
            raise serializers.ValidationError({'valid_until': 'Tarikh tamat mesti selepas tarikh mula.'})
        return attrs

class InvoiceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_ic = serializers.CharField(source='student.ic_number', read_only=True)
    student_form = serializers.CharField(source='student.form_level', read_only=True)
    student_code = serializers.CharField(source='student.student_id', read_only=True)
    student_type = serializers.CharField(source='student.student_type', read_only=True)
    student_credit = serializers.DecimalField(source='student.credit_balance', max_digits=8, decimal_places=2, read_only=True)
    parent_name = serializers.CharField(source='student.parent1_name', read_only=True)
    preferred_phone = serializers.SerializerMethodField()
    latest_receipt = serializers.SerializerMethodField()
    correction_pending = serializers.SerializerMethodField()
    follow_up_week = serializers.SerializerMethodField()
    invoice_type_label = serializers.CharField(source='get_invoice_type_display', read_only=True)

    class Meta:
        model = Invoice
        fields = '__all__'
        # Amounts only change through payments, discounts and credit so the ledger stays consistent
        read_only_fields = [
            'invoice_number', 'registration_fee', 'discount_amount', 'discount_remarks', 'discount',
            'total_payable', 'total_paid', 'balance_due', 'status', 'credit_applied',
            'reminder_count', 'last_reminder_at', 'invoice_type', 'due_date',
        ]
        extra_kwargs = {'billing_month': {'required': False}}

    def get_follow_up_week(self, obj):
        return services.follow_up_week(obj) if obj.status != 'PAID' else None

    def get_preferred_phone(self, obj):
        if not obj.student:
            return ''
        if obj.student.preferred_contact == 'PARENT_2' and obj.student.parent2_phone:
            return obj.student.parent2_phone
        return obj.student.parent1_phone or obj.student.phone_number

    def get_latest_receipt(self, obj):
        valid = [p for p in obj.payments.all() if p.status == 'VALID']  # cancelled receipts no longer count
        return max(valid, key=lambda p: p.created_at).receipt_number if valid else None

    def get_correction_pending(self, obj):
        return obj.pk in pending_corrections(self.root, 'INVOICE')


def pending_corrections(root, kind):
    """Ids of the records of `kind` with a correction waiting for approval, worked out once per response."""
    cache = root.__dict__.setdefault('_pending_corrections', {})
    if kind not in cache:
        from core.models import ChangeRequest
        cache[kind] = set(ChangeRequest.objects.filter(kind=kind, status='PENDING').values_list('target_id', flat=True))
    return cache[kind]


class PaymentReceiptSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    receipt_number = serializers.CharField(read_only=True)
    student = serializers.PrimaryKeyRelatedField(read_only=True)
    overpaid_amount = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    received_by = serializers.CharField(read_only=True)
    payment_date = serializers.DateField(required=False)
    replaces_number = serializers.CharField(source='replaces.receipt_number', read_only=True, default=None)
    replaced_by_number = serializers.SerializerMethodField()
    correction_pending = serializers.SerializerMethodField()

    class Meta:
        model = PaymentReceipt
        fields = '__all__'
        read_only_fields = ['status', 'cancel_reason', 'cancelled_by', 'cancelled_at', 'replaces', 'whatsapp_sent']

    def get_replaced_by_number(self, obj):
        replacement = getattr(obj, 'replaced_by', None)
        return replacement.receipt_number if replacement else None

    def get_correction_pending(self, obj):
        return obj.pk in pending_corrections(self.root, 'RECEIPT')

    def validate_amount_paid(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amaun mesti lebih daripada 0.')
        return value

    def validate_payment_date(self, value):
        if value and value > date.today():
            raise serializers.ValidationError('Tarikh bayaran tidak boleh selepas hari ini.')
        return value


class ReceiptCorrectionSerializer(serializers.ModelSerializer):
    """The details a receipt correction may change (core/change_requests.py ReceiptHandler)."""
    payment_month = serializers.DateField(required=False, allow_null=True, input_formats=['%Y-%m-%d', '%Y-%m'])  # a month box gives YYYY-MM

    class Meta:
        model = PaymentReceipt
        fields = ['payment_date', 'amount_paid', 'payment_method', 'reference_number', 'payment_type', 'payment_month', 'notes']

    def validate_amount_paid(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amaun mesti lebih daripada 0.')
        return value

    def validate_payment_date(self, value):
        if value > date.today():
            raise serializers.ValidationError('Tarikh bayaran tidak boleh selepas hari ini.')
        return value
