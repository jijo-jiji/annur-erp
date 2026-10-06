"""Teacher attendance per class session and monthly pay calculated from it."""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import Teacher, TeacherAttendance, TeacherPayment

WEEKDAY_TO_DAY = {0: 'ISNIN', 1: 'SELASA', 2: 'RABU', 3: 'KHAMIS', 4: 'JUMAAT', 5: 'SABTU'}
# Pay for a month can still change until the Supervisor verifies it (or Management rejects it)
OPEN_PAY_STATUSES = ('DRAFT', 'REJECTED')


def month_start(value):
    if isinstance(value, date):
        return value.replace(day=1)
    try:
        year, month = str(value)[:7].split('-')
        return date(int(year), int(month), 1)
    except (TypeError, ValueError):
        raise ValidationError({'month': 'Bulan tidak sah (format YYYY-MM).'})


def month_end(month):
    return (month + timedelta(days=32)).replace(day=1) - timedelta(days=1)


def locked_teachers(on):
    """Teachers whose pay for the month of `on` is already verified, approved or paid."""
    return set(TeacherPayment.objects.filter(month=on.replace(day=1)).exclude(status__in=OPEN_PAY_STATUSES)
               .values_list('teacher_id', flat=True))


def roster(on):
    """Classes held on `on`: the weekly timetable for that weekday plus replacement / extra
    classes moved to that date, with anything already recorded."""
    from academic.calendar import closed_reason
    from academic.models import ClassTimetable, ClassRescheduleLog

    if closed_reason(on):
        return []  # the centre is closed: no classes are held

    classes = {c.id: c for c in ClassTimetable.objects.select_related('slot', 'subject', 'teacher', 'classroom')
               .filter(slot__day=WEEKDAY_TO_DAY.get(on.weekday(), '-'))}
    notes = defaultdict(list)
    logs = ClassRescheduleLog.objects.select_related(
        'timetable_class__slot', 'timetable_class__subject', 'timetable_class__teacher', 'timetable_class__classroom',
    ).filter(Q(tarikh_batal=on) | Q(tarikh_ganti=on)).exclude(status='REJECTED')
    for log in logs:
        if log.tarikh_batal == on:
            notes[log.timetable_class_id].append('Dijadual batal (catatan batal/ganti)')
        if log.tarikh_ganti == on:
            classes.setdefault(log.timetable_class_id, log.timetable_class)
            notes[log.timetable_class_id].append('Kelas tambahan' if log.is_extra_class else 'Kelas ganti')

    records = {a.timetable_class_id: a for a in TeacherAttendance.objects.select_related('teacher', 'replacement_teacher')
               .filter(date=on, timetable_class_id__in=classes)}
    locked = locked_teachers(on)
    rows = []
    for c in sorted(classes.values(), key=lambda c: (c.slot.start_time, c.class_code)):
        rec = records.get(c.id)
        rows.append({
            'class_id': c.id,
            'class_code': c.class_code,
            'subject': c.subject.name,
            'form_level': c.form_level,
            'time': f"{c.slot.start_time}-{c.slot.end_time}",
            'room': c.classroom.name if c.classroom else None,
            'teacher_id': rec.teacher_id if rec else c.teacher_id,
            'teacher_name': (rec.teacher if rec else c.teacher).full_name if (rec or c.teacher) else None,
            'notes': notes.get(c.id, []),
            'record': None if not rec else {
                'id': rec.id, 'status': rec.status, 'reason': rec.reason, 'remarks': rec.remarks,
                'replacement_teacher': rec.replacement_teacher_id, 'recorded_by': rec.recorded_by,
            },
            'locked': bool(rec and ({rec.teacher_id, rec.replacement_teacher_id} & locked)),
        })
    return rows


def rate_of(teacher_id, cache):
    if teacher_id not in cache:
        cache[teacher_id] = Teacher.objects.get(pk=teacher_id).rate_per_session
    return cache[teacher_id]


