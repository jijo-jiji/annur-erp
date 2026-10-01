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

    def validate(self, attrs):
        category = attrs.get('category', getattr(self.instance, 'category', ''))
        if category == '1_form':
            meta = attrs.get('meta_info', getattr(self.instance, 'meta_info', {})) or {}
            code = attrs.get('code', getattr(self.instance, 'code', ''))
            next_code = meta.get('next') or ''
            if next_code and next_code == code:
                raise serializers.ValidationError({'meta_info': 'Gred seterusnya tidak boleh sama dengan gred ini.'})
            if next_code and not DynamicMasterData.objects.filter(category='1_form', code=next_code).exists():
                raise serializers.ValidationError({'meta_info': f"Gred seterusnya '{next_code}' tiada dalam senarai."})
            if meta.get('level') and meta['level'] not in ('PRIMARY', 'LOWER', 'UPPER', 'Primary', 'Lower Sec', 'Upper Sec'):
                raise serializers.ValidationError({'meta_info': 'Tahap tidak sah.'})
        return attrs
