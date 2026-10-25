"""Which teachers and teaching sessions a dashboard or report figure counts, and the list it opens (see
students/drilldown.py). "Guru aktif" and "Permit hampir / telah luput" open the teacher list;
the sessions and allowance on Laporan open the sessions a teacher was paid for."""
from datetime import date, timedelta
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from students.drilldown import month_range, year_range
from .models import Teacher, TeacherAttendance

STATUSES = ('ACTIVE', 'INACTIVE')
PERMITS = ('EXPIRING', 'MISSING')


def teachers_matching(params, today=None, warning_days=None):
    """Teachers by status and teaching permit.

    status   ACTIVE | INACTIVE
    permit   EXPIRING: a permit already out or running out within the warning days (a setting)
             MISSING: no permit date recorded
    code     one teacher (their code)"""
    if warning_days is None:
        from core import thresholds
        warning_days = thresholds.value('permit_warning_days')
    today = today or date.today()
    qs = Teacher.objects.all()
    status = params.get('status')
    if status:
        if status not in STATUSES:
            raise ValidationError({'status': 'Status guru tidak dikenali.'})
        qs = qs.filter(is_active=status == 'ACTIVE')
    permit = params.get('permit')
    if permit:
        if permit not in PERMITS:
            raise ValidationError({'permit': 'Keadaan permit tidak dikenali.'})
        qs = qs.filter(teaching_permit_expiry=None) if permit == 'MISSING' else qs.filter(teaching_permit_expiry__lte=today + timedelta(days=warning_days))
    if params.get('code'):
        qs = qs.filter(teacher_code=params['code'])
    return qs


def paid_sessions(params):
    """The class sessions a teacher was paid for: the teacher who took the class, or the one who covered it.
    An absent teacher, a cancelled class and a cover nobody was named for are not sessions.

    teacher  a teacher's code (only their sessions)
    year     YYYY
    month    YYYY-MM"""
    qs = TeacherAttendance.objects.select_related('teacher', 'replacement_teacher').order_by('date', 'class_label')
    if params.get('teacher'):
        teacher = Teacher.objects.filter(teacher_code=params['teacher']).first()
        if not teacher:
            raise ValidationError({'teacher': 'Guru tidak dijumpai.'})
        qs = qs.filter(Q(status='PRESENT', teacher=teacher) | Q(status='REPLACED', replacement_teacher=teacher))
    else:
        qs = qs.filter(Q(status='PRESENT') | Q(status='REPLACED', replacement_teacher__isnull=False))
    if params.get('year'):
        first, after = year_range(params['year'], 'year')
        qs = qs.filter(date__gte=first, date__lt=after)
    if params.get('month'):
        first, after = month_range(params['month'], 'month')
        qs = qs.filter(date__gte=first, date__lt=after)
    return qs
