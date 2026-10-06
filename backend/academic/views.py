from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from django.db import transaction
from django.utils import timezone
from core.permissions import APPROVER_ROLES, MANAGEMENT, display_name, get_role, require_role
from .models import Classroom, TimeSlot, ClosedDate, ClassTimetable, ClassRescheduleLog, LessonHandout, TimetableChange
from .serializers import (
    ClassroomSerializer, TimeSlotSerializer, ClosedDateSerializer, ClassTimetableSerializer,
    ClassRescheduleLogSerializer, LessonHandoutSerializer, TimetableChangeSerializer
)

class ClassroomViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Classroom.objects.all()
    serializer_class = ClassroomSerializer

class ClosedDateViewSet(viewsets.ReadOnlyModelViewSet):
    """Closed days are changed through change requests (Supervisor asks, Management approves), never here."""
    queryset = ClosedDate.objects.all()
    serializer_class = ClosedDateSerializer


class TimeSlotViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TimeSlot.objects.all()
    serializer_class = TimeSlotSerializer

FIELD_LABELS = {'slot': 'Slot', 'subject': 'Subjek', 'form_level': 'Tingkatan', 'section': 'Seksyen',
                'teacher': 'Guru', 'classroom': 'Bilik', 'max_seats': 'Had kerusi'}


def describe(instance, data):
    """Readable summary of what a timetable change does."""
    if instance is None:
        return ', '.join(f"{FIELD_LABELS.get(k, k)}: {v}" for k, v in data.items() if k in FIELD_LABELS)
    changes = []
    for field, value in data.items():
        if field not in FIELD_LABELS:
            continue
        old = getattr(instance, f"{field}_id", None) if field in ('slot', 'subject', 'teacher', 'classroom') else getattr(instance, field)
        if str(old or '') != str(value or ''):
            old_obj = getattr(instance, field)
            changes.append(f"{FIELD_LABELS[field]}: {old_obj if old_obj is not None else '-'} → {value if value not in (None, '') else '-'}")
    return '; '.join(changes)


