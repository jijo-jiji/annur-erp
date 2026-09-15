from rest_framework import viewsets
from .models import Classroom, TimeSlot, ClassTimetable, ClassRescheduleLog
from .serializers import ClassroomSerializer, TimeSlotSerializer, ClassTimetableSerializer, ClassRescheduleLogSerializer

class ClassroomViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Classroom.objects.all()
    serializer_class = ClassroomSerializer

class TimeSlotViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TimeSlot.objects.all()
    serializer_class = TimeSlotSerializer

class ClassTimetableViewSet(viewsets.ModelViewSet):
    queryset = ClassTimetable.objects.all().select_related('slot', 'subject', 'teacher', 'classroom')
    serializer_class = ClassTimetableSerializer

class ClassRescheduleLogViewSet(viewsets.ModelViewSet):
    queryset = ClassRescheduleLog.objects.all().select_related('timetable_class').order_by('-created_at')
    serializer_class = ClassRescheduleLogSerializer
