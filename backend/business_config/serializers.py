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
        extra_kwargs = {'total_price': {'required': False}}

    def validate(self, attrs):
        get = lambda k, d=None: attrs.get(k, getattr(self.instance, k, d))
        group = str(get('level_category', '') or '').strip().upper().replace(' ', '_')
        if not group:
            raise serializers.ValidationError({'level_category': 'Kumpulan pakej diperlukan.'})
        attrs['level_category'] = group
        count, rate = get('subject_count', 0), get('price_per_subject', 0)
        if count < 1:
            raise serializers.ValidationError({'subject_count': 'Bilangan subjek mesti sekurang-kurangnya 1.'})
        if rate < 0:
            raise serializers.ValidationError({'price_per_subject': 'Kadar tidak boleh negatif.'})
        clash = PricingTier.objects.filter(level_category=group, subject_count=count)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({'subject_count': 'Pakej untuk bilangan subjek ini sudah wujud dalam kumpulan ini.'})
        attrs['total_price'] = rate * count  # the package total always follows the per-subject rate
        return attrs

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