@transaction.atomic
def save_roster(on, marks, by):
    from academic.calendar import require_open
    from academic.models import ClassTimetable

    require_open(on)
    locked = locked_teachers(on)
    rates = {}
    saved = 0
    for mark in marks:
        try:
            cls = ClassTimetable.objects.select_related('subject').get(pk=int(mark.get('class_id')))
        except (TypeError, ValueError, ClassTimetable.DoesNotExist):
            raise ValidationError({'class_id': 'Kelas tidak dijumpai.'})
        status = mark.get('status')
        if status not in dict(TeacherAttendance.STATUS_CHOICES):
            raise ValidationError({'status': f"Status tidak sah untuk {cls.class_code}."})
        teacher_id = mark.get('teacher_id') or cls.teacher_id
        if not teacher_id:
            raise ValidationError({'teacher_id': f"{cls.class_code} tiada guru ditetapkan."})
        replacement = mark.get('replacement_teacher') or None
        if status == 'REPLACED' and not replacement:
            raise ValidationError({'replacement_teacher': f"Pilih guru ganti untuk {cls.class_code}."})
        if status == 'REPLACED' and int(replacement) == int(teacher_id):
            raise ValidationError({'replacement_teacher': 'Guru ganti mesti guru lain.'})
        if status in ('ABSENT', 'REPLACED') and not (mark.get('reason') or '').strip():
            raise ValidationError({'reason': f"Nyatakan sebab cuti guru untuk {cls.class_code}."})
        if status != 'REPLACED':
            replacement = None

        existing = TeacherAttendance.objects.filter(timetable_class=cls, date=on).first()
        involved = {int(teacher_id), int(replacement)} if replacement else {int(teacher_id)}
        if existing:
            involved |= {existing.teacher_id, existing.replacement_teacher_id} - {None}
        if involved & locked:
            raise ValidationError({'detail': f"Gaji bulan ini untuk guru {cls.class_code} sudah disahkan; kehadiran tidak boleh diubah."})

        paid = int(teacher_id) if status == 'PRESENT' else int(replacement) if status == 'REPLACED' else None
        TeacherAttendance.objects.update_or_create(
            timetable_class=cls, date=on,
            defaults={
                'teacher_id': teacher_id, 'class_label': cls.class_code, 'status': status,
                'reason': (mark.get('reason') or '').strip() if status in ('ABSENT', 'REPLACED') else '',
                'replacement_teacher_id': replacement, 'remarks': (mark.get('remarks') or '').strip(),
                'allowance_earned': rate_of(paid, rates) if paid else Decimal('0'),
                'recorded_by': by,
            },
        )
        saved += 1
    return saved


def month_summary(month):
    """Per teacher: sessions taught (own and as replacement), absences, and pay earned."""
    month = month_start(month)
    rows = defaultdict(lambda: {'taught': 0, 'as_replacement': 0, 'absent': 0, 'replaced': 0, 'cancelled': 0, 'amount': Decimal('0')})
    for a in TeacherAttendance.objects.filter(date__gte=month, date__lte=month_end(month)):
        own = rows[a.teacher_id]
        if a.status == 'PRESENT':
            own['taught'] += 1
        elif a.status == 'ABSENT':
            own['absent'] += 1
        elif a.status == 'CANCELLED':
            own['cancelled'] += 1
        elif a.status == 'REPLACED':
            own['replaced'] += 1
            rows[a.replacement_teacher_id]['as_replacement'] += 1
        if a.paid_teacher_id:
            rows[a.paid_teacher_id]['amount'] += a.allowance_earned
    teachers = Teacher.objects.in_bulk(list(rows))
    return sorted(({
        'teacher_id': tid, 'teacher_code': teachers[tid].teacher_code, 'name': teachers[tid].full_name,
        'teacher_type': teachers[tid].teacher_type, **row, 'sessions': row['taught'] + row['as_replacement'],
    } for tid, row in rows.items() if tid in teachers), key=lambda r: r['name'])


