from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from datetime import date, datetime
from django.db.models import Q
from django.utils.dateparse import parse_date, parse_time
from core import numbering, pdf
from core.permissions import MANAGEMENT, APPROVER_ROLES, display_name, get_role, require_role
from . import payroll
from . import staff as staff_hr
from .models import (
    Teacher, TeacherAttendance, TeacherComplaint, TeacherRateIncrement, TeacherPayment,
    StaffMember, StaffAttendance, LeaveRequest, StaffHistory, StaffRecord, StaffKPI
)
from .serializers import (
    TeacherSerializer, TeacherAttendanceSerializer, TeacherPaymentSerializer,
    TeacherComplaintSerializer, TeacherRateIncrementSerializer,
    StaffMemberSerializer, StaffAttendanceSerializer, LeaveRequestSerializer,
    StaffHistorySerializer, StaffRecordSerializer, StaffKPISerializer
)

class TeacherViewSet(viewsets.ReadOnlyModelViewSet):
    """Teachers are added and changed through change requests (Supervisor asks, Management approves), never here."""
    queryset = Teacher.objects.all().prefetch_related('subjects_qualified').order_by('teacher_type', 'teacher_code')
    serializer_class = TeacherSerializer
    write_roles = APPROVER_ROLES

class TeacherComplaintViewSet(viewsets.ModelViewSet):
    queryset = TeacherComplaint.objects.all().select_related('teacher')
    serializer_class = TeacherComplaintSerializer
    # Complaint / action report sits with Supervisor & Management in j-status.doc
    read_roles = APPROVER_ROLES
    write_roles = APPROVER_ROLES

    def perform_create(self, serializer):
        serializer.save(recorded_by=display_name(self.request.user))

