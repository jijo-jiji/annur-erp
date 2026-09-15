from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from datetime import date
from .models import Invoice, PaymentReceipt
from .serializers import InvoiceSerializer, PaymentReceiptSerializer
from business_config.models import PricingTier, BusinessSetting

class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.all().select_related('student').order_by('-created_at')
    serializer_class = InvoiceSerializer

class PaymentReceiptViewSet(viewsets.ModelViewSet):
    queryset = PaymentReceipt.objects.all().select_related('invoice', 'student').order_by('-created_at')
    serializer_class = PaymentReceiptSerializer

    def perform_create(self, serializer):
        last_rec = PaymentReceipt.objects.order_by('-id').first()
        next_num = (last_rec.id + 1) if last_rec else 1
        rec_number = f"REC-2026-{next_num:04d}"
        receipt = serializer.save(receipt_number=rec_number)

        # Update invoice balance
        inv = receipt.invoice
        inv.total_paid += receipt.amount_paid
        inv.balance_due = max(0, inv.total_payable - inv.total_paid)
        if inv.balance_due == 0:
            inv.status = 'PAID'
        else:
            inv.status = 'PARTIAL'
        inv.save()

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
