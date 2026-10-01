from rest_framework import serializers
from core import grades
from .models import TimetableChange, Classroom, TimeSlot, ClassTimetable, ClassRescheduleLog, LessonHandout
from business_config.serializers import SubjectMasterSerializer
from teachers.serializers import TeacherSerializer

class ClassroomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Classroom
        fields = '__all__'

class TimeSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeSlot
        fields = '__all__'

class ClassTimetableSerializer(serializers.ModelSerializer):
    subject_details = SubjectMasterSerializer(source='subject', read_only=True)
    teacher_details = TeacherSerializer(source='teacher', read_only=True)
    classroom_name = serializers.CharField(source='classroom.name', read_only=True)
    class_code = serializers.CharField(read_only=True)
    current_enrolled = serializers.IntegerField(source='enrolled_count', read_only=True)
    available_seats = serializers.IntegerField(read_only=True)
    day = serializers.CharField(source='slot.day', read_only=True)
    start_time = serializers.CharField(source='slot.start_time', read_only=True)
    end_time = serializers.CharField(source='slot.end_time', read_only=True)
    period_label = serializers.CharField(source='slot.period_label', read_only=True)

    class Meta:
        model = ClassTimetable
        fields = '__all__'

    def validate_form_level(self, value):
        return grades.validate(value)

class TimetableChangeSerializer(serializers.ModelSerializer):
    action_label = serializers.CharField(source='get_action_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = TimetableChange
        fields = '__all__'


class ClassRescheduleLogSerializer(serializers.ModelSerializer):
    class_code = serializers.CharField(source='timetable_class.class_code', read_only=True)
    subject_name = serializers.CharField(source='timetable_class.subject.name', read_only=True)
    teacher_name = serializers.CharField(source='timetable_class.teacher.full_name', read_only=True)
    form_level = serializers.CharField(source='timetable_class.form_level', read_only=True)

    class Meta:
        model = ClassRescheduleLog
        fields = '__all__'
        # Decisions go through the approve / reject / verify actions
        read_only_fields = ('status', 'supervisor_approved', 'decided_by', 'decision_comment',
                            'verified_by', 'verified_at', 'recorded_by')

class LessonHandoutSerializer(serializers.ModelSerializer):
    handout_id = serializers.CharField(read_only=True)
    # The uploaded file, if any (older records only have a file name)
    file = serializers.SerializerMethodField()

    class Meta:
        model = LessonHandout
        fields = '__all__'
        read_only_fields = ('file_name', 'file_size', 'file_type')

    def get_file(self, obj):
        from core.attachments import AttachmentSerializer
        from core.models import Attachment
        att = Attachment.objects.filter(kind='HANDOUT', object_id=obj.pk).first()
        return AttachmentSerializer(att).data if att else None