def sessions_for(teacher_id, month):
    """The paid sessions behind a teacher's monthly pay (shown on the payslip)."""
    month = month_start(month)
    qs = TeacherAttendance.objects.filter(date__gte=month, date__lte=month_end(month)).select_related('teacher')
    return [{
        'date': a.date, 'class_code': a.class_label, 'amount': a.allowance_earned,
        'role': 'Guru ganti' if a.status == 'REPLACED' else 'Guru kelas',
        'for_teacher': a.teacher.full_name if a.status == 'REPLACED' else '',
    } for a in qs.order_by('date', 'class_label') if a.paid_teacher_id == teacher_id]


@transaction.atomic
def calculate(month, by):
    """Create or refresh the month's DRAFT / REJECTED payments from attendance.
    Verified, approved and paid ones are left as they are."""
    month = month_start(month)
    summary = {r['teacher_id']: r for r in month_summary(month)}
    existing = {p.teacher_id: p for p in TeacherPayment.objects.select_for_update().filter(month=month)}
    now = timezone.now()
    updated, kept = 0, 0
    for tid in set(summary) | set(existing):
        row = summary.get(tid)
        payment = existing.get(tid)
        if payment and payment.status not in OPEN_PAY_STATUSES:
            kept += 1
            continue
        if not row or not row['sessions']:
            if payment:  # attendance was corrected and nothing is owed any more
                payment.delete()
            continue
        payment = payment or TeacherPayment(teacher_id=tid, month=month)
        payment.sessions = row['sessions']
        payment.calculated_amount = row['amount']
        payment.amount_payable = row['amount'] + payment.adjustment
        payment.status = 'DRAFT'
        payment.calculated_at = now
        payment.decided_by = ''
        payment.decided_at = None
        payment.save()
        updated += 1
    return {'month': month, 'updated': updated, 'kept': kept}


def adjust(payment, adjustment, note, remarks):
    if payment.status not in OPEN_PAY_STATUSES:
        raise ValidationError({'detail': 'Bayaran yang telah disahkan tidak boleh diubah.'})
    try:
        adjustment = Decimal(str(adjustment or 0))
    except Exception:
        raise ValidationError({'adjustment': 'Jumlah pelarasan tidak sah.'})
    if adjustment and not (note or '').strip():
        raise ValidationError({'adjustment_note': 'Nyatakan sebab pelarasan (kurang/lebih bayar).'})
    if payment.calculated_amount + adjustment < 0:
        raise ValidationError({'adjustment': 'Jumlah bayaran tidak boleh negatif.'})
    payment.adjustment = adjustment
    payment.adjustment_note = (note or '').strip()
    payment.remarks = (remarks or '').strip()
    payment.amount_payable = payment.calculated_amount + adjustment
    payment.save()


def verify(payment, by):
    if payment.status != 'DRAFT':
        raise ValidationError({'detail': 'Hanya bayaran draf boleh disahkan.'})
    payment.status = 'VERIFIED'
    payment.verified_by = by
    payment.verified_at = timezone.now()
    payment.save()


def decide(payment, by, approve, comment):
    if payment.status != 'VERIFIED':
        raise ValidationError({'detail': 'Bayaran mesti disahkan Supervisor dahulu.'})
    if not approve and not comment:
        raise ValidationError({'comment': 'Sila nyatakan sebab penolakan.'})
    payment.status = 'APPROVED' if approve else 'REJECTED'
    payment.decided_by = by
    payment.decided_at = timezone.now()
    payment.decision_comment = comment
    payment.save()


def mark_paid(payment, by, paid_date, method, reference):
    if payment.status != 'APPROVED':
        raise ValidationError({'detail': 'Hanya bayaran yang diluluskan boleh direkod sebagai dibayar.'})
    if method not in dict(TeacherPayment.METHOD_CHOICES):
        raise ValidationError({'payment_method': 'Pilih kaedah bayaran.'})
    payment.status = 'PAID'
    payment.paid_date = paid_date or date.today()
    payment.payment_method = method
    payment.payment_reference = reference or ''
    payment.paid_by = by
    payment.save()
