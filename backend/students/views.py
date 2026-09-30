from datetime import date
from django.db import transaction
from django.db.models import Count, Q
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action, authentication_classes, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from academic.models import ClassTimetable
from core import numbering
from core.permissions import APPROVER_ROLES, get_role, display_name, require_role
from . import leads, services
from .models import (
    Student, StudentExamResult, Lead, StudentEvent, ClassWaitlist,
    ClassAttendanceSession, StudentAttendance, StudentFeedback,
)
from .serializers import (
    StudentSerializer, StudentExamResultSerializer, LeadSerializer, LeadActivitySerializer,
    StudentEventSerializer, ClassWaitlistSerializer, StudentFeedbackSerializer,
)
from billing.serializers import InvoiceSerializer


def get_class(value, field='class_id'):
    try:
        return ClassTimetable.objects.select_related('subject', 'teacher').get(pk=int(value))
    except (TypeError, ValueError, ClassTimetable.DoesNotExist):
        raise ValidationError({field: 'Kelas tidak dijumpai.'})


def get_date(value, field, default=None):
    if not value:
        return default
    parsed = parse_date(str(value))
    if not parsed:
        raise ValidationError({field: 'Tarikh tidak sah.'})
    return parsed


def classes_from(ids):
    return [get_class(i, 'class_ids') for i in (ids or [])]


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all().prefetch_related(
        'enrolled_classes__slot', 'enrolled_classes__subject', 'enrolled_classes__teacher',
        'enrolled_classes__classroom', 'walk_in_subjects', 'waitlist_entries__timetable_class__subject',
        'waitlist_entries__timetable_class__teacher',
    ).order_by('-created_at')
    serializer_class = StudentSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        classes = classes_from(request.data.get('class_ids'))
        by = display_name(request.user)
        with transaction.atomic():
            student = serializer.save(
                student_id=numbering.student_id(Student, date.today()),
                join_date=serializer.validated_data.get('join_date') or date.today(),
            )
            results = services.register(student, by, classes)
        data = self.get_serializer(student).data
        data['enrolment'] = results
        return Response(data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        # Special fee rates are a Supervisor / Management decision
        decided = {'special_monthly_fee', 'special_fee_note', 'standing_discount'} & set(serializer.validated_data)
        if decided and get_role(self.request.user) not in APPROVER_ROLES:
            raise PermissionDenied('Hanya Supervisor/Management boleh menetapkan kadar khas atau diskaun tetap.')
        serializer.save()

    def _respond(self, student, **extra):
        student = self.get_queryset().get(pk=student.pk)
        return Response({**self.get_serializer(student).data, **extra})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        student = self.get_object()
        invoice = services.decide_registration(student, display_name(request.user), True, (request.data.get('comment') or '').strip())
        return self._respond(student, invoice=InvoiceSerializer(invoice).data if invoice else None)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        student = self.get_object()
        services.decide_registration(student, display_name(request.user), False, (request.data.get('comment') or '').strip())
        return self._respond(student)

    @action(detail=True, methods=['post'])
    def enroll(self, request, pk=None):
        student = self.get_object()
        if student.status not in ('PENDING', 'ACTIVE', 'ON_HOLD'):
            raise ValidationError({'detail': 'Pelajar ini tidak aktif.'})
        cls = get_class(request.data.get('class_id'))
        # Only Supervisor / Management may place a student above the seat limit
        over = bool(request.data.get('allow_over_capacity')) and get_role(request.user) in APPROVER_ROLES
        with transaction.atomic():
            result = services.enroll(student, cls, display_name(request.user),
                                     get_date(request.data.get('date'), 'date'), allow_over_capacity=over)
        return self._respond(student, enrolment=result)

    @action(detail=True, methods=['post'])
    def drop(self, request, pk=None):
        student = self.get_object()
        services.drop(student, get_class(request.data.get('class_id')), display_name(request.user),
                      request.data.get('reason_code'), request.data.get('reason_text', ''),
                      get_date(request.data.get('date'), 'date'))
        return self._respond(student)

    @action(detail=True, methods=['post'])
    def change_class(self, request, pk=None):
        student = self.get_object()
        services.change_class(student, get_class(request.data.get('from_class'), 'from_class'),
                              get_class(request.data.get('to_class'), 'to_class'), display_name(request.user),
                              request.data.get('reason_text', ''), get_date(request.data.get('date'), 'date'))
        return self._respond(student)

    @action(detail=True, methods=['post'])
    def hold(self, request, pk=None):
        student = self.get_object()
        start = get_date(request.data.get('start'), 'start', date.today())
        services.hold(student, display_name(request.user), start,
                      get_date(request.data.get('until'), 'until'), request.data.get('reason_text', ''))
        return self._respond(student)

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        student = self.get_object()
        services.resume(student, display_name(request.user), get_date(request.data.get('date'), 'date'))
        return self._respond(student)

    @action(detail=True, methods=['post'])
    def terminate(self, request, pk=None):
        student = self.get_object()
        services.terminate(student, display_name(request.user), request.data.get('reason_code'),
                           request.data.get('reason_text', ''), get_date(request.data.get('date'), 'date'))
        return self._respond(student)

    @action(detail=True, methods=['post'])
    def note(self, request, pk=None):
        student = self.get_object()
        description = (request.data.get('description') or '').strip()
        if not description:
            raise ValidationError({'description': 'Catatan tidak boleh kosong.'})
        services.log(student, 'NOTE', display_name(request.user), get_date(request.data.get('date'), 'date'),
                     description=description, action=request.data.get('action', ''))
        return self._respond(student)


class PublicRegisterThrottle(ScopedRateThrottle):
    scope = 'public_register'


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicRegisterThrottle])
def parent_self_register(request):
    """Parents register from their phone via the counter QR code. Staff assign classes and approve."""
    serializer = StudentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        student = serializer.save(
            student_id=numbering.student_id(Student, date.today()),
            join_date=date.today(),
            lead_source=serializer.validated_data.get('lead_source') or 'QR_CODE',
        )
        services.register(student, 'Ibu bapa (QR)', [])
        interested = [str(s)[:40] for s in (request.data.get('interested_subjects') or [])][:12]
        if interested:
            services.log(student, 'NOTE', 'Ibu bapa (QR)', description=f"Subjek diminati: {', '.join(interested)}")
    return Response({
        'success': True,
        'message': 'Pendaftaran diterima. Pihak pusat tuisyen akan menghubungi anda untuk pengesahan kelas dan bayaran.',
        'student_id': student.student_id,
    }, status=status.HTTP_201_CREATED)


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.select_related('converted_student').annotate(activity_total=Count('activities'))
    serializer_class = LeadSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('stage'):
            qs = qs.filter(status=p['stage'])
        if p.get('source'):
            qs = qs.filter(lead_source=p['source'])
        if p.get('campaign'):
            qs = qs.filter(campaign=p['campaign'])
        if p.get('form'):
            qs = qs.filter(form_level=p['form'])
        if p.get('start'):
            qs = qs.filter(enquiry_date__gte=get_date(p['start'], 'start'))
        if p.get('end'):
            qs = qs.filter(enquiry_date__lte=get_date(p['end'], 'end'))
        return qs

    def perform_create(self, serializer):
        on = serializer.validated_data.get('enquiry_date') or date.today()
        by = display_name(self.request.user)
        with transaction.atomic():
            lead = serializer.save(
                lead_id=numbering.next_number(Lead, 'lead_id', f"LD-{on.year}-", 3),
                enquiry_date=on,
                stage_changed_at=on,
                assigned_to=serializer.validated_data.get('assigned_to') or by,
            )
            leads.log_activity(lead, by, 'Lead baharu', lead.notes, on=on)

    def _respond(self, lead, **extra):
        return Response({**self.get_serializer(self.get_queryset().get(pk=lead.pk)).data, **extra})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        return Response(leads.stats(self.get_queryset()))

    @action(detail=True, methods=['get', 'post'])
    def activities(self, request, pk=None):
        lead = self.get_object()
        if request.method == 'GET':
            return Response(LeadActivitySerializer(lead.activities.all(), many=True).data)
        data = LeadActivitySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        leads.log_activity(lead, display_name(request.user), v['action'], v.get('remark', ''),
                           v.get('outcome', 'DONE'), v.get('activity_date'), v.get('next_follow_up'))
        return self._respond(lead)

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        lead = self.get_object()
        with transaction.atomic():
            leads.move(lead, request.data.get('stage'), display_name(request.user),
                       (request.data.get('remark') or '').strip(), get_date(request.data.get('date'), 'date'),
                       get_date(request.data.get('next_follow_up'), 'next_follow_up'))
        return self._respond(lead)

    @action(detail=True, methods=['post'])
    def lost(self, request, pk=None):
        lead = self.get_object()
        with transaction.atomic():
            leads.mark_lost(lead, display_name(request.user), (request.data.get('reason') or '').strip())
        return self._respond(lead)

    @action(detail=True, methods=['post'])
    def convert_to_student(self, request, pk=None):
        lead = self.get_object()
        if lead.converted_student or lead.status in Lead.CLOSED_STAGES:
            raise ValidationError({'detail': 'Lead ini sudah ditutup atau didaftarkan sebagai pelajar.'})
        by = display_name(request.user)
        with transaction.atomic():
            student = Student.objects.create(
                student_id=numbering.student_id(Student, date.today()),
                full_name=lead.student_name,
                ic_number=request.data.get('ic_number', ''),
                student_type='MONTHLY',
                form_level=lead.form_level,
                stream='GENERAL',
                school_name=lead.school_name,
                phone_number=lead.phone,
                email=lead.email,
                join_date=date.today(),
                lead_source=lead.lead_source,
                parent1_name=lead.parent_name,
                parent1_phone=lead.phone,
                parent1_email=lead.email,
                parent1_relation='Bapa',
            )
            services.register(student, by, classes_from(request.data.get('class_ids')))
            if lead.interested_subjects:
                services.log(student, 'NOTE', by, description=f"Subjek diminati: {', '.join(map(str, lead.interested_subjects))}")
            leads.mark_registered(lead, student, by)

        return self._respond(
            lead,
            message=f"Lead didaftarkan sebagai pelajar {student.full_name} ({student.student_id}). Menunggu kelulusan Supervisor.",
            student=StudentSerializer(student).data,
        )


