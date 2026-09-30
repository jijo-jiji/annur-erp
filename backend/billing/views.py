from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from datetime import date, timedelta
from decimal import Decimal
from django.db import transaction
from django.db.models import F
from core import numbering
from core.permissions import APPROVER_ROLES, display_name
from . import services
from .models import Discount, Invoice, PaymentReceipt
from .serializers import DiscountSerializer, InvoiceSerializer, PaymentReceiptSerializer
from business_config.models import PricingTier, BusinessSetting

class DiscountViewSet(viewsets.ModelViewSet):
    """Discount types and voucher codes: set by Supervisor / Management, used by the counter."""
    queryset = Discount.objects.all()
    serializer_class = DiscountSerializer
    write_roles = APPROVER_ROLES

    def perform_create(self, serializer):
        serializer.save(created_by=display_name(self.request.user))

    def perform_destroy(self, instance):
        # A discount that was used stays for the record; switch it off instead
        if instance.used_count or instance.invoices.exists() or instance.students.exists():
            raise ValidationError({'detail': 'Diskaun ini telah digunakan. Nyahaktifkan sahaja.'})
        instance.delete()


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.all().select_related('student').prefetch_related('payments').order_by('-created_at')
    serializer_class = InvoiceSerializer
    # Invoices come from registration approval, the monthly run, or as an "other" invoice below
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def list(self, request, *args, **kwargs):
        services.mark_overdue()
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        # Other charges such as seminars: one amount, no registration fee
        amount = serializer.validated_data.get('monthly_fee')
        description = (serializer.validated_data.get('description') or '').strip()
        if not amount or amount <= 0 or not description:
            raise ValidationError({'detail': 'Invois lain memerlukan keterangan dan jumlah.'})
        on = date.today()
        month = serializer.validated_data.get('billing_month') or on
        serializer.save(
            invoice_number=numbering.invoice_number(Invoice, on), invoice_type='OTHER',
            billing_month=month.replace(day=1), registration_fee=0,
            total_payable=amount, total_paid=0, balance_due=amount, status='UNPAID',
            due_date=on + timedelta(days=7),
        )

    def perform_destroy(self, instance):
        if instance.payments.exists() or instance.credit_applied > 0:
            raise ValidationError({'detail': 'Invois yang telah dibayar tidak boleh dipadam.'})
        if instance.discount_id:
            Discount.objects.filter(pk=instance.discount_id, used_count__gt=0).update(used_count=F('used_count') - 1)
        instance.delete()

    @action(detail=False, methods=['post'])
    def monthly_run(self, request):
        dry_run = str(request.data.get('dry_run', 'true')).lower() not in ('false', '0', 'no')
        return Response(services.monthly_run(request.data.get('month') or date.today(), dry_run=dry_run))

    @action(detail=True, methods=['post'])
    def apply_discount(self, request, pk=None):
        invoice = services.apply_discount(self.get_object(), request.data.get('code'))
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=['post'])
    def apply_credit(self, request, pk=None):
        invoice = services.apply_credit(self.get_object())
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=['post'])
    def remind(self, request, pk=None):
        """Record that a WhatsApp payment reminder was sent (staff send the message themselves)."""
        invoice = self.get_object()
        invoice.reminder_count += 1
        invoice.last_reminder_at = date.today()
        invoice.save(update_fields=['reminder_count', 'last_reminder_at'])
        return Response(self.get_serializer(invoice).data)

class PaymentReceiptViewSet(viewsets.ModelViewSet):
    queryset = PaymentReceipt.objects.all().select_related('invoice', 'student').order_by('-created_at')
    serializer_class = PaymentReceiptSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        invoice = serializer.validated_data['invoice']
        student = invoice.student
        payment_date = serializer.validated_data.get('payment_date') or date.today()
        amount = Decimal(serializer.validated_data['amount_paid'])

        # Anything above the invoice balance is kept as credit for the student (overpayment)
        overpaid = max(Decimal('0'), amount - invoice.balance_due)
        receipt = serializer.save(
            student=student, payment_date=payment_date, overpaid_amount=overpaid,
            receipt_number=numbering.receipt_number(PaymentReceipt, payment_date),
            received_by=display_name(self.request.user),
        )

        invoice.total_paid += amount - overpaid
        invoice.balance_due = max(Decimal('0'), invoice.total_payable - invoice.total_paid)
        services.settle_status(invoice)
        invoice.save()
        if overpaid:
            student.credit_balance += overpaid
            student.save(update_fields=['credit_balance'])

@api_view(['POST'])
def calculate_fees(request):
    """Dynamic pricing calculator engine based on Management Pricing Tiers"""
    level_category = request.data.get('level_category', 'SECONDARY')
    subject_count = int(request.data.get('subject_count', 4))
    is_new_student = request.data.get('is_new_student', True)

    reg_fee_setting = BusinessSetting.objects.filter(key='REGISTRATION_FEE').first()
    reg_fee = float(reg_fee_setting.value) if (reg_fee_setting and is_new_student) else 0.00

    tier = PricingTier.objects.filter(level_category=level_category, subject_count=subject_count).first()
    if tier:
        monthly_fee = float(tier.total_price)
        price_per_subject = float(tier.price_per_subject)
    else:
        # Fallback secondary default logic
        if level_category == 'SECONDARY':
            pps = 60.0 if subject_count == 4 else (55.0 if subject_count in [5, 6] else 50.0)
            monthly_fee = pps * subject_count
            price_per_subject = pps
        elif level_category == 'DARJAH_5':
            monthly_fee = 100.0
            price_per_subject = 50.0
        elif level_category == 'DARJAH_6':
            monthly_fee = 200.0
            price_per_subject = 50.0
        else:
            monthly_fee = 25.0 * subject_count
            price_per_subject = 25.0

    total_payable = monthly_fee + reg_fee

    return Response({
        'level_category': level_category,
        'subject_count': subject_count,
        'price_per_subject': price_per_subject,
        'monthly_fee': monthly_fee,
        'registration_fee': reg_fee,
        'total_payable': total_payable
    })
