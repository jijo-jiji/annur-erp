"""Which receipts and invoices a dashboard figure counts, and the list it opens (see students/drilldown.py).

The money figures on Ringkasan are sums, so the list behind them is the receipts or invoices that add up to the
figure: `GET /billing/receipts/matching/` and `GET /billing/invoices/matching/` return the matching rows with
their total, built from the same definitions the dashboard uses."""
from rest_framework.exceptions import ValidationError
from core import grades
from students.drilldown import month_range, parse_day, year_range
from .models import Invoice, PaymentReceipt

OUTSTANDING_STATUSES = ('UNPAID', 'PARTIAL', 'OVERDUE')
INVOICE_STATUS_GROUPS = {
    'UNPAID': ('UNPAID',),
    'PARTIAL': ('PARTIAL',),
    'PAID': ('PAID',),
    'OVERDUE': ('OVERDUE',),
    'OUTSTANDING': OUTSTANDING_STATUSES,  # what is still owed: unpaid, part paid or overdue
}


def forms_of_level(level, field='level'):
    """(grade codes, include?) for a level. Upper secondary also takes any code the grade list no longer names
    (the reports have always counted those as upper), so it is given as the codes to leave out instead."""
    if level not in grades.LEVELS:
        raise ValidationError({field: 'Peringkat tidak dikenali.'})
    if level == 'UPPER':
        return [g['code'] for g in grades.grade_list() if g['level'] != 'UPPER'], False
    return [g['code'] for g in grades.grade_list() if g['level'] == level], True


def receipts_matching(params):
    """Receipts by the day they were paid, and by the student they were paid for.

    month   YYYY-MM
    year    YYYY
    from, to   YYYY-MM-DD (inclusive); one day is from = to
    walk_in    1: walk-in students only
    form    the student's tingkatan / darjah (grade code)
    level   UPPER | LOWER | PRIMARY: all the grades of that level

    Cancelled receipts are left out: their money was taken off the invoice again."""
    qs = PaymentReceipt.objects.filter(status='VALID')
    if params.get('month'):
        first, after = month_range(params['month'], 'month')
        qs = qs.filter(payment_date__gte=first, payment_date__lt=after)
    if params.get('year'):
        first, after = year_range(params['year'], 'year')
        qs = qs.filter(payment_date__gte=first, payment_date__lt=after)
    if params.get('from'):
        qs = qs.filter(payment_date__gte=parse_day(params['from'], 'from'))
    if params.get('to'):
        qs = qs.filter(payment_date__lte=parse_day(params['to'], 'to'))
    if params.get('walk_in'):
        qs = qs.filter(student__student_type='WALK_IN')
    if params.get('form'):
        qs = qs.filter(student__form_level=params['form'])
    if params.get('level'):
        codes, include = forms_of_level(params['level'])
        qs = qs.filter(student__form_level__in=codes) if include else qs.exclude(student__form_level__in=codes)
    return qs


def invoices_matching(params):
    """Invoices by status and billing month.

    status   UNPAID | PARTIAL | PAID | OVERDUE | OUTSTANDING (unpaid, partial and overdue together)
    month    YYYY-MM (the month billed)
    year     YYYY (the year billed)"""
    qs = Invoice.objects.all()
    status = params.get('status')
    if status:
        if status not in INVOICE_STATUS_GROUPS:
            raise ValidationError({'status': 'Status invois tidak dikenali.'})
        qs = qs.filter(status__in=INVOICE_STATUS_GROUPS[status])
    if params.get('month'):
        first, after = month_range(params['month'], 'month')
        qs = qs.filter(billing_month__gte=first, billing_month__lt=after)
    if params.get('year'):
        first, after = year_range(params['year'], 'year')
        qs = qs.filter(billing_month__gte=first, billing_month__lt=after)
    return qs
