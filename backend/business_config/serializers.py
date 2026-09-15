from rest_framework import serializers
from .models import SubjectMaster, PricingTier, BusinessSetting, TeacherRateSetting

class SubjectMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubjectMaster
        fields = '__all__'

class PricingTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingTier
        fields = '__all__'

class BusinessSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessSetting
        fields = '__all__'

class TeacherRateSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherRateSetting
        fields = '__all__'
