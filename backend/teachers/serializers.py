from rest_framework import serializers
from .models import Teacher, TeacherAttendance
from business_config.serializers import SubjectMasterSerializer

class TeacherSerializer(serializers.ModelSerializer):
    subjects_qualified_details = SubjectMasterSerializer(source='subjects_qualified', many=True, read_only=True)
    class Meta:
        model = Teacher
        fields = '__all__'

class TeacherAttendanceSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    teacher_code = serializers.CharField(source='teacher.teacher_code', read_only=True)
    class Meta:
        model = TeacherAttendance
        fields = '__all__'
