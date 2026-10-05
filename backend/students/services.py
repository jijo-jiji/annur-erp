"""Student lifecycle actions. Each one updates the student and writes its history entry together."""
from datetime import date
from decimal import Decimal
from django.db import transaction
from rest_framework.exceptions import ValidationError
from academic.models import ClassTimetable
from billing import services as billing_services
from billing.models import Invoice
from business_config.models import BusinessSetting, PricingTier
from core import grades, numbering
from . import leads
from .models import Student, StudentEvent, ClassWaitlist



def log(student, event_type, by, on=None, **fields):
    return StudentEvent.objects.create(
        student=student, event_type=event_type, event_date=on or date.today(), recorded_by=by, **fields
    )


def is_full(cls):
    return ClassTimetable.with_enrolment().get(pk=cls.pk).available_seats <= 0


def enroll(student, cls, by, on=None, allow_over_capacity=False):
    """Add a class. A full class puts the student on its waiting list instead."""
    if student.enrolled_classes.filter(pk=cls.pk).exists():
        return 'ALREADY'
    if is_full(cls) and not allow_over_capacity:
        _, created = ClassWaitlist.objects.get_or_create(student=student, timetable_class=cls, status='WAITING')
        if created:
            log(student, 'WAITLIST', by, on, timetable_class=cls, class_label=cls.class_code)
        return 'WAITLISTED'
    student.enrolled_classes.add(cls)
    ClassWaitlist.objects.filter(student=student, timetable_class=cls, status='WAITING').update(status='ENROLLED', resolved_by=by)
    log(student, 'ADD_SUBJECT', by, on, timetable_class=cls, class_label=cls.class_code)
    return 'ENROLLED'


@transaction.atomic
def drop(student, cls, by, reason_code, reason_text='', on=None):
    if not reason_code:
        raise ValidationError({'reason_code': 'Sebab gugur subjek wajib dipilih.'})
    if not student.enrolled_classes.filter(pk=cls.pk).exists():
        raise ValidationError({'class_id': 'Pelajar tidak berdaftar dalam kelas ini.'})
    student.enrolled_classes.remove(cls)
    log(student, 'DROP_SUBJECT', by, on, timetable_class=cls, class_label=cls.class_code,
        reason_code=reason_code, reason_text=reason_text)


@transaction.atomic
def change_class(student, from_cls, to_cls, by, reason_text='', on=None):
    if not student.enrolled_classes.filter(pk=from_cls.pk).exists():
        raise ValidationError({'from_class': 'Pelajar tidak berdaftar dalam kelas asal.'})
    student.enrolled_classes.remove(from_cls)
    student.enrolled_classes.add(to_cls)
    log(student, 'CHANGE_CLASS', by, on, timetable_class=to_cls, from_class=from_cls,
        class_label=f"{from_cls.class_code} -> {to_cls.class_code}", reason_text=reason_text)


@transaction.atomic
def hold(student, by, start, until, reason_text):
    if student.status != 'ACTIVE':
        raise ValidationError({'detail': 'Hanya pelajar aktif boleh ditangguhkan.'})
    if not until or until < start:
        raise ValidationError({'until': 'Tarikh tamat tangguh mesti selepas tarikh mula.'})
    student.status = 'ON_HOLD'
    student.on_hold_until = until
    student.save(update_fields=['status', 'on_hold_until'])
    log(student, 'ON_HOLD', by, start, hold_until=until, reason_text=reason_text)


@transaction.atomic
def resume(student, by, on=None):
    if student.status != 'ON_HOLD':
        raise ValidationError({'detail': 'Pelajar ini tidak dalam status tangguh.'})
    student.status = 'ACTIVE'
    student.on_hold_until = None
    student.save(update_fields=['status', 'on_hold_until'])
    log(student, 'RESUME', by, on)


@transaction.atomic
def terminate(student, by, reason_code, reason_text='', on=None):
    if not reason_code:
        raise ValidationError({'reason_code': 'Sebab berhenti wajib dipilih.'})
    if student.status not in ('ACTIVE', 'ON_HOLD'):
        raise ValidationError({'detail': 'Hanya pelajar aktif atau ditangguh boleh diberhentikan.'})
    on = on or date.today()
    classes = list(student.enrolled_classes.all())
    student.enrolled_classes.clear()  # free the seats
    ClassWaitlist.objects.filter(student=student, status='WAITING').update(status='CANCELLED', resolved_by=by)
    student.status = 'TERMINATED'
    student.left_date = on
    student.on_hold_until = None
    student.save(update_fields=['status', 'left_date', 'on_hold_until'])
    log(student, 'TERMINATE', by, on, reason_code=reason_code, reason_text=reason_text,
        class_label=', '.join(c.class_code for c in classes))


