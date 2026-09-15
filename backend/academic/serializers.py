from rest_framework import serializers
from .models import Classroom, TimeSlot, ClassTimetable, ClassRescheduleLog
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
    available_seats = serializers.IntegerField(read_only=True)
    day = serializers.CharField(source='slot.day', read_only=True)
    start_time = serializers.CharField(source='slot.start_time', read_only=True)
    end_time = serializers.CharField(source='slot.end_time', read_only=True)
    period_label = serializers.CharField(source='slot.period_label', read_only=True)

    class Meta:
        model = ClassTimetable
        fields = '__all__'

class ClassRescheduleLogSerializer(serializers.ModelSerializer):
    class_code = serializers.CharField(source='timetable_class.class_code', read_only=True)
    subject_name = serializers.CharField(source='timetable_class.subject.name', read_only=True)
    teacher_name = serializers.CharField(source='timetable_class.teacher.full_name', read_only=True)

    class Meta:
        model = ClassRescheduleLog
        fields = '__all__'