class TeacherRateIncrementViewSet(viewsets.ModelViewSet):
    queryset = TeacherRateIncrement.objects.all().select_related('teacher')
    serializer_class = TeacherRateIncrementSerializer
    # Rates are hidden from Admin; Supervisor/Management propose, Management approves
    read_roles = APPROVER_ROLES
    write_roles = APPROVER_ROLES

    def perform_create(self, serializer):
        teacher = serializer.validated_data['teacher']
        serializer.save(previous_rate=teacher.rate_per_session, proposed_by=display_name(self.request.user))

    def _decide(self, request, approve):
        require_role(request, MANAGEMENT)
        inc = self.get_object()
        if inc.status != 'PENDING':
            return Response({'detail': 'Cadangan ini telah diproses.'}, status=status.HTTP_400_BAD_REQUEST)
        comment = (request.data.get('comment') or '').strip()
        if not approve and not comment:
            return Response({'detail': 'Sila nyatakan sebab penolakan.'}, status=status.HTTP_400_BAD_REQUEST)
        inc.status = 'APPROVED' if approve else 'REJECTED'
        inc.decided_by = display_name(request.user)
        inc.decision_comment = comment
        inc.save()
        if approve:
            inc.teacher.rate_per_session = inc.proposed_rate
            inc.teacher.save(update_fields=['rate_per_session'])
        return Response(self.get_serializer(inc).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._decide(request, approve=True)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._decide(request, approve=False)

class TeacherAttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    """Class-session attendance. Recorded through the daily roster so each save is checked."""
    queryset = TeacherAttendance.objects.all().select_related('teacher', 'replacement_teacher').order_by('-date')
    serializer_class = TeacherAttendanceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('teacher'):
            qs = qs.filter(Q(teacher_id=p['teacher']) | Q(replacement_teacher_id=p['teacher']))
        if p.get('month'):
            month = payroll.month_start(p['month'])
            qs = qs.filter(date__gte=month, date__lte=payroll.month_end(month))
        return qs

    @action(detail=False, methods=['get', 'post'])
    def roster(self, request):
        source = request.query_params if request.method == 'GET' else request.data
        on = parse_date(str(source.get('date') or ''))
        if not on:
            raise ValidationError({'date': 'Tarikh tidak sah.'})
        if request.method == 'POST':
            payroll.save_roster(on, request.data.get('marks') or [], display_name(request.user))
        return Response({'date': on, 'classes': payroll.roster(on)})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        rows = payroll.month_summary(request.query_params.get('month') or date.today())
        if get_role(request.user) not in APPROVER_ROLES:  # Admin does not see pay
            for row in rows:
                row.pop('amount')
        return Response(rows)


class TeacherPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """Monthly teacher pay: Supervisor calculates and verifies, Management approves or rejects."""
    queryset = TeacherPayment.objects.all().select_related('teacher')
    serializer_class = TeacherPaymentSerializer
    read_roles = APPROVER_ROLES

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('month'):
            qs = qs.filter(month=payroll.month_start(p['month']))
        if p.get('teacher'):
            qs = qs.filter(teacher_id=p['teacher'])
        return qs

    def _respond(self, payment):
        return Response(self.get_serializer(TeacherPayment.objects.select_related('teacher').get(pk=payment.pk)).data)

    @action(detail=False, methods=['post'])
    def calculate(self, request):
        require_role(request, *APPROVER_ROLES)
        result = payroll.calculate(request.data.get('month') or date.today(), display_name(request.user))
        rows = self.get_queryset().filter(month=result['month'])
        return Response({**result, 'payments': self.get_serializer(rows, many=True).data})

    @action(detail=True, methods=['get'])
    def sessions(self, request, pk=None):
        payment = self.get_object()
        return Response(payroll.sessions_for(payment.teacher_id, payment.month))

    @action(detail=True, methods=['get'])
    def payslip(self, request, pk=None):
        payment = self.get_object()
        data = pdf.payslip_pdf(payment, payroll.sessions_for(payment.teacher_id, payment.month))
        return pdf.pdf_response(data, f"slip-gaji-{payment.teacher.teacher_code}-{payment.month:%Y-%m}.pdf")

    @action(detail=True, methods=['post'])
    def adjust(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        payment = self.get_object()
        payroll.adjust(payment, request.data.get('adjustment'), request.data.get('adjustment_note'), request.data.get('remarks'))
        return self._respond(payment)

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        payment = self.get_object()
        payroll.verify(payment, display_name(request.user))
        return self._respond(payment)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        require_role(request, MANAGEMENT)
        payment = self.get_object()
        payroll.decide(payment, display_name(request.user), True, (request.data.get('comment') or '').strip())
        return self._respond(payment)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        require_role(request, MANAGEMENT)
        payment = self.get_object()
        payroll.decide(payment, display_name(request.user), False, (request.data.get('comment') or '').strip())
        return self._respond(payment)

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        payment = self.get_object()
        payroll.mark_paid(payment, display_name(request.user), parse_date(str(request.data.get('paid_date') or '')),
                          request.data.get('payment_method'), request.data.get('payment_reference'))
        return self._respond(payment)

def own_staff(request):
    """The staff record linked to the logged-in account, if any."""
    return StaffMember.objects.filter(user=request.user).first()


def is_approver(request):
    return get_role(request.user) in APPROVER_ROLES


PERSONAL_FIELDS = {
    'name', 'ic_number', 'date_of_birth', 'marital_status', 'dependents', 'address', 'email', 'phone', 'skills',
    'emergency_name', 'emergency_phone', 'emergency_address', 'emergency_email', 'emergency_relation',
}


JOB_LABELS = {
    'role': 'Jawatan', 'department': 'Jabatan', 'join_date': 'Tarikh mula', 'employment_type': 'Jenis pekerjaan',
    'contract_start': 'Kontrak mula', 'contract_end': 'Kontrak tamat', 'work_start': 'Waktu masuk', 'work_end': 'Waktu keluar',
    'work_days': 'Hari bekerja', 'al_entitlement': 'Kelayakan AL', 'mc_entitlement': 'Kelayakan MC',
    'el_entitlement': 'Kelayakan EL', 'is_active': 'Status', 'user': 'Akaun',
}
WEEKDAY_NAMES = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad']


def job_value(field, value):
    """A job-field value as staff would read it in the history."""
    if value in (None, ''):
        return '-'
    if field == 'employment_type':
        return dict(StaffMember.EMPLOYMENT_CHOICES).get(value, value)
    if field == 'is_active':
        return 'Aktif' if value else 'Tidak aktif'
    if field == 'work_days':
        return ', '.join(WEEKDAY_NAMES[int(d)] for d in str(value).split(',') if d.strip().isdigit())
    if field in ('work_start', 'work_end'):
        return value.strftime('%H:%M')
    if field in ('join_date', 'contract_start', 'contract_end'):
        return value.strftime('%d/%m/%Y')
    return str(value)


class StaffMemberViewSet(viewsets.ModelViewSet):
    """Staff profiles. Adding staff and job details are Management's; personal details can be
    kept up to date by Supervisor / Management or by the staff member for their own profile."""
    queryset = StaffMember.objects.all().select_related('user').order_by('staff_id')
    serializer_class = StaffMemberSerializer

    def perform_create(self, serializer):
        require_role(self.request, MANAGEMENT)
        staff = serializer.save(staff_id=numbering.next_number(StaffMember, 'staff_id', 'STF-', 3))
        StaffHistory.objects.create(staff=staff, date=staff.join_date or date.today(),
                                    change=f"Mula bekerja: {staff.role}, {staff.department} ({staff.get_employment_type_display()})",
                                    recorded_by=display_name(self.request.user))

    def perform_update(self, serializer):
        staff = serializer.instance
        changed = set(serializer.validated_data)
        own = staff.user_id == self.request.user.id
        if changed & set(StaffMember.JOB_FIELDS):
            require_role(self.request, MANAGEMENT)
        elif not (is_approver(self.request) or (own and changed <= PERSONAL_FIELDS)):
            raise PermissionDenied('Anda hanya boleh mengemas kini maklumat peribadi anda sendiri.')
        before = {f: getattr(staff, f) for f in StaffMember.JOB_FIELDS}
        staff = serializer.save()
        changes = [f"{JOB_LABELS[f]}: {job_value(f, before[f])} → {job_value(f, getattr(staff, f))}"
                   for f in StaffMember.JOB_FIELDS if before[f] != getattr(staff, f) and f != 'user']
        if changes:
            StaffHistory.objects.create(staff=staff, date=date.today(), change='; '.join(changes),
                                        remark=(self.request.data.get('history_remark') or '').strip(),
                                        recorded_by=display_name(self.request.user))

    def perform_destroy(self, instance):
        raise ValidationError({'detail': 'Staf tidak dipadam; tandakan tidak aktif supaya rekod kekal.'})

    @action(detail=False, methods=['get'])
    def me(self, request):
        staff = own_staff(request)
        if not staff:
            return Response({'detail': 'Akaun anda belum dipautkan kepada rekod staf.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(staff).data)

    @action(detail=True, methods=['get', 'post'])
    def history(self, request, pk=None):
        staff = self.get_object()
        if request.method == 'POST':
            require_role(request, MANAGEMENT)
            ser = StaffHistorySerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            ser.save(staff=staff, recorded_by=display_name(request.user))
        return Response(StaffHistorySerializer(staff.history.all(), many=True).data)

    @action(detail=False, methods=['get'])
    def report(self, request):
        """Monthly attendance (late / early leave / %), yearly leave used and balance, KPI achievement."""
        require_role(request, *APPROVER_ROLES)
        today = date.today()
        month = parse_date(f"{request.query_params.get('month') or today.strftime('%Y-%m')}-01")
        if not month:
            raise ValidationError({'month': 'Bulan tidak sah (format YYYY-MM).'})
        year = int(request.query_params.get('year') or month.year)
        return Response({
            'attendance': staff_hr.attendance_report(month, today),
            'leave': staff_hr.leave_report(year),
            'kpi': staff_hr.kpi_report(year),
            'alerts': staff_hr.alerts(today),
        })


class StaffRecordViewSet(viewsets.ModelViewSet):
    """Staff record log (date, description, remark): Supervisor & Management."""
    queryset = StaffRecord.objects.all().select_related('staff')
    serializer_class = StaffRecordSerializer
    read_roles = APPROVER_ROLES
    write_roles = APPROVER_ROLES

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('staff'):
            qs = qs.filter(staff_id=self.request.query_params['staff'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=display_name(self.request.user))


class StaffKPIViewSet(viewsets.ModelViewSet):
    """KPI: Supervisor / Management set and review; staff see their own."""
    queryset = StaffKPI.objects.all().select_related('staff')
    serializer_class = StaffKPISerializer
    write_roles = APPROVER_ROLES

    def get_queryset(self):
        qs = super().get_queryset()
        if not is_approver(self.request):
            qs = qs.filter(staff__user=self.request.user)
        p = self.request.query_params
        if p.get('staff'):
            qs = qs.filter(staff_id=p['staff'])
        if p.get('year'):
            qs = qs.filter(year=p['year'])
        return qs

    def perform_create(self, serializer):
        serializer.save(set_by=display_name(self.request.user))

    def perform_update(self, serializer):
        if serializer.instance.status == 'REVIEWED':
            raise ValidationError({'detail': 'KPI yang telah disemak tidak boleh diubah.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        kpi = self.get_object()
        try:
            score = int(request.data.get('score'))
        except (TypeError, ValueError):
            raise ValidationError({'score': 'Masukkan skor pencapaian 0 hingga 100.'})
        if not 0 <= score <= 100:
            raise ValidationError({'score': 'Skor mesti antara 0 dan 100.'})
        kpi.achieved = (request.data.get('achieved') or '').strip()
        kpi.score = score
        kpi.review_comment = (request.data.get('review_comment') or '').strip()
        kpi.status = 'REVIEWED'
        kpi.reviewed_by = display_name(request.user)
        kpi.reviewed_at = date.today()
        kpi.save()
        return Response(self.get_serializer(kpi).data)


class StaffAttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    """Clock in / out for the logged-in staff member; Supervisor / Management can correct times."""
    queryset = StaffAttendance.objects.all().select_related('staff').order_by('-date')
    serializer_class = StaffAttendanceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if not is_approver(self.request):
            qs = qs.filter(staff__user=self.request.user)
        p = self.request.query_params
        if p.get('staff'):
            qs = qs.filter(staff_id=p['staff'])
        if p.get('month'):
            month = parse_date(f"{p['month']}-01")
            if month:
                qs = qs.filter(date__year=month.year, date__month=month.month)
        return qs

    @action(detail=False, methods=['post'])
    def toggle_clock(self, request):
        staff = own_staff(request)
        if not staff:
            raise ValidationError({'detail': 'Akaun anda belum dipautkan kepada rekod staf. Minta Management pautkan akaun anda.'})
        now = datetime.now()
        attendance, created = StaffAttendance.objects.get_or_create(
            staff=staff, date=now.date(), defaults={'clock_in': now.time().replace(second=0, microsecond=0)})
        if created:
            message = f"Clock-in pada {attendance.clock_in:%H:%M}"
        elif not attendance.clock_out:
            attendance.clock_out = now.time().replace(second=0, microsecond=0)
            attendance.save(update_fields=['clock_out'])
            message = f"Clock-out pada {attendance.clock_out:%H:%M}"
        else:
            message = 'Anda telah clock-out untuk hari ini.'
        return Response({**self.get_serializer(attendance).data, 'message': message})

    @action(detail=False, methods=['post'])
    def correct(self, request):
        """Record or fix a day's times (forgot to clock, wrong time); a reason is required."""
        require_role(request, *APPROVER_ROLES)
        staff = StaffMember.objects.filter(pk=request.data.get('staff')).first()
        on = parse_date(str(request.data.get('date') or ''))
        note = (request.data.get('note') or '').strip()
        if not staff or not on:
            raise ValidationError({'detail': 'Pilih staf dan tarikh.'})
        if not note:
            raise ValidationError({'note': 'Nyatakan sebab pembetulan.'})
        times = {}
        for field in ('clock_in', 'clock_out'):
            value = request.data.get(field)
            if value:
                parsed = parse_time(str(value))
                if not parsed:
                    raise ValidationError({field: 'Masa tidak sah (HH:MM).'})
                times[field] = parsed
            else:
                times[field] = None
        if times['clock_in'] and times['clock_out'] and times['clock_out'] < times['clock_in']:
            raise ValidationError({'clock_out': 'Masa keluar mesti selepas masa masuk.'})
        attendance, _ = StaffAttendance.objects.update_or_create(
            staff=staff, date=on, defaults={**times, 'note': note, 'corrected_by': display_name(request.user)})
        return Response(self.get_serializer(attendance).data)


class LeaveRequestViewSet(viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.all().select_related('staff').order_by('-applied_at')
    serializer_class = LeaveRequestSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        if not is_approver(self.request):
            qs = qs.filter(staff__user=self.request.user)
        return qs

    def perform_create(self, serializer):
        staff = serializer.validated_data['staff']
        if not is_approver(self.request) and staff.user_id != self.request.user.id:
            raise PermissionDenied('Anda hanya boleh memohon cuti untuk diri sendiri.')
        start, end = serializer.validated_data['start_date'], serializer.validated_data['end_date']
        days = len(staff_hr.working_days(staff, start, end))
        if days == 0:
            raise ValidationError({'detail': 'Tiada hari bekerja dalam tempoh ini.'})
        serializer.save(leave_id=numbering.next_number(LeaveRequest, 'leave_id', f"LV-{start.year}-", 3), days_count=days)

    def perform_destroy(self, instance):
        # Only a pending application can be withdrawn, by its owner or an approver
        if instance.status != 'PENDING':
            raise ValidationError({'detail': 'Hanya permohonan yang belum diproses boleh dibatalkan.'})
        if not is_approver(self.request) and instance.staff.user_id != self.request.user.id:
            raise PermissionDenied('Anda hanya boleh membatalkan permohonan sendiri.')
        instance.delete()

    def _decide(self, request, approve):
        require_role(request, *APPROVER_ROLES)
        leave = self.get_object()
        if leave.status != 'PENDING':
            return Response({'detail': 'Permohonan ini telah diproses.'}, status=status.HTTP_400_BAD_REQUEST)
        # Nobody approves their own leave except Management
        if leave.staff.user_id == request.user.id and get_role(request.user) != MANAGEMENT:
            raise PermissionDenied('Permohonan cuti sendiri perlu diluluskan oleh Management.')
        remark = (request.data.get('supervisor_remark') or '').strip()
        if not approve and not remark:
            raise ValidationError({'supervisor_remark': 'Sila nyatakan sebab penolakan.'})
        if approve:
            staff_hr.check_leave_available(leave)
        leave.status = 'APPROVED' if approve else 'REJECTED'
        leave.supervisor_remark = f"{remark or ('Diluluskan' if approve else '')} ({display_name(request.user)})"
        leave.save()
        return Response(self.get_serializer(leave).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._decide(request, True)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._decide(request, False)
