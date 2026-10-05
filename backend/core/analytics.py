"""Dashboard and report figures, computed from stored records only."""
from collections import defaultdict
from datetime import date, timedelta
from django.db.models import Count, Q, Sum
from academic.models import ClassTimetable, ClassRescheduleLog, TimetableChange
from billing.models import Invoice, PaymentReceipt
from business_config.models import DynamicMasterData
from expenses.models import PaymentVoucher
from students.models import Student, StudentExamResult, StudentEvent, ClassWaitlist, Lead
from students.views import attendance_rates
from teachers.staff import alerts as staff_alerts
from teachers.models import Teacher, TeacherAttendance, LeaveRequest, TeacherRateIncrement, TeacherPayment
from . import change_requests, grades
from .models import ChangeRequest
from .permissions import ADMIN, MANAGEMENT

LEVEL_LABELS = {'UPPER': 'Menengah Atas', 'LOWER': 'Menengah Rendah', 'PRIMARY': 'Sekolah Rendah'}


def form_order(present):
    """Grades highest first (from master data), then any older codes still in use."""
    order = grades.display_order()
    return order + sorted(set(present) - set(order))
COUNTED_PV_STATUSES = ('VERIFIED_ADMIN', 'APPROVED_SUPERVISOR', 'APPROVED_MANAGEMENT')
LOW_GRADES = ('D', 'E', 'F', 'G', 'TH')
PERMIT_WARNING_DAYS = 60
NEARLY_FULL_SEATS = 2
LOW_ATTENDANCE_PCT = 70
ATTENDANCE_WINDOW_DAYS = 30
# Registered students (approved); PENDING and REJECTED registrations are not counted as students yet
REGISTERED_STATUSES = ('ACTIVE', 'ON_HOLD', 'TERMINATED')
STAY_BUCKETS = [
    ('< 3 bulan', 0, 90),
    ('3 - 6 bulan', 90, 182),
    ('6 - 12 bulan', 182, 365),
    ('1 - 2 tahun', 365, 730),
    ('> 2 tahun', 730, None),
]


