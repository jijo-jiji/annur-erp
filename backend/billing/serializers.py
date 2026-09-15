from rest_framework import serializers
from .models import Invoice, PaymentReceipt

class InvoiceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_ic = serializers.CharField(source='student.ic_number', read_only=True)
    student_form = serializers.CharField(source='student.form_level', read_only=True)
    preferred_phone = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = '__all__'

    def get_preferred_phone(self, obj):
        if obj.student.preferred_contact == 'PARENT_2' and obj.student.parent2_phone:
            return obj.student.parent2_phone
        return obj.student.parent1_phone or obj.student.phone_number

class PaymentReceiptSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)

    class Meta:
        model = PaymentReceipt
        fields = '__all__'
