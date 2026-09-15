from rest_framework import viewsets
from .models import Teacher, TeacherAttendance
from .serializers import TeacherSerializer, TeacherAttendanceSerializer

class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.all().order_by('teacher_type', 'teacher_code')
    serializer_class = TeacherSerializer

class TeacherAttendanceViewSet(viewsets.ModelViewSet):
    queryset = TeacherAttendance.objects.all().order_by('-date')
    serializer_class = TeacherAttendanceSerializer
