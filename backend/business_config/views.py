from core import grades
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from core.permissions import (
    SUPERVISOR, MANAGEMENT, APPROVER_ROLES, get_role, display_name, require_role
)
from .models import SubjectMaster, PricingTier, BusinessSetting, TeacherRateSetting, DynamicMasterData
from .serializers import (
    SubjectMasterSerializer, PricingTierSerializer, BusinessSettingSerializer,
    TeacherRateSettingSerializer, DynamicMasterDataSerializer
)

class SubjectMasterViewSet(viewsets.ReadOnlyModelViewSet):
    """Subjects are changed through change requests (core.change_requests), never written here."""
    queryset = SubjectMaster.objects.all().order_by('level_category', 'code')
    serializer_class = SubjectMasterSerializer

class PricingTierViewSet(viewsets.ReadOnlyModelViewSet):
    """Fee packages change through change requests (Supervisor asks, Management approves), never here."""
    queryset = PricingTier.objects.all()
    serializer_class = PricingTierSerializer
    write_roles = APPROVER_ROLES

class BusinessSettingViewSet(viewsets.ModelViewSet):
    queryset = BusinessSetting.objects.all()
    serializer_class = BusinessSettingSerializer
    write_roles = (MANAGEMENT,)

    # The centre's own details are checked and recorded by Tetapan > Pusat, not edited here
    def _not_centre(self, key):
        if str(key).startswith('CENTER_'):
            raise PermissionDenied('Maklumat pusat diubah di Tetapan > Pusat.')

    def perform_create(self, serializer):
        self._not_centre(serializer.validated_data.get('key'))
        serializer.save()

    def perform_update(self, serializer):
        self._not_centre(serializer.instance.key)
        serializer.save()

class TeacherRateSettingViewSet(viewsets.ModelViewSet):
    queryset = TeacherRateSetting.objects.all()
    serializer_class = TeacherRateSettingSerializer
    write_roles = (MANAGEMENT,)

# Lists that change only through change requests (Supervisor asks, Management approves)
REQUEST_ONLY_LISTS = ('18_expense_cat', '19_expense_subcat')


def _not_for_request_only(category):
    if category in REQUEST_ONLY_LISTS:
        raise PermissionDenied('Kategori perbelanjaan diubah melalui permohonan perubahan di Baucar bayaran > Kategori.')


class DynamicMasterDataViewSet(viewsets.ModelViewSet):
    queryset = DynamicMasterData.objects.all().order_by('category', 'code')
    serializer_class = DynamicMasterDataSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        category = self.request.query_params.get('category')
        status_param = self.request.query_params.get('status')
        if category:
            queryset = queryset.filter(category=category)
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset

    def perform_create(self, serializer):
        _not_for_request_only(serializer.validated_data.get('category'))
        # Admin proposals wait for approval; Supervisor/Management entries are approved immediately
        user = self.request.user
        if get_role(user) in APPROVER_ROLES:
            serializer.save(status='APPROVED', created_by=display_name(user), approved_by=display_name(user), is_locked=True)
        else:
            serializer.save(status='PENDING', created_by=display_name(user), is_locked=False)

    def perform_destroy(self, instance):
        _not_for_request_only(instance.category)
        instance.delete()

    def perform_update(self, serializer):
        _not_for_request_only(serializer.instance.category)
        # PIC may edit until approved; once locked only Supervisor/Management may change it
        if serializer.instance.is_locked and get_role(self.request.user) not in APPROVER_ROLES:
            raise PermissionDenied('Data ini telah diluluskan. Hanya Supervisor/Management boleh mengubahnya.')
        serializer.save()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        master_item = self.get_object()
        _not_for_request_only(master_item.category)
        master_item.status = 'APPROVED'
        master_item.approved_by = display_name(request.user)
        master_item.rejection_reason = ''
        master_item.is_locked = True
        master_item.save()
        return Response(self.get_serializer(master_item).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        master_item = self.get_object()
        _not_for_request_only(master_item.category)
        reason = request.data.get('rejection_reason', 'Ditolak oleh pihak pengurusan / supervisor.')
        master_item.status = 'REJECTED'
        master_item.approved_by = display_name(request.user)
        master_item.rejection_reason = reason
        master_item.save()
        return Response(self.get_serializer(master_item).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def grade_list(request):
    """Approved grades in order, with next grade and description (all roles)."""
    return Response(grades.grade_list())
