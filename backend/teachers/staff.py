"""Staff HR figures: leave balances, attendance reports, KPI achievement, contract and birthday alerts."""
from collections import defaultdict
from datetime import date, timedelta
from rest_framework.exceptions import ValidationError
from .models import LeaveRequest, StaffAttendance, StaffKPI, StaffMember

LEAVE_TYPES = ('AL', 'MC', 'EL', 'UL')


def leave_used(staff, year):
    used = defaultdict(int)
    for kind, days in LeaveRequest.objects.filter(staff=staff, status='APPROVED', start_date__year=year)\
            .values_list('leave_type', 'days_count'):
        used[kind] += days
    return used


def leave_balances(staff, year=None):
    """Entitled, used and balance per leave type for the year; unpaid leave (UL) has no limit."""
    year = year or date.today().year
    used = leave_used(staff, year)
    pending = defaultdict(int)
    for kind, days in LeaveRequest.objects.filter(staff=staff, status='PENDING', start_date__year=year)\
            .values_list('leave_type', 'days_count'):
        pending[kind] += days
    out = {}
    for kind in LEAVE_TYPES:
        entitled = getattr(staff, f'{kind.lower()}_entitlement', None)
        out[kind] = {
            'entitled': entitled,
            'used': used[kind],
            'pending': pending[kind],
            'balance': None if entitled is None else entitled - used[kind],
        }
    return out


def check_leave_available(leave):
    """Approving must not take a staff member past the year's entitlement."""
    if leave.leave_type == 'UL':
        return
    balance = leave_balances(leave.staff, leave.start_date.year)[leave.leave_type]['balance']
    if leave.days_count > balance:
        raise ValidationError({'detail': f"Baki {leave.leave_type} {leave.staff.name} hanya {balance} hari; permohonan {leave.days_count} hari."})


def working_days(staff, start, end):
    """Days in [start, end] that fall on the staff member's working weekdays."""
    days, d = [], start
    while d <= end:
        if d.weekday() in staff.work_weekdays:
            days.append(d)
        d += timedelta(days=1)
    return days


def leave_days(staff, start, end):
    """Approved leave days that fall on working days within [start, end]."""
    taken = set()
    for leave in LeaveRequest.objects.filter(staff=staff, status='APPROVED', start_date__lte=end, end_date__gte=start):
        d = max(leave.start_date, start)
        while d <= min(leave.end_date, end):
            taken.add(d)
            d += timedelta(days=1)
    return taken


def month_bounds(month):
    start = month.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return start, end


def attendance_report(month, today=None):
    """Monthly attendance per staff: days present, late, early leave, leave, absent and attendance %.
    Only days up to today count, and approved leave is not counted as absence."""
    today = today or date.today()
    start, end = month_bounds(month)
    end = min(end, today)
    rows = []
    for staff in StaffMember.objects.filter(is_active=True).order_by('staff_id'):
        records = {a.date: a for a in StaffAttendance.objects.filter(staff=staff, date__gte=start, date__lte=end).select_related('staff')}
        workdays = [d for d in working_days(staff, start, end) if not staff.join_date or d >= staff.join_date]
        on_leave = leave_days(staff, start, end) & set(workdays)
        expected = [d for d in workdays if d not in on_leave]
        present = [d for d in expected if d in records]
        late = [records[d] for d in present if records[d].late_minutes > 0]
        early = [records[d] for d in present if records[d].early_minutes > 0]
        rows.append({
            'staff_id': staff.id, 'code': staff.staff_id, 'name': staff.name,
            'work_start': staff.work_start, 'work_end': staff.work_end,
            'working_days': len(expected), 'present': len(present), 'leave_days': len(on_leave),
            'absent': len(expected) - len(present),
            'late': len(late), 'late_minutes': sum(r.late_minutes for r in late),
            'early': len(early), 'early_minutes': sum(r.early_minutes for r in early),
            'attendance_pct': round(len(present) / len(expected) * 100, 1) if expected else None,
            'late_dates': [r.date for r in late], 'early_dates': [r.date for r in early],
        })
    return {'month': start, 'until': end, 'rows': rows}


def leave_report(year):
    """Yearly leave used and balance per staff for MC, EL, AL, UL."""
    return {'year': year, 'rows': [{
        'staff_id': s.id, 'code': s.staff_id, 'name': s.name, 'leave': leave_balances(s, year),
    } for s in StaffMember.objects.filter(is_active=True).order_by('staff_id')]}


def kpi_report(year):
    """KPI achievement: weighted score of reviewed KPIs per staff."""
    rows = defaultdict(lambda: {'kpis': 0, 'reviewed': 0, 'weight': 0, 'weighted': 0})
    names = {}
    for k in StaffKPI.objects.filter(year=year).select_related('staff'):
        r = rows[k.staff_id]
        names[k.staff_id] = (k.staff.staff_id, k.staff.name)
        r['kpis'] += 1
        if k.status == 'REVIEWED' and k.score is not None:
            r['reviewed'] += 1
            r['weight'] += k.weight
            r['weighted'] += k.weight * k.score
    return {'year': year, 'rows': [{
        'staff_id': sid, 'code': names[sid][0], 'name': names[sid][1], 'kpis': r['kpis'], 'reviewed': r['reviewed'],
        'achievement_pct': round(r['weighted'] / r['weight'], 1) if r['weight'] else None,
    } for sid, r in sorted(rows.items(), key=lambda x: names[x[0]][1])]}


def next_birthday(dob, today):
    try:
        upcoming = dob.replace(year=today.year)
    except ValueError:  # 29 February
        upcoming = date(today.year, 3, 1)
    if upcoming < today:
        try:
            upcoming = dob.replace(year=today.year + 1)
        except ValueError:
            upcoming = date(today.year + 1, 3, 1)
    return upcoming


def alerts(today=None):
    """Contracts ending within a month, and birthdays in the coming week."""
    from core import thresholds
    limits = thresholds.values()  # j-status.doc: alert before the employment period ends; Management sets how early
    today = today or date.today()
    active = StaffMember.objects.filter(is_active=True)
    contracts = [{
        'code': s.staff_id, 'name': s.name, 'contract_end': s.contract_end, 'days_left': (s.contract_end - today).days,
    } for s in active.exclude(contract_end=None).order_by('contract_end')
        if (s.contract_end - today).days <= limits['contract_alert_days']]
    birthdays = []
    for s in active.exclude(date_of_birth=None):
        upcoming = next_birthday(s.date_of_birth, today)
        if (upcoming - today).days <= limits['birthday_alert_days']:
            birthdays.append({'code': s.staff_id, 'name': s.name, 'date': upcoming, 'days_left': (upcoming - today).days})
    return {'contracts_ending': contracts, 'birthdays': sorted(birthdays, key=lambda b: b['days_left'])}
