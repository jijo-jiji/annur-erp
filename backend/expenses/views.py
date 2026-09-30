from datetime import date
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from core import numbering
from core.permissions import SUPERVISOR, MANAGEMENT, APPROVER_ROLES, get_role, display_name, require_role
from .models import Vendor, PaymentVoucher
from .serializers import VendorSerializer, PaymentVoucherSerializer

# 3-tier approval matrix (j-status.doc): who may approve each tier
TIER_APPROVERS = {
    'TIER_2': (SUPERVISOR, MANAGEMENT),
    'TIER_3': (MANAGEMENT,),
}
PENDING_STATUSES = ('PENDING_SUPERVISOR', 'PENDING_MANAGEMENT')


def tier_and_initial_status(amount):
    if amount < 500:
        return 'TIER_1', 'VERIFIED_ADMIN'
    if amount <= 3000:
        return 'TIER_2', 'PENDING_SUPERVISOR'
    return 'TIER_3', 'PENDING_MANAGEMENT'


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    write_roles = APPROVER_ROLES

class PaymentVoucherViewSet(viewsets.ModelViewSet):
    queryset = PaymentVoucher.objects.all().select_related('vendor').order_by('-date')
    serializer_class = PaymentVoucherSerializer

    def perform_create(self, serializer):
        amount = serializer.validated_data.get('amount', 0)
        d = serializer.validated_data.get('date') or date.today()
        pv_num = numbering.voucher_number(PaymentVoucher, d)
        tier, initial_status = tier_and_initial_status(amount)
        serializer.save(
            pv_number=pv_num, date=d, tier_level=tier, status=initial_status,
            prepared_by=display_name(self.request.user),
        )

    def perform_update(self, serializer):
        pv = serializer.instance
        # PIC may edit until approved; after that only Supervisor/Management
        if pv.status not in PENDING_STATUSES and get_role(self.request.user) not in APPROVER_ROLES:
            raise PermissionDenied('Baucar ini telah diproses. Hanya Supervisor/Management boleh mengubahnya.')
        new_amount = serializer.validated_data.get('amount')
        if new_amount is not None and new_amount != pv.amount:
            # A changed amount always goes back through approval for its tier
            tier, initial_status = tier_and_initial_status(new_amount)
            serializer.save(tier_level=tier, status=initial_status, approved_by='', approval_comment='')
        else:
            serializer.save()

    def _decide(self, request, approve):
        pv = self.get_object()
        if pv.status not in PENDING_STATUSES:
            return Response({'detail': 'Baucar ini tidak menunggu kelulusan.'}, status=status.HTTP_400_BAD_REQUEST)
        require_role(request, *TIER_APPROVERS[pv.tier_level])
        comment = (request.data.get('comment') or '').strip()
        if not approve and not comment:
            return Response({'detail': 'Sila nyatakan sebab penolakan.'}, status=status.HTTP_400_BAD_REQUEST)
        if approve:
            pv.status = 'APPROVED_MANAGEMENT' if get_role(request.user) == MANAGEMENT else 'APPROVED_SUPERVISOR'
        else:
            pv.status = 'REJECTED'
        pv.approved_by = display_name(request.user)
        pv.approval_comment = comment
        pv.save()
        return Response(self.get_serializer(pv).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._decide(request, approve=True)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._decide(request, approve=False)
