"""Which payment vouchers a dashboard figure counts, and the list it opens (see students/drilldown.py)."""
from rest_framework.exceptions import ValidationError
from students.drilldown import month_range, parse_day, year_range
from .models import PaymentVoucher

# Spending counts once a voucher is verified at the counter or approved
COUNTED_STATUSES = ('VERIFIED_ADMIN', 'APPROVED_SUPERVISOR', 'APPROVED_MANAGEMENT')
STATUS_GROUPS = {
    **{code: (code,) for code, _ in PaymentVoucher.STATUS_CHOICES},
    'PENDING': ('PENDING_SUPERVISOR', 'PENDING_MANAGEMENT'),
    'COUNTED': COUNTED_STATUSES,
}


def vouchers_matching(params):
    """Vouchers by status, month and category.

    status    a voucher status, PENDING (waiting for Supervisor or Management) or COUNTED (counted as spending)
    month     YYYY-MM (the voucher's date); or year (YYYY); or from / to (YYYY-MM-DD, inclusive)
    category  the expense category"""
    qs = PaymentVoucher.objects.all()
    status = params.get('status')
    if status:
        if status not in STATUS_GROUPS:
            raise ValidationError({'status': 'Status baucar tidak dikenali.'})
        qs = qs.filter(status__in=STATUS_GROUPS[status])
    if params.get('month'):
        first, after = month_range(params['month'], 'month')
        qs = qs.filter(date__gte=first, date__lt=after)
    if params.get('year'):
        first, after = year_range(params['year'], 'year')
        qs = qs.filter(date__gte=first, date__lt=after)
    if params.get('from'):
        qs = qs.filter(date__gte=parse_day(params['from'], 'from'))
    if params.get('to'):
        qs = qs.filter(date__lte=parse_day(params['to'], 'to'))
    if params.get('category'):
        qs = qs.filter(category=params['category'])
    return qs
