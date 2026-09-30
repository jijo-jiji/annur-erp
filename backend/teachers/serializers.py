from rest_framework import serializers
from .models import (
    Teacher, TeacherAttendance, TeacherComplaint, TeacherRateIncrement, TeacherPayment,
    StaffMember, StaffAttendance, LeaveRequest, StaffHistory, StaffRecord, StaffKPI
)
from business_config.serializers import SubjectMasterSerializer
from core.permissions import ADMIN, get_role

class TeacherSerializer(serializers.ModelSerializer):
    subjects_qualified_details = SubjectMasterSerializer(source='subjects_qualified', many=True, read_only=True)
    class Meta:
        model = Teacher
        fields = '__all__'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # j-status.doc: Admin sees the teacher list without rates
        request = self.context.get('request')
        if request and get_role(request.user) == ADMIN:
            data.pop('rate_per_session', None)
        return data

class TeacherAttendanceSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    teacher_code = serializers.CharField(source='teacher.teacher_code', read_only=True)
    replacement_name = serializers.CharField(source='replacement_teacher.full_name', read_only=True, default=None)
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = TeacherAttendance
        fields = '__all__'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and get_role(request.user) == ADMIN:  # pay is hidden from Admin
            data.pop('allowance_earned', None)
        return data


class TeacherPaymentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    teacher_code = serializers.CharField(source='teacher.teacher_code', read_only=True)
    teacher_type = serializers.CharField(source='teacher.teacher_type', read_only=True)
    teacher_phone = serializers.CharField(source='teacher.phone_number', read_only=True)
    bank_name = serializers.CharField(source='teacher.bank_name', read_only=True)
    bank_account = serializers.CharField(source='teacher.bank_account', read_only=True)
    rate_per_session = serializers.DecimalField(source='teacher.rate_per_session', max_digits=8, decimal_places=2, read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    payment_method_label = serializers.CharField(source='get_payment_method_display', read_only=True)

    class Meta:
        model = TeacherPayment
        fields = '__all__'

class TeacherComplaintSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    teacher_code = serializers.CharField(source='teacher.teacher_code', read_only=True)

    class Meta:
        model = TeacherComplaint
        fields = '__all__'
        read_only_fields = ('recorded_by',)

class TeacherRateIncrementSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    teacher_code = serializers.CharField(source='teacher.teacher_code', read_only=True)

    class Meta:
        model = TeacherRateIncrement
        fields = '__all__'
        # previous_rate is copied from the teacher; decisions go through approve/reject
        read_only_fields = ('previous_rate', 'status', 'proposed_by', 'decided_by', 'decision_comment')

class StaffMemberSerializer(serializers.ModelSerializer):
    staff_id = serializers.CharField(read_only=True)
    leave_balances = serializers.SerializerMethodField()
    username = serializers.CharField(source='user.username', read_only=True, default=None)
    marital_status_label = serializers.CharField(source='get_marital_status_display', read_only=True)
    employment_type_label = serializers.CharField(source='get_employment_type_display', read_only=True)

    class Meta:
        model = StaffMember
        fields = '__all__'

    def get_leave_balances(self, obj):
        from .staff import leave_balances
        return leave_balances(obj)


class StaffHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffHistory
        fields = '__all__'
        read_only_fields = ('staff', 'recorded_by')


class StaffRecordSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.name', read_only=True)

    class Meta:
        model = StaffRecord
        fields = '__all__'
        read_only_fields = ('recorded_by',)


class StaffKPISerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.name', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = StaffKPI
        fields = '__all__'
        # Review happens through the review action
        read_only_fields = ('achieved', 'score', 'status', 'set_by', 'reviewed_by', 'review_comment', 'reviewed_at')

    def validate_weight(self, value):
        if value > 100:
            raise serializers.ValidationError('Pemberat maksimum 100%.')
        return value


class StaffAttendanceSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.name', read_only=True)
    late_minutes = serializers.IntegerField(read_only=True)
    early_minutes = serializers.IntegerField(read_only=True)
    worked_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = StaffAttendance
        fields = '__all__'


class LeaveRequestSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.name', read_only=True)
    staff_role = serializers.CharField(source='staff.role', read_only=True)
    leave_id = serializers.CharField(read_only=True)
    staff = serializers.PrimaryKeyRelatedField(queryset=StaffMember.objects.all())

    class Meta:
        model = LeaveRequest
        fields = '__all__'
        # Status changes only through the approve/reject actions; days are counted by the server
        read_only_fields = ('status', 'supervisor_remark', 'days_count')

    def validate(self, attrs):
        if attrs['end_date'] < attrs['start_date']:
            raise serializers.ValidationError({'end_date': 'Tarikh akhir mesti selepas tarikh mula.'})
        return attrs

