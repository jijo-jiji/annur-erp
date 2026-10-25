"""Which students a dashboard figure counts, and the list it opens.

A figure on Ringkasan or Laporan opens the list behind it (see DRILLDOWN_PLAN.md). The count on the dashboard and
the list use the same definitions from this module, so the number someone clicks is the number of rows they see.
The list is `GET /students/students/matching/?status=...`; the dashboard imports the same constants and helpers,
and a test checks that every student figure equals the length of the list it opens."""
from datetime import date, timedelta
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from .models import Lead, Student, StudentEvent

# Registered students (approved). PENDING and REJECTED registrations are not counted as students yet.
REGISTERED_STATUSES = ('ACTIVE', 'ON_HOLD', 'TERMINATED')
STATUS_GROUPS = {
    'ACTIVE': ('ACTIVE',),
    'ON_HOLD': ('ON_HOLD',),
    'INACTIVE': ('TERMINATED',),
    'REGISTERED': REGISTERED_STATUSES,
    'PENDING': ('PENDING',),
}
# Length of study: key, label, from day, up to (not including) day
STAY_BUCKETS = [
    ('lt3', '< 3 bulan', 0, 90),
    ('3to6', '3 - 6 bulan', 90, 182),
    ('6to12', '6 - 12 bulan', 182, 365),
    ('1to2', '1 - 2 tahun', 365, 730),
    ('gt2', '> 2 tahun', 730, None),
]
STUDENT_TYPES = ('MONTHLY', 'WALK_IN')
NO_CATEGORY = 'NONE'  # students whose school has no category


def month_range(text, field):
    """'2026-10' -> (first day of that month, first day of the next)"""
    try:
        year, month = (int(part) for part in str(text).split('-'))
        first = date(year, month, 1)
    except (TypeError, ValueError):
        raise ValidationError({field: 'Bulan tidak sah (gunakan TTTT-BB).'})
    return first, (first + timedelta(days=32)).replace(day=1)


def year_range(text, field):
    """'2026' -> (1 January 2026, 1 January 2027)"""
    try:
        year = int(text)
        first = date(year, 1, 1)
    except (TypeError, ValueError):
        raise ValidationError({field: 'Tahun tidak sah.'})
    return first, date(year + 1, 1, 1)


def parse_day(text, field):
    try:
        return date.fromisoformat(str(text))
    except ValueError:
        raise ValidationError({field: 'Tarikh tidak sah (gunakan TTTT-BB-HH).'})


def stay_days(join, left, today):
    return ((left or today) - join).days


def stay_key(days):
    for key, _, low, high in STAY_BUCKETS:
        if days >= low and (high is None or days < high):
            return key
    return None


def stay_ids(key, today):
    """Registered students whose length of study (join to leaving day, or to today) is in the bucket."""
    if key not in {k for k, *_ in STAY_BUCKETS}:
        raise ValidationError({'stay': 'Tempoh belajar tidak dikenali.'})
    rows = Student.objects.filter(status__in=REGISTERED_STATUSES).values_list('id', 'join_date', 'left_date')
    return [pk for pk, join, left in rows if stay_key(stay_days(join, left, today)) == key]


def uninvoiced_students(month_first):
    """Active monthly students with classes but no invoice yet for the month: what 'Jana invois' is for."""
    from billing.models import Invoice
    invoiced = Invoice.objects.filter(billing_month=month_first).exclude(invoice_type='OTHER').values('student_id')
    return (Student.objects.filter(status='ACTIVE', student_type='MONTHLY', enrolled_classes__isnull=False)
            .exclude(id__in=invoiced).distinct())


def events_matching(params):
    """Student history (Laporan sejarah): the report, and the figures on Laporan that count its rows.

    student  one student's history (their id)
    type     one or more event types, comma separated (for example DROP_SUBJECT,TERMINATE)
    start, end  YYYY-MM-DD, inclusive
    reason   a drop-reason code; NONE for events where no reason was given"""
    qs = StudentEvent.objects.select_related('student')
    if params.get('student'):
        qs = qs.filter(student_id=params['student'])
    if params.get('type'):
        types = params['type'].split(',')
        if set(types) - {code for code, _ in StudentEvent.TYPE_CHOICES}:
            raise ValidationError({'type': 'Jenis peristiwa tidak dikenali.'})
        qs = qs.filter(event_type__in=types)
    if params.get('start'):
        qs = qs.filter(event_date__gte=parse_day(params['start'], 'start'))
    if params.get('end'):
        qs = qs.filter(event_date__lte=parse_day(params['end'], 'end'))
    if params.get('reason'):
        qs = qs.filter(reason_code='' if params['reason'] == NO_CATEGORY else params['reason'])
    return qs


def leads_matching(params, today=None):
    """Prospects (Pertanyaan & prospek).

    due   1: still open, with a follow-up date of today or earlier"""
    today = today or date.today()
    qs = Lead.objects.all()
    if params.get('due'):
        qs = qs.exclude(status__in=Lead.CLOSED_STAGES).filter(next_follow_up__lte=today)
    return qs


def students_matching(params, today=None):
    """Students that match the filters in `params` (a QueryDict or dict). With no filters: every student.

    status         ACTIVE | ON_HOLD | INACTIVE | REGISTERED (the three together) | PENDING
    type           MONTHLY | WALK_IN
    form           grade code, e.g. F5
    school_category  a category, or NONE for students whose school has none
    joined / left  YYYY-MM: joined / left in that month
    as_at          YYYY-MM-DD: registered students on the books that day
    stay           length of study bucket (lt3, 3to6, 6to12, 1to2, gt2)
    uninvoiced     YYYY-MM: active monthly students with classes and no invoice for that month
    subject        subject code: students enrolled in a class of that subject

    The date filters count registered students, as the dashboard does, unless a status is given."""
    today = today or date.today()
    qs = Student.objects.all()
    status = params.get('status')
    if status:
        if status not in STATUS_GROUPS:
            raise ValidationError({'status': 'Status tidak dikenali.'})
        qs = qs.filter(status__in=STATUS_GROUPS[status])
    elif any(params.get(k) for k in ('as_at', 'joined', 'left', 'stay')):
        qs = qs.filter(status__in=REGISTERED_STATUSES)

    if params.get('type'):
        if params['type'] not in STUDENT_TYPES:
            raise ValidationError({'type': 'Jenis pelajar tidak dikenali.'})
        qs = qs.filter(student_type=params['type'])
    if params.get('form'):
        qs = qs.filter(form_level=params['form'])
    if params.get('school_category'):
        qs = qs.filter(school_category='' if params['school_category'] == NO_CATEGORY else params['school_category'])
    if params.get('joined'):
        first, after = month_range(params['joined'], 'joined')
        qs = qs.filter(join_date__gte=first, join_date__lt=after)
    if params.get('left'):
        first, after = month_range(params['left'], 'left')
        qs = qs.filter(left_date__gte=first, left_date__lt=after)
    if params.get('as_at'):
        day = parse_day(params['as_at'], 'as_at')
        qs = qs.filter(join_date__lte=day).filter(Q(left_date__isnull=True) | Q(left_date__gt=day))
    if params.get('stay'):
        qs = qs.filter(id__in=stay_ids(params['stay'], today))
    if params.get('uninvoiced'):
        first, _ = month_range(params['uninvoiced'], 'uninvoiced')
        qs = qs.filter(id__in=uninvoiced_students(first).values('id'))
    if params.get('subject'):
        qs = qs.filter(id__in=Student.objects.filter(enrolled_classes__subject__code=params['subject']).values('id'))
    return qs
