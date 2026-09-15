from rest_framework import serializers
from .models import Student, StudentExamResult
from academic.serializers import ClassTimetableSerializer

class StudentSerializer(serializers.ModelSerializer):
    enrolled_classes_details = ClassTimetableSerializer(source='enrolled_classes', many=True, read_only=True)

    class Meta:
        model = Student
        fields = '__all__'

class StudentExamResultSerializer(serializers.ModelSerializer):
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    class Meta:
        model = StudentExamResult
        fields = '__all__'