class StudentFeedbackViewSet(viewsets.ModelViewSet):
    """Parent / student feedback with photos and videos; filterable by student, form and date (gallery)."""
    queryset = StudentFeedback.objects.select_related('student').all()
    serializer_class = StudentFeedbackSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('form'):
            qs = qs.filter(student__form_level=p['form'])
        if p.get('start'):
            qs = qs.filter(date__gte=get_date(p['start'], 'start'))
        if p.get('end'):
            qs = qs.filter(date__lte=get_date(p['end'], 'end'))
        return qs

    def perform_create(self, serializer):
        by = display_name(self.request.user)
        with transaction.atomic():
            feedback = serializer.save(recorded_by=by)
            services.log(feedback.student, 'FEEDBACK', by, feedback.date,
                         description=f"{feedback.get_given_by_display()}: {feedback.description}"[:500])


class StudentEventViewSet(viewsets.ReadOnlyModelViewSet):
    """Student history, filterable for daily / weekly / monthly / custom-date reports."""
    queryset = StudentEvent.objects.select_related('student').all()
    serializer_class = StudentEventSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('type'):
            qs = qs.filter(event_type__in=p['type'].split(','))
        start = get_date(p.get('start'), 'start')
        end = get_date(p.get('end'), 'end')
        if start:
            qs = qs.filter(event_date__gte=start)
        if end:
            qs = qs.filter(event_date__lte=end)
        return qs


class ClassWaitlistViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ClassWaitlist.objects.select_related('student', 'timetable_class__subject', 'timetable_class__teacher')
    serializer_class = ClassWaitlistSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(status=self.request.query_params.get('status', 'WAITING'))

    @action(detail=True, methods=['post'])
    def enroll(self, request, pk=None):
        # Moving a student in from the waiting list may exceed the seat limit
        require_role(request, *APPROVER_ROLES)
        entry = self.get_object()
        if entry.status != 'WAITING':
            raise ValidationError({'detail': 'Rekod ini telah diproses.'})
        with transaction.atomic():
            services.enroll(entry.student, entry.timetable_class, display_name(request.user), allow_over_capacity=True)
        entry.refresh_from_db()
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        entry = self.get_object()
        if entry.status != 'WAITING':
            raise ValidationError({'detail': 'Rekod ini telah diproses.'})
        entry.status = 'CANCELLED'
        entry.resolved_by = display_name(request.user)
        entry.save(update_fields=['status', 'resolved_by'])
        return Response(self.get_serializer(entry).data)


class StudentExamResultViewSet(viewsets.ModelViewSet):
    queryset = StudentExamResult.objects.select_related('student', 'subject').all()
    serializer_class = StudentExamResultSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('student'):
            qs = qs.filter(student_id=self.request.query_params['student'])
        return qs

    def perform_create(self, serializer):
        student = serializer.validated_data['student']
        serializer.save(
            form_level=serializer.validated_data.get('form_level') or student.form_level,
            exam_date=serializer.validated_data.get('exam_date') or date.today(),
        )


