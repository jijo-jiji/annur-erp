from rest_framework import viewsets
from .models import SubjectMaster, PricingTier, BusinessSetting, TeacherRateSetting
from .serializers import SubjectMasterSerializer, PricingTierSerializer, BusinessSettingSerializer, TeacherRateSettingSerializer

class SubjectMasterViewSet(viewsets.ModelViewSet):
    queryset = SubjectMaster.objects.all().order_by('level_category', 'code')
    serializer_class = SubjectMasterSerializer

class PricingTierViewSet(viewsets.ModelViewSet):
    queryset = PricingTier.objects.all()
    serializer_class = PricingTierSerializer

class BusinessSettingViewSet(viewsets.ModelViewSet):
    queryset = BusinessSetting.objects.all()
    serializer_class = BusinessSettingSerializer

class TeacherRateSettingViewSet(viewsets.ModelViewSet):
    queryset = TeacherRateSetting.objects.all()
    serializer_class = TeacherRateSettingSerializer