def month_end(year, month):
    return (date(year, month, 1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)


def student_trends(year, today):
    """Per month: students registered at month end, new registrations, and students who left."""
    rows = list(Student.objects.filter(status__in=REGISTERED_STATUSES).values_list('join_date', 'left_date'))
    months = []
    for m in range(1, 13):
        end = month_end(year, m)
        start = end.replace(day=1)
        if start > today:
            months.append({'month': m, 'total': None, 'new': None, 'left': None})
            continue
        months.append({
            'month': m,
            'total': sum(1 for j, l in rows if j <= end and (l is None or l > end)),
            'new': sum(1 for j, _ in rows if start <= j <= end),
            'left': sum(1 for _, l in rows if l and start <= l <= end),
        })
    return months


def period_of_stay(today):
    counts = {label: 0 for label, _, _ in STAY_BUCKETS}
    for join, left in Student.objects.filter(status__in=REGISTERED_STATUSES).values_list('join_date', 'left_date'):
        days = ((left or today) - join).days
        for label, low, high in STAY_BUCKETS:
            if days >= low and (high is None or days < high):
                counts[label] += 1
                break
    return [{'label': label, 'count': counts[label]} for label, _, _ in STAY_BUCKETS]


def monthly_invoices_pending(today):
    """Active monthly students with classes but no invoice yet for this month."""
    month = today.replace(day=1)
    invoiced = Invoice.objects.filter(billing_month=month).exclude(invoice_type='OTHER').values('student_id')
    return (Student.objects.filter(status='ACTIVE', student_type='MONTHLY', enrolled_classes__isnull=False)
            .exclude(id__in=invoiced).distinct().count())


def money(value):
    return float(value or 0)


def growth_pct(current, previous):
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def month_bounds(d):
    start = d.replace(day=1)
    next_start = (start + timedelta(days=32)).replace(day=1)
    return start, next_start


def class_row(c):
    return {
        'id': c.id,
        'class_code': c.class_code,
        'enrolled': c.enrolled_count,
        'max_seats': c.max_seats,
        'available_seats': c.available_seats,
        'teacher': c.teacher.full_name if c.teacher else None,
        'day': c.slot.day,
        'time': c.slot.period_label,
        'room': c.classroom.name if c.classroom else None,
    }


def by_kind(qs):
    return {row['kind']: row['n'] for row in qs.values('kind').annotate(n=Count('id'))}


def build_dashboard(role, today=None, user=None):
    today = today or date.today()
    month_start, next_month = month_bounds(today)
    prev_start, _ = month_bounds(month_start - timedelta(days=1))

    students = Student.objects.filter(status__in=REGISTERED_STATUSES)
    active = students.filter(status='ACTIVE')

    by_form = {row['form_level']: row['n'] for row in active.values('form_level').annotate(n=Count('id'))}
    form_labels = {code: g['label'] for code, g in grades.by_code().items()}
    new_this = students.filter(join_date__gte=month_start, join_date__lt=next_month).count()
    new_last = students.filter(join_date__gte=prev_start, join_date__lt=month_start).count()

    subjects_by_form = defaultdict(lambda: defaultdict(int))
    for form, subject in active.values_list('form_level', 'enrolled_classes__subject__name'):
        if subject:
            subjects_by_form[form][subject] += 1

    # Classes: seats come from real enrolments
    classes = list(ClassTimetable.with_enrolment().select_related('slot', 'subject', 'teacher', 'classroom'))
    over = [class_row(c) for c in classes if c.available_seats < 0]
    full = [class_row(c) for c in classes if c.available_seats == 0]
    near_full = [class_row(c) for c in classes if 0 < c.available_seats <= NEARLY_FULL_SEATS]

    receipts = PaymentReceipt.objects.all()
    collected_today = receipts.filter(payment_date=today).aggregate(t=Sum('amount_paid'))['t']
    collected_month = receipts.filter(payment_date__gte=month_start, payment_date__lt=next_month).aggregate(t=Sum('amount_paid'))['t']
    collected_prev = receipts.filter(payment_date__gte=prev_start, payment_date__lt=month_start).aggregate(t=Sum('amount_paid'))['t']
    outstanding = Invoice.objects.filter(status__in=['UNPAID', 'PARTIAL', 'OVERDUE']).aggregate(t=Sum('balance_due'))['t']
    collection_status = [
        {'status': row['status'], 'count': row['n'], 'billed': money(row['billed']), 'balance': money(row['balance'])}
        for row in Invoice.objects.values('status').annotate(n=Count('id'), billed=Sum('total_payable'), balance=Sum('balance_due'))
    ]
    expenses_month = PaymentVoucher.objects.filter(
        date__gte=month_start, date__lt=next_month, status__in=COUNTED_PV_STATUSES
    ).aggregate(t=Sum('amount'))['t']

    teachers = Teacher.objects.filter(is_active=True)
    permits_expiring = []
    for t in teachers.exclude(teaching_permit_expiry=None).order_by('teaching_permit_expiry'):
        days_left = (t.teaching_permit_expiry - today).days
        if days_left <= PERMIT_WARNING_DAYS:
            permits_expiring.append({
                'code': t.teacher_code, 'name': t.full_name,
                'expiry': t.teaching_permit_expiry, 'days_left': days_left,
            })

    pending_pv = PaymentVoucher.objects.filter(status__in=['PENDING_SUPERVISOR', 'PENDING_MANAGEMENT']).select_related('vendor')
    if role == MANAGEMENT:
        my_pv = pending_pv
    elif role == ADMIN:
        my_pv = pending_pv.none()
    else:
        my_pv = pending_pv.filter(status='PENDING_SUPERVISOR')

    # Change requests: what this role can decide, what the user asked that still waits, and decisions not yet read
    to_decide = ChangeRequest.objects.filter(status='PENDING', kind__in=change_requests.kinds_decided_by(role))
    my_pending = ChangeRequest.objects.filter(status='PENDING', requested_by=user) if user else ChangeRequest.objects.none()
    unseen_decisions = ChangeRequest.objects.filter(requested_by=user, seen=False).exclude(status='PENDING') if user else ChangeRequest.objects.none()

    approvals = {
        'change_requests_pending': to_decide.count(),
        'change_requests_mine_pending': my_pending.count(),
        'change_requests_unseen': unseen_decisions.count(),
        # The same, per kind of request, so each notice can link to the page where it is handled
        'change_requests_to_decide_by_kind': by_kind(to_decide),
        'change_requests_mine_by_kind': by_kind(my_pending),
        'change_requests_unseen_by_kind': by_kind(unseen_decisions),
        'vouchers_pending_supervisor': pending_pv.filter(status='PENDING_SUPERVISOR').count(),
        'vouchers_pending_management': pending_pv.filter(status='PENDING_MANAGEMENT').count(),
        'leave_pending': LeaveRequest.objects.filter(status='PENDING').count(),
        'master_data_pending': DynamicMasterData.objects.filter(status='PENDING').count(),
        'reschedules_pending': ClassRescheduleLog.objects.filter(status='PENDING').count(),
        'reschedules_to_verify': ClassRescheduleLog.objects.filter(status='APPROVED', verified_by='').count() if role == MANAGEMENT else 0,
        'timetable_changes_pending': TimetableChange.objects.filter(status='PENDING').count() if role != ADMIN else 0,
        'rate_increments_pending': TeacherRateIncrement.objects.filter(status='PENDING').count() if role != ADMIN else 0,
        'registrations_pending': Student.objects.filter(status='PENDING').count(),
        'waitlist_waiting': ClassWaitlist.objects.filter(status='WAITING').count(),
        'monthly_invoices_pending': monthly_invoices_pending(today),
        # Teacher pay is hidden from Admin
        'teacher_pay_to_verify': TeacherPayment.objects.filter(status='DRAFT').count() if role != ADMIN else 0,
        'teacher_pay_to_approve': TeacherPayment.objects.filter(status='VERIFIED').count() if role != ADMIN else 0,
        'teacher_pay_to_record': TeacherPayment.objects.filter(status='APPROVED').count() if role != ADMIN else 0,
        'lead_followups_due': Lead.objects.exclude(status__in=Lead.CLOSED_STAGES).filter(next_follow_up__lte=today).count(),
    }

    attendance_window = attendance_rates(today - timedelta(days=ATTENDANCE_WINDOW_DAYS), today)
    attendance_present = sum(r['present'] for r in attendance_window)
    attendance_total = sum(r['total'] for r in attendance_window)

    recent_reschedules = [{
        'id': r.id,
        'class_code': r.timetable_class.class_code,
        'batal': r.tarikh_batal,
        'ganti': r.tarikh_ganti,
        'remarks': r.remarks,
        'is_extra': r.is_extra_class,
        'approved': r.supervisor_approved,
    } for r in ClassRescheduleLog.objects.select_related('timetable_class__subject', 'timetable_class__teacher').order_by('-created_at')[:5]]

    return {
        'today': today,
        'students': {
            'total': students.count(),
            'active': active.count(),
            'active_monthly': active.filter(student_type='MONTHLY').count(),
            'walk_in': active.filter(student_type='WALK_IN').count(),
            'on_hold': students.filter(status='ON_HOLD').count(),
            'inactive': students.filter(status='TERMINATED').count(),
            'by_form': [
                {'form': f, 'label': form_labels.get(f, f), 'count': by_form.get(f, 0)}
                for f in form_order(by_form) if by_form.get(f)
            ],
            'by_school_category': [
                {'category': row['school_category'] or 'Tidak dinyatakan', 'count': row['n']}
                for row in active.values('school_category').annotate(n=Count('id')).order_by('-n')
            ],
            'subjects_by_form': [
                {'form': f, 'label': form_labels.get(f, f),
                 'subjects': sorted(({'subject': k, 'count': v} for k, v in subjects_by_form[f].items()), key=lambda x: -x['count'])}
                for f in form_order(subjects_by_form) if f in subjects_by_form
            ],
            'new_this_month': new_this,
            'new_last_month': new_last,
            'new_growth_pct': growth_pct(new_this, new_last),
            'pending': approvals['registrations_pending'],
            'trend_this_year': student_trends(today.year, today),
            'trend_last_year': student_trends(today.year - 1, today),
            'period_of_stay': period_of_stay(today),
        },
        'attendance': {
            'window_days': ATTENDANCE_WINDOW_DAYS,
            'rate': round(attendance_present / attendance_total * 100, 1) if attendance_total else None,
            'present': attendance_present,
            'total': attendance_total,
            'low_classes': [r for r in attendance_window if r['rate'] is not None and r['rate'] < LOW_ATTENDANCE_PCT],
            'threshold': LOW_ATTENDANCE_PCT,
        },
        'finance': {
            'collected_today': money(collected_today),
            'collected_this_month': money(collected_month),
            'collected_last_month': money(collected_prev),
            'sales_growth_pct': growth_pct(money(collected_month), money(collected_prev)),
            'outstanding': money(outstanding),
            'collection_status': collection_status,
            'expenses_this_month': money(expenses_month),
        },
        'classes': {
            'total': len(classes),
            'over': over,
            'full': full,
            'near_full': near_full,
        },
        'teachers': {
            'active': teachers.count(),
            'permanent': teachers.filter(teacher_type='PERMANENT').count(),
            'replacement': teachers.filter(teacher_type='REPLACEMENT').count(),
            'permits_expiring': permits_expiring,
            'permits_missing': teachers.filter(teaching_permit_expiry=None).count(),
        },
        # Staff alerts: contract ending within a month and birthdays this week (not shown to Admin)
        'staff': staff_alerts(today) if role != ADMIN else {'contracts_ending': [], 'birthdays': []},
        'approvals': approvals,
        'pending_vouchers': [{
            'id': pv.id, 'pv_number': pv.pv_number, 'amount': money(pv.amount),
            'vendor': pv.vendor.vendor_name if pv.vendor else None,
            'category': pv.category, 'status': pv.status, 'items': pv.items_description,
        } for pv in my_pv[:5]],
        'recent_reschedules': recent_reschedules,
    }


def result_improvement():
    """Change in mark 3, 6 and 9 months after each student's first result in a subject."""
    series = defaultdict(list)
    for r in StudentExamResult.objects.exclude(mark=None).exclude(exam_date=None).select_related('student', 'subject'):
        series[(r.student_id, r.subject_id)].append(r)
    buckets = {3: [], 6: [], 9: []}
    per_student = []
    for results in series.values():
        results.sort(key=lambda r: r.exam_date)
        base = results[0]
        row = {'student': base.student.full_name, 'student_id': base.student.student_id, 'subject': base.subject.name,
               'baseline': base.mark, 'baseline_date': base.exam_date}
        for months in (3, 6, 9):
            later = next((r for r in results if (r.exam_date - base.exam_date).days >= months * 30), None)
            row[f'm{months}'] = later.mark if later else None
            if later:
                buckets[months].append(later.mark - base.mark)
        if len(results) > 1:
            per_student.append(row)
    summary = [{
        'months': m,
        'pairs': len(v),
        'avg_change': round(sum(v) / len(v), 1) if v else None,
        'improved_pct': round(sum(1 for x in v if x > 0) / len(v) * 100, 1) if v else None,
    } for m, v in buckets.items()]
    return {'summary': summary, 'students': per_student}


def build_reports(year):
    receipts = PaymentReceipt.objects.filter(payment_date__year=year).select_related('student')
    invoices = Invoice.objects.filter(billing_month__year=year)

    months = [{'month': m, 'billed': 0.0, 'collected': 0.0, 'walk_in_collected': 0.0, 'expenses': 0.0} for m in range(1, 13)]
    for inv in invoices.values('billing_month__month').annotate(t=Sum('total_payable')):
        months[inv['billing_month__month'] - 1]['billed'] = money(inv['t'])

    by_form = defaultdict(lambda: {'amount': 0.0, 'students': set()})
    by_level = defaultdict(float)
    for r in receipts:
        m = months[r.payment_date.month - 1]
        m['collected'] += money(r.amount_paid)
        if r.student.student_type == 'WALK_IN':
            m['walk_in_collected'] += money(r.amount_paid)
        form = r.student.form_level
        by_form[form]['amount'] += money(r.amount_paid)
        by_form[form]['students'].add(r.student_id)
        by_level[grades.level_of(form)] += money(r.amount_paid)

    vouchers = PaymentVoucher.objects.filter(date__year=year, status__in=COUNTED_PV_STATUSES)
    for pv in vouchers.values('date__month').annotate(t=Sum('amount')):
        months[pv['date__month'] - 1]['expenses'] = money(pv['t'])

    total_collected = sum(m['collected'] for m in months)

    # Teacher sessions from attendance: the teacher present, or the replacement who covered
    teacher_rows = defaultdict(lambda: {'sessions': 0, 'allowance': 0.0})
    teacher_info = {t.id: t for t in Teacher.objects.all()}
    for a in TeacherAttendance.objects.filter(date__year=year):
        taught_by = a.replacement_teacher_id if a.status == 'REPLACED' else (a.teacher_id if a.status == 'PRESENT' else None)
        if taught_by:
            teacher_rows[taught_by]['sessions'] += 1
            teacher_rows[taught_by]['allowance'] += money(a.allowance_earned)
    teacher_payments = sorted(({
        'code': teacher_info[tid].teacher_code,
        'name': teacher_info[tid].full_name,
        'type': teacher_info[tid].teacher_type,
        'rate': money(teacher_info[tid].rate_per_session),
        'sessions': row['sessions'],
        'allowance': row['allowance'],
    } for tid, row in teacher_rows.items()), key=lambda x: -x['allowance'])

    # Latest result per student and subject; keep the weak ones
    latest = {}
    for res in StudentExamResult.objects.select_related('student', 'subject').order_by('date_recorded', 'id'):
        latest[(res.student_id, res.subject_id)] = res
    at_risk = [{
        'student_id': r.student.student_id, 'name': r.student.full_name, 'form': r.student.form_level,
        'subject': r.subject.name, 'exam': r.exam_name, 'grade': r.grade, 'mark': r.mark,
    } for r in latest.values() if r.grade.upper().rstrip('+-') in LOW_GRADES and r.student.status == 'ACTIVE']

    # Drop reasons (subject drops and students who left), labelled from master data
    reason_labels = dict(DynamicMasterData.objects.filter(category='14_drop_reason').values_list('code', 'label'))
    drops = StudentEvent.objects.filter(event_type__in=['DROP_SUBJECT', 'TERMINATE'], event_date__year=year)
    drop_reasons = [
        {'code': r['reason_code'], 'label': reason_labels.get(r['reason_code'], r['reason_code'] or 'Tidak dinyatakan'),
         'subject_drops': r['subj'], 'students_left': r['left']}
        for r in drops.values('reason_code').annotate(
            subj=Count('id', filter=Q(event_type='DROP_SUBJECT')),
            left=Count('id', filter=Q(event_type='TERMINATE')),
        ).order_by('-subj')
    ]
    drops_by_month = [0] * 12
    left_by_month = [0] * 12
    for e in drops.values('event_type', 'event_date__month'):
        target = drops_by_month if e['event_type'] == 'DROP_SUBJECT' else left_by_month
        target[e['event_date__month'] - 1] += 1

    # Budget vs actual: category budgets from master data 18_expense_cat (meta.budget per month)
    budgets = {d.label: float(d.meta_info.get('budget') or 0)
               for d in DynamicMasterData.objects.filter(category='18_expense_cat', status='APPROVED')}
    actual_by_cat = defaultdict(float)
    for row in vouchers.values('category').annotate(t=Sum('amount')):
        actual_by_cat[row['category']] = money(row['t'])
    months_elapsed = 12 if year < date.today().year else (date.today().month if year == date.today().year else 0)
    budget_rows = [{
        'category': cat,
        'monthly_budget': budgets.get(cat, 0.0),
        'budget_to_date': budgets.get(cat, 0.0) * months_elapsed,
        'actual': actual_by_cat.get(cat, 0.0),
        'variance': budgets.get(cat, 0.0) * months_elapsed - actual_by_cat.get(cat, 0.0),
    } for cat in sorted(set(budgets) | set(actual_by_cat))]

    return {
        'year': year,
        'attendance': attendance_rates(date(year, 1, 1), date(year, 12, 31)),
        'drop_reasons': drop_reasons,
        'drops_by_month': drops_by_month,
        'left_by_month': left_by_month,
        'result_improvement': result_improvement(),
        'budget': {'months_elapsed': months_elapsed, 'rows': budget_rows},
        'sales': {
            'months': months,
            'total_billed': sum(m['billed'] for m in months),
            'total_collected': total_collected,
            'walk_in_collected': sum(m['walk_in_collected'] for m in months),
            'outstanding': money(Invoice.objects.filter(status__in=['UNPAID', 'PARTIAL', 'OVERDUE']).aggregate(t=Sum('balance_due'))['t']),
            'by_form': [
                {'form': f, 'label': grades.label(f), 'amount': by_form[f]['amount'],
                 'students': len(by_form[f]['students']),
                 'pct': round(by_form[f]['amount'] / total_collected * 100, 1) if total_collected else 0}
                for f in form_order(by_form) if f in by_form
            ],
            'by_level': [
                {'level': lv, 'label': LEVEL_LABELS[lv], 'amount': by_level[lv],
                 'pct': round(by_level[lv] / total_collected * 100, 1) if total_collected else 0}
                for lv in ('UPPER', 'LOWER', 'PRIMARY') if lv in by_level
            ],
        },
        'expenses': {
            'total': money(vouchers.aggregate(t=Sum('amount'))['t']),
            'by_category': [
                {'category': row['category'], 'amount': money(row['t']), 'count': row['n']}
                for row in vouchers.values('category').annotate(t=Sum('amount'), n=Count('id')).order_by('-t')
            ],
            'pending_total': money(PaymentVoucher.objects.filter(
                date__year=year, status__in=['PENDING_SUPERVISOR', 'PENDING_MANAGEMENT']
            ).aggregate(t=Sum('amount'))['t']),
        },
        'teacher_payments': teacher_payments,
        'academic': {
            'at_risk': at_risk,
            'on_hold': list(Student.objects.filter(status='ON_HOLD').values('student_id', 'full_name', 'form_level', 'phone_number', 'parent1_phone')),
            'inactive': list(Student.objects.filter(status='TERMINATED').values('student_id', 'full_name', 'form_level', 'phone_number', 'parent1_phone')),
        },
    }