def _roster_students(cls):
    # Active students in the class; on-hold students are listed but marked
    return cls.students.filter(status__in=['ACTIVE', 'ON_HOLD']).order_by('full_name')


@api_view(['GET', 'POST'])
def attendance_roster(request):
    """GET the class list for a date with any saved marks; POST to save the day's attendance."""
    source = request.query_params if request.method == 'GET' else request.data
    cls = get_class(source.get('class_id'))
    on = get_date(source.get('date'), 'date', date.today())

    if request.method == 'POST':
        students = {s.id: s for s in _roster_students(cls)}
        with transaction.atomic():
            session, _ = ClassAttendanceSession.objects.update_or_create(
                timetable_class=cls, date=on,
                defaults={'note': request.data.get('note', ''), 'recorded_by': display_name(request.user)},
            )
            for mark in request.data.get('marks', []):
                sid = int(mark.get('student'))
                if sid not in students:
                    raise ValidationError({'marks': f'Pelajar {sid} tiada dalam kelas ini.'})
                StudentAttendance.objects.update_or_create(
                    session=session, student_id=sid,
                    defaults={'present': bool(mark.get('present')), 'note': mark.get('note', '')},
                )

    session = ClassAttendanceSession.objects.filter(timetable_class=cls, date=on).first()
    marks = {m.student_id: m for m in session.marks.all()} if session else {}
    rows = [{
        'student': s.id,
        'student_id': s.student_id,
        'name': s.full_name,
        'status': s.status,
        'parent_phone': s.parent1_phone,
        'present': marks[s.id].present if s.id in marks else None,
        'note': marks[s.id].note if s.id in marks else '',
    } for s in _roster_students(cls)]
    return Response({
        'class_id': cls.id,
        'class_code': cls.class_code,
        'date': on,
        'saved': session is not None,
        'note': session.note if session else '',
        'recorded_by': session.recorded_by if session else '',
        'students': rows,
        'present': sum(1 for r in rows if r['present']),
        'total': len(rows),
    })


def attendance_rates(start, end, class_ids=None):
    """Attendance rate per class between two dates, as % and fraction."""
    marks = StudentAttendance.objects.filter(session__date__gte=start, session__date__lte=end)
    if class_ids:
        marks = marks.filter(session__timetable_class_id__in=class_ids)
    rows = marks.values('session__timetable_class').annotate(
        total=Count('id'), present=Count('id', filter=Q(present=True)), sessions=Count('session', distinct=True),
    )
    classes = {c.id: c for c in ClassTimetable.objects.select_related('subject', 'teacher').filter(
        pk__in=[r['session__timetable_class'] for r in rows])}
    result = [{
        'class_id': r['session__timetable_class'],
        'class_code': classes[r['session__timetable_class']].class_code,
        'sessions': r['sessions'],
        'present': r['present'],
        'total': r['total'],
        'rate': round(r['present'] / r['total'] * 100, 1) if r['total'] else None,
    } for r in rows]
    return sorted(result, key=lambda x: (x['rate'] is None, x['rate'] or 0))


@api_view(['GET'])
def attendance_summary(request):
    end = get_date(request.query_params.get('end'), 'end', date.today())
    start = get_date(request.query_params.get('start'), 'start', end.replace(day=1))
    rows = attendance_rates(start, end)
    present = sum(r['present'] for r in rows)
    total = sum(r['total'] for r in rows)
    return Response({
        'start': start, 'end': end, 'classes': rows,
        'present': present, 'total': total,
        'rate': round(present / total * 100, 1) if total else None,
    })