class ClassTimetableViewSet(viewsets.ModelViewSet):
    """Master timetable. Management's changes apply at once; a Supervisor's become a change
    request for Management to approve or reject."""
    queryset = ClassTimetable.with_enrolment().select_related(
        'slot', 'subject', 'teacher', 'classroom'
    ).prefetch_related('teacher__subjects_qualified')
    serializer_class = ClassTimetableSerializer
    write_roles = APPROVER_ROLES

    def _request_change(self, action_name, instance=None, data=None):
        by = display_name(self.request.user)
        data = {k: v for k, v in (data or {}).items() if k in FIELD_LABELS}
        change = TimetableChange.objects.create(
            action=action_name, timetable_class=instance, class_label=instance.class_code if instance else '',
            payload=data, summary=describe(instance, data) if action_name != 'DELETE' else 'Padam kelas daripada jadual induk',
            requested_by=by,
        )
        return Response({'pending_change': TimetableChangeSerializer(change).data,
                         'message': 'Perubahan dihantar untuk kelulusan Management.'}, status=status.HTTP_202_ACCEPTED)

    def create(self, request, *args, **kwargs):
        if get_role(request.user) == MANAGEMENT:
            return super().create(request, *args, **kwargs)
        self.get_serializer(data=request.data).is_valid(raise_exception=True)
        return self._request_change('CREATE', data=request.data)

    def update(self, request, *args, **kwargs):
        if get_role(request.user) == MANAGEMENT:
            return super().update(request, *args, **kwargs)
        instance = self.get_object()
        self.get_serializer(instance, data=request.data, partial=True).is_valid(raise_exception=True)
        return self._request_change('UPDATE', instance, request.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.enrolled_count:
            raise ValidationError({'detail': f"{instance.class_code} masih ada {instance.enrolled_count} pelajar. Pindahkan mereka dahulu."})
        if get_role(request.user) == MANAGEMENT:
            return super().destroy(request, *args, **kwargs)
        return self._request_change('DELETE', instance)


class TimetableChangeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TimetableChange.objects.select_related('timetable_class').all()
    serializer_class = TimetableChangeSerializer
    read_roles = APPROVER_ROLES

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('status'):
            qs = qs.filter(status=self.request.query_params['status'])
        return qs

    def _decided(self, change, approved, comment):
        change.status = 'APPROVED' if approved else 'REJECTED'
        change.decided_by = display_name(self.request.user)
        change.decision_comment = comment
        change.decided_at = timezone.now()
        change.save()
        return Response(self.get_serializer(change).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        require_role(request, MANAGEMENT)
        change = self.get_object()
        if change.status != 'PENDING':
            raise ValidationError({'detail': 'Perubahan ini telah diputuskan.'})
        with transaction.atomic():
            if change.action == 'CREATE':
                ser = ClassTimetableSerializer(data=change.payload)
                ser.is_valid(raise_exception=True)
                change.timetable_class = ser.save()
            else:
                cls = change.timetable_class
                if cls is None:
                    raise ValidationError({'detail': 'Kelas ini sudah tiada.'})
                if change.action == 'UPDATE':
                    ser = ClassTimetableSerializer(cls, data=change.payload, partial=True)
                    ser.is_valid(raise_exception=True)
                    ser.save()
                else:
                    if ClassTimetable.with_enrolment().get(pk=cls.pk).enrolled_count:
                        raise ValidationError({'detail': 'Kelas masih ada pelajar. Pindahkan mereka dahulu.'})
                    cls.delete()
            return self._decided(change, True, (request.data.get('comment') or '').strip())

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        require_role(request, MANAGEMENT)
        change = self.get_object()
        if change.status != 'PENDING':
            raise ValidationError({'detail': 'Perubahan ini telah diputuskan.'})
        comment = (request.data.get('comment') or '').strip()
        if not comment:
            raise ValidationError({'comment': 'Sila nyatakan sebab penolakan.'})
        return self._decided(change, False, comment)


class ClassRescheduleLogViewSet(viewsets.ModelViewSet):
    """Extra / cancelled classes: Admin records, Supervisor approves or rejects, Management verifies."""
    queryset = ClassRescheduleLog.objects.all().select_related(
        'timetable_class__subject', 'timetable_class__teacher'
    ).order_by('-created_at')
    serializer_class = ClassRescheduleLogSerializer

    def perform_create(self, serializer):
        by = display_name(self.request.user)
        if get_role(self.request.user) in APPROVER_ROLES:
            serializer.save(recorded_by=by, status='APPROVED', supervisor_approved=True, decided_by=by)
        else:
            serializer.save(recorded_by=by, status='PENDING', supervisor_approved=False)

    def perform_update(self, serializer):
        log = serializer.instance
        changing = set(serializer.validated_data) - {'whatsapp_notification_sent'}
        if changing and log.status != 'PENDING' and get_role(self.request.user) not in APPROVER_ROLES:
            raise PermissionDenied('Rekod yang telah diputuskan hanya boleh diubah oleh Supervisor/Management.')
        serializer.save()

    def _decide(self, request, approved):
        require_role(request, *APPROVER_ROLES)
        log = self.get_object()
        if log.status != 'PENDING':
            raise ValidationError({'detail': 'Rekod ini telah diputuskan.'})
        comment = (request.data.get('comment') or '').strip()
        if not approved and not comment:
            raise ValidationError({'comment': 'Sila nyatakan sebab penolakan.'})
        log.status = 'APPROVED' if approved else 'REJECTED'
        log.supervisor_approved = approved
        log.decided_by = display_name(request.user)
        log.decision_comment = comment
        log.save()
        return Response(self.get_serializer(log).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._decide(request, True)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._decide(request, False)

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        require_role(request, MANAGEMENT)
        log = self.get_object()
        if log.status != 'APPROVED':
            raise ValidationError({'detail': 'Hanya rekod yang diluluskan boleh disahkan.'})
        log.verified_by = display_name(request.user)
        log.verified_at = timezone.now()
        log.save(update_fields=['verified_by', 'verified_at'])
        return Response(self.get_serializer(log).data)

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