def monthly_fee(student):
    """Monthly fee from Management's pricing tiers, or the student's special rate."""
    if student.special_monthly_fee is not None:
        return Decimal(student.special_monthly_fee)
    count = student.enrolled_classes.count()
    if count == 0:
        return Decimal('0')
    level = grades.by_code().get(student.form_level, {}).get('fee_group', '')
    if not level:
        return Decimal('0')  # the grade has no fee package yet
    tiers = list(PricingTier.objects.filter(level_category=level).order_by('subject_count'))
    exact = next((t for t in tiers if t.subject_count == count), None)
    if exact:
        return Decimal(exact.total_price)
    if not tiers:
        return Decimal('0')
    # Below the smallest or above the largest package: use that package's per-subject rate
    nearest = tiers[0] if count < tiers[0].subject_count else tiers[-1]
    return Decimal(nearest.price_per_subject) * count


def create_first_invoice(student, on=None):
    """Registration fee plus the first month, raised when the registration is approved."""
    if student.student_type == 'WALK_IN':
        return None  # walk-in students pay per session
    on = on or date.today()
    reg_setting = BusinessSetting.objects.filter(key='REGISTRATION_FEE').first()
    reg_fee = Decimal(reg_setting.value) if reg_setting else Decimal('0')
    fee = monthly_fee(student)
    total = fee + reg_fee
    return Invoice.objects.create(
        invoice_number=numbering.invoice_number(Invoice, on),
        student=student,
        billing_month=on.replace(day=1),
        registration_fee=reg_fee,
        monthly_fee=fee,
        discount_remarks=student.special_fee_note if student.special_monthly_fee is not None else '',
        total_payable=total,
        total_paid=0,
        balance_due=total,
        status='UNPAID',
        invoice_type='FIRST',
        # Normally due on the monthly due day; a registration after that day gets 7 days to pay
        due_date=billing_services.due_date_for(on.replace(day=1), on),
    )


@transaction.atomic
def register(student, by, classes, on=None):
    """New registrations wait for Supervisor approval. Seats are reserved immediately."""
    on = on or date.today()
    log(student, 'REGISTERED', by, on)
    results = {cls.pk: enroll(student, cls, by, on) for cls in classes}
    return results


@transaction.atomic
def decide_registration(student, by, approve, comment=''):
    if student.status != 'PENDING':
        raise ValidationError({'detail': 'Pendaftaran ini telah diproses.'})
    if not approve and not comment:
        raise ValidationError({'comment': 'Sila nyatakan sebab penolakan.'})
    student.registration_comment = comment
    student.registration_decided_by = by
    if approve:
        student.status = 'ACTIVE'
        student.save(update_fields=['status', 'registration_comment', 'registration_decided_by'])
        log(student, 'APPROVED', by, description=comment)
        leads.registration_decided(student, by, True, comment)
        return create_first_invoice(student)
    # A rejected registration gives its seats and waiting-list places back
    student.enrolled_classes.clear()
    ClassWaitlist.objects.filter(student=student, status='WAITING').update(status='CANCELLED', resolved_by=by)
    student.status = 'REJECTED'
    student.save(update_fields=['status', 'registration_comment', 'registration_decided_by'])
    log(student, 'REJECTED', by, reason_text=comment)
    leads.registration_decided(student, by, False, comment)
    return None


def promote(by, dry_run=True, remove_old_classes=True, on=None):
    """Year-end move of active students to their grade's next grade (master data 1_form).
    Grades without a next grade (e.g. Tingkatan 5) are left as they are."""
    from core import grades
    on = on or date.today()
    grade_map = grades.by_code()
    rows = []
    students = Student.objects.filter(status__in=('ACTIVE', 'ON_HOLD')).prefetch_related('enrolled_classes__subject', 'enrolled_classes__teacher')
    for student in students.order_by('form_level', 'full_name'):
        grade = grade_map.get(student.form_level)
        next_code = grade['next'] if grade else ''
        row = {'student_id': student.id, 'student_code': student.student_id, 'name': student.full_name,
               'from': student.form_level, 'from_label': grade['label'] if grade else student.form_level}
        if not next_code or next_code not in grade_map:
            rows.append({**row, 'result': 'UNCHANGED', 'reason': 'Tiada gred seterusnya (tamat)' if grade else 'Gred tiada dalam senarai'})
            continue
        old_classes = [c for c in student.enrolled_classes.all() if c.form_level == student.form_level]
        row.update({'to': next_code, 'to_label': grade_map[next_code]['label'],
                    'classes_removed': [c.class_code for c in old_classes] if remove_old_classes else []})
        if dry_run:
            rows.append({**row, 'result': 'READY'})
            continue
        with transaction.atomic():
            student.form_level = next_code
            student.save(update_fields=['form_level'])
            if remove_old_classes and old_classes:
                student.enrolled_classes.remove(*old_classes)
                ClassWaitlist.objects.filter(student=student, status='WAITING', timetable_class__in=old_classes)\
                    .update(status='CANCELLED', resolved_by=by)
            log(student, 'PROMOTE', by, on,
                description=f"{row['from_label']} → {row['to_label']}",
                class_label=', '.join(row['classes_removed'])[:100])
        rows.append({**row, 'result': 'PROMOTED'})
    return {
        'dry_run': dry_run,
        'ready': sum(1 for r in rows if r['result'] == 'READY'),
        'promoted': sum(1 for r in rows if r['result'] == 'PROMOTED'),
        'unchanged': sum(1 for r in rows if r['result'] == 'UNCHANGED'),
        'rows': rows,
    }
