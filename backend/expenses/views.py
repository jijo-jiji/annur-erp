from rest_framework import viewsets
from .models import Vendor, PaymentVoucher
from .serializers import VendorSerializer, PaymentVoucherSerializer

class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer

class PaymentVoucherViewSet(viewsets.ModelViewSet):
    queryset = PaymentVoucher.objects.all().select_related('vendor').order_by('-date')
    serializer_class = PaymentVoucherSerializer

    def perform_create(self, serializer):
        last_pv = PaymentVoucher.objects.order_by('-id').first()
        next_num = (last_pv.id + 1) if last_pv else 1
        pv_num = f"PV26-{next_num:04d}"
        amount = serializer.validated_data.get('amount', 0)
        
        # Tier automation
        if amount < 500:
            tier = 'TIER_1'
            status = 'VERIFIED_ADMIN'
        elif amount <= 3000:
            tier = 'TIER_2'
            status = 'APPROVED_SUPERVISOR'
        else:
            tier = 'TIER_3'
            status = 'APPROVED_MANAGEMENT'

        serializer.save(pv_number=pv_num, tier_level=tier, status=status)
