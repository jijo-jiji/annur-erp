from rest_framework import serializers
from .models import Student, StudentExamResult, Lead, LeadActivity, StudentEvent, ClassWaitlist, StudentFeedback
from academic.serializers import ClassTimetableSerializer
from core import grades


class StudentSerializer(serializers.ModelSerializer):
    standing_discount_name = serializers.SerializerMethodField()
    student_id = serializers.CharField(read_only=True)
    join_date = serializers.DateField(required=False)
    enrolled_classes_details = ClassTimetableSerializer(source='enrolled_classes', many=True, read_only=True)
    waiting_for = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = '__all__'
        # Status and classes change only through the lifecycle actions (approve, enroll, drop, hold, ...)
        read_only_fields = (
            'status', 'registration_comment', 'registration_decided_by', 'on_hold_until', 'left_date',
            'credit_balance', 'enrolled_classes',
        )

    def validate_form_level(self, value):
        return grades.validate(value)

    def get_standing_discount_name(self, obj):
        return str(obj.standing_discount) if obj.standing_discount_id else None

    def get_waiting_for(self, obj):
        return [
            {'id': w.id, 'class_id': w.timetable_class_id, 'class_code': w.timetable_class.class_code}
            for w in obj.waitlist_entries.all() if w.status == 'WAITING'
        ]


class StudentExamResultSerializer(serializers.ModelSerializer):
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)

    class Meta:
        model = StudentExamResult
        fields = '__all__'


class StudentEventSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_code = serializers.CharField(source='student.student_id', read_only=True)
    student_form = serializers.CharField(source='student.form_level', read_only=True)
    event_label = serializers.CharField(source='get_event_type_display', read_only=True)

    class Meta:
        model = StudentEvent
        fields = '__all__'


class ClassWaitlistSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_code = serializers.CharField(source='student.student_id', read_only=True)
    student_status = serializers.CharField(source='student.status', read_only=True)
    class_code = serializers.CharField(source='timetable_class.class_code', read_only=True)

    class Meta:
        model = ClassWaitlist
        fields = '__all__'


class StudentFeedbackSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_code = serializers.CharField(source='student.student_id', read_only=True)
    form_level = serializers.CharField(source='student.form_level', read_only=True)
    given_by_label = serializers.CharField(source='get_given_by_display', read_only=True)
    media = serializers.SerializerMethodField()

    class Meta:
        model = StudentFeedback
        fields = '__all__'
        read_only_fields = ('recorded_by',)

    def get_media(self, obj):
        from core.attachments import AttachmentSerializer
        from core.models import Attachment
        return AttachmentSerializer(Attachment.objects.filter(kind='FEEDBACK', object_id=obj.pk), many=True).data


class LeadActivitySerializer(serializers.ModelSerializer):
    stage_label = serializers.CharField(source='get_stage_display', read_only=True)
    outcome_label = serializers.CharField(source='get_outcome_display', read_only=True)

    class Meta:
        model = LeadActivity
        fields = '__all__'
        read_only_fields = ['lead', 'stage', 'from_stage', 'pic', 'created_at']


class LeadSerializer(serializers.ModelSerializer):
    lead_id = serializers.CharField(read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    reached_stage = serializers.CharField(read_only=True)
    activity_count = serializers.SerializerMethodField()
    converted_student_code = serializers.CharField(source='converted_student.student_id', read_only=True, default=None)

    class Meta:
        model = Lead
        fields = '__all__'
        # Stage changes go through the move / lost / convert actions so each one is logged
        read_only_fields = ['stage_changed_at', 'lost_at_stage', 'lost_reason', 'next_follow_up', 'converted_student']

    def validate_form_level(self, value):
        return grades.validate(value)

    def get_activity_count(self, obj):
        annotated = getattr(obj, 'activity_total', None)
        return annotated if annotated is not None else obj.activities.count()

    def validate_status(self, value):
        from .leads import MOVABLE_STAGES
        if self.instance is not None and value != self.instance.status:
            raise serializers.ValidationError('Gunakan butang tukar peringkat untuk mengubah peringkat.')
        if self.instance is None and value not in MOVABLE_STAGES:
            raise serializers.ValidationError('Lead baharu mesti bermula sebelum peringkat Registered.')
        return value
