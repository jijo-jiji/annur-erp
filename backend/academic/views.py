from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from core.permissions import APPROVER_ROLES, get_role
from .models import Classroom, TimeSlot, ClassTimetable, ClassRescheduleLog, LessonHandout
from .serializers import (
    ClassroomSerializer, TimeSlotSerializer, ClassTimetableSerializer,
    ClassRescheduleLogSerializer, LessonHandoutSerializer
)

class ClassroomViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Classroom.objects.all()
    serializer_class = ClassroomSerializer

class TimeSlotViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TimeSlot.objects.all()
    serializer_class = TimeSlotSerializer

class ClassTimetableViewSet(viewsets.ModelViewSet):
    queryset = ClassTimetable.with_enrolment().select_related(
        'slot', 'subject', 'teacher', 'classroom'
    ).prefetch_related('teacher__subjects_qualified')
    serializer_class = ClassTimetableSerializer
    write_roles = APPROVER_ROLES

class ClassRescheduleLogViewSet(viewsets.ModelViewSet):
    queryset = ClassRescheduleLog.objects.all().select_related(
        'timetable_class__subject', 'timetable_class__teacher'
    ).order_by('-created_at')
    serializer_class = ClassRescheduleLogSerializer

    # Admin records extra/cancel classes; only Supervisor/Management approve them
    def perform_create(self, serializer):
        if get_role(self.request.user) in APPROVER_ROLES:
            serializer.save()
        else:
            serializer.save(supervisor_approved=False)

    def perform_update(self, serializer):
        if 'supervisor_approved' in serializer.validated_data and get_role(self.request.user) not in APPROVER_ROLES:
            raise PermissionDenied('Hanya Supervisor/Management boleh meluluskan kelas ganti/tambahan.')
        serializer.save()

class LessonHandoutViewSet(viewsets.ModelViewSet):
    queryset = LessonHandout.objects.all().order_by('-upload_date')
    serializer_class = LessonHandoutSerializer

    def perform_create(self, serializer):
        last_hnd = LessonHandout.objects.order_by('-id').first()
        next_num = (last_hnd.id + 1) if last_hnd else 1
        generated_id = f"HND-{next_num:03d}"
        serializer.save(handout_id=serializer.validated_data.get('handout_id') or generated_id)

    @action(detail=True, methods=['post'])
    def record_print(self, request, pk=None):
        handout = self.get_object()
        copies = int(request.data.get('copies', handout.copies_needed))
        handout.copies_printed = copies
        handout.status = 'PRINT_READY'
        handout.save()
        return Response(self.get_serializer(handout).data)

