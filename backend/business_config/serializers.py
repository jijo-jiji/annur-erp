from rest_framework import serializers
from .models import SubjectMaster, PricingTier, BusinessSetting, TeacherRateSetting, DynamicMasterData

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

class DynamicMasterDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = DynamicMasterData
        fields = '__all__'
        # Approval fields change only through the approve/reject actions
        read_only_fields = ('status', 'created_by', 'approved_by', 'rejection_reason', 'is_locked')
