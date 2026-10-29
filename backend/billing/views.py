from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from datetime import date, timedelta
from django.db import transaction
from django.db.models import F
from core import numbering, pdf
from core.permissions import APPROVER_ROLES, display_name
from . import drilldown, services
from .models import Discount, Invoice, PaymentReceipt
from .serializers import DiscountSerializer, InvoiceSerializer, PaymentReceiptSerializer
from business_config.models import PricingTier, BusinessSetting

class DiscountViewSet(viewsets.ReadOnlyModelViewSet):
    """Discount types and voucher codes are changed through change requests (Supervisor asks,
    Management approves); the counter only reads them."""
    queryset = Discount.objects.all()
    serializer_class = DiscountSerializer
    write_roles = APPROVER_ROLES


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
        with transaction.atomic():  # the number is held for this invoice until it is saved
            serializer.save(
                invoice_number=numbering.invoice_number(Invoice, on), invoice_type='OTHER',
                billing_month=month.replace(day=1), registration_fee=0,
                total_payable=amount, total_paid=0, balance_due=amount, status='UNPAID',
                due_date=on + timedelta(days=7),
            )

    @action(detail=False, methods=['get'])
    def matching(self, request):
        """The invoices a dashboard figure counts, with what they add up to (see billing/drilldown.py)."""
        rows = list(drilldown.invoices_matching(request.query_params).order_by('invoice_number').values_list('invoice_number', 'total_payable', 'balance_due'))
        return Response({
            'count': len(rows), 'ids': [r[0] for r in rows],
            'billed': float(sum(r[1] for r in rows)), 'balance': float(sum(r[2] for r in rows)),
        })

    def perform_destroy(self, instance):
        if instance.payments.exists() or instance.credit_applied > 0:
            # a cancelled receipt counts too: it stays on its invoice as the record of what happened
            raise ValidationError({'detail': 'Invois yang ada resit (termasuk resit dibatalkan) atau kredit tidak boleh dipadam.'})
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
    queryset = PaymentReceipt.objects.all().select_related('invoice', 'student', 'replaces', 'replaced_by').order_by('-created_at')
    serializer_class = PaymentReceiptSerializer
    # A receipt is a financial record: it is issued once and never edited or removed in place. A wrong one is
    # corrected or cancelled through a request (kind RECEIPT in core/change_requests.py), which keeps it struck through
    http_method_names = ['get', 'post', 'head', 'options']

    @action(detail=False, methods=['get'])
    def matching(self, request):
        """The receipts a dashboard figure counts, with what they add up to (see billing/drilldown.py)."""
        rows = list(drilldown.receipts_matching(request.query_params).order_by('receipt_number').values_list('receipt_number', 'amount_paid'))
        return Response({'count': len(rows), 'ids': [r[0] for r in rows], 'total': float(sum(r[1] for r in rows))})

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        receipt = self.get_object()
        return pdf.pdf_response(pdf.receipt_pdf(receipt), f"{receipt.receipt_number}.pdf")

    def perform_create(self, serializer):
        # Anything above the invoice balance is kept as credit for the student (overpayment), see services.record_payment
        values = serializer.validated_data
        serializer.instance = services.record_payment(values['invoice'], values, display_name(self.request.user))

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
