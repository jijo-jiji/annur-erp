"""Tutup kaunter harian (Phase D): the day's receipts by payment method, the cash the counter should hold, the cash
counted, and the Supervisor's check.

Admin closes a day (and may close it again until it is verified). Supervisor or Management verifies it, or returns it
for a recount with a reason; nobody verifies a day they closed themselves, except Management. The totals are kept as
they stood at closing, so a receipt added or cancelled for that day afterwards shows as "changed after closing"."""
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from core import notify
from core.permissions import APPROVER_ROLES, MANAGEMENT, display_name, get_role
from students.drilldown import month_range, parse_day
from .models import DailyCashClose, PaymentReceipt

ZERO = Decimal('0.00')


def _amount(raw, field, top):
    try:
        value = Decimal(str(raw if raw not in (None, '') else '0')).quantize(Decimal('0.01'))
    except InvalidOperation:
        raise ValidationError({field: 'Amaun tidak sah.'})
    if value < 0 or value > top:
        raise ValidationError({field: f'Amaun mesti antara RM0 dan RM{top:,}.'})
    return value


def _day(raw, field='date'):
    on = parse_day(raw, field) if raw else date.today()
    if on > date.today():
        raise ValidationError({field: 'Tarikh tidak boleh selepas hari ini.'})
    return on


def day_totals(on):
    """The valid receipts of `on`: count and amount per payment method, in total, and in cash."""
    methods = {code: {'label': label, 'count': 0, 'amount': ZERO} for code, label in PaymentReceipt.METHOD_CHOICES}
    rows = (PaymentReceipt.objects.filter(status='VALID', payment_date=on)
            .values('payment_method').annotate(n=Count('id'), t=Sum('amount_paid')))
    for row in rows:
        entry = methods.setdefault(row['payment_method'], {'label': row['payment_method'], 'count': 0, 'amount': ZERO})
        entry['count'], entry['amount'] = row['n'], row['t'] or ZERO
    return {
        'by_method': methods,
        'receipt_count': sum(m['count'] for m in methods.values()),
        'receipts_total': sum((m['amount'] for m in methods.values()), ZERO),
        'cash_receipts': methods['CASH']['amount'],
        'cancelled_count': PaymentReceipt.objects.filter(status='CANCELLED', payment_date=on).count(),
    }


def _jsonable_methods(methods):
    return {code: {'label': m['label'], 'count': m['count'], 'amount': f"{m['amount']:.2f}"} for code, m in methods.items()}


def changed_since_close(close, live):
    """Whether the day's receipts are no longer what was counted at closing."""
    return (live['receipt_count'] != close.receipt_count or live['receipts_total'] != close.receipts_total
            or live['cash_receipts'] != close.cash_receipts)


def _local(moment):
    # in the centre's time zone, like every other time the API gives (the screens read the date from the text)
    return timezone.localtime(moment) if moment else None


def close_data(close, live=None):
    if close is None:
        return None
    live = live or day_totals(close.date)
    return {
        'id': close.id, 'date': close.date, 'status': close.status, 'status_label': close.get_status_display(),
        'opening_float': close.opening_float, 'cash_receipts': close.cash_receipts, 'cash_expected': close.cash_expected,
        'cash_counted': close.cash_counted, 'difference': close.difference, 'receipts_total': close.receipts_total,
        'receipt_count': close.receipt_count, 'by_method': close.by_method, 'note': close.note,
        'closed_by': close.closed_by, 'closed_at': _local(close.closed_at),
        'verified_by': close.verified_by, 'verified_at': _local(close.verified_at), 'verify_note': close.verify_note,
        'changed_after_close': changed_since_close(close, live),
    }


def day_data(on, user):
    live = day_totals(on)
    close = DailyCashClose.objects.filter(date=on).first()
    role = get_role(user)
    return {
        'date': on,
        'live': {**live, 'by_method': _jsonable_methods(live['by_method'])},
        'close': close_data(close, live),
        'can_close': close is None or close.status != 'VERIFIED',
        'can_verify': bool(close and close.status == 'CLOSED' and role in APPROVER_ROLES
                           and (role == MANAGEMENT or close.closed_by_user_id != user.id)),
    }


@api_view(['GET', 'POST'])
def cash_close(request):
    """GET ?date=YYYY-MM-DD: the day's receipts and its close, if any. POST {date, opening_float, cash_counted, note}:
    close the day (again, while it is not verified)."""
    if request.method == 'GET':
        return Response(day_data(_day(request.query_params.get('date')), request.user))
    on = _day(request.data.get('date'))
    opening = _amount(request.data.get('opening_float'), 'opening_float', 100000)
    if request.data.get('cash_counted') in (None, ''):
        raise ValidationError({'cash_counted': 'Masukkan jumlah tunai yang dikira.'})
    counted = _amount(request.data.get('cash_counted'), 'cash_counted', 1000000)
    with transaction.atomic():
        close = DailyCashClose.objects.select_for_update().filter(date=on).first() or DailyCashClose(date=on)
        if close.status == 'VERIFIED' and close.pk:
            raise ValidationError('Tutup kaunter hari ini sudah disahkan dan tidak boleh diubah.')
        live = day_totals(on)
        close.opening_float, close.cash_counted = opening, counted
        close.cash_receipts, close.receipts_total, close.receipt_count = live['cash_receipts'], live['receipts_total'], live['receipt_count']
        close.by_method = _jsonable_methods(live['by_method'])
        close.cash_expected = opening + live['cash_receipts']
        close.difference = counted - close.cash_expected
        close.note = str(request.data.get('note') or '').strip()[:1000]
        if close.difference and not close.note:
            raise ValidationError({'note': 'Terangkan sebab perbezaan tunai.'})
        close.status = 'CLOSED'
        close.closed_by, close.closed_by_user, close.closed_at = display_name(request.user), request.user, timezone.now()
        close.save()
        notify.cash_close_closed(close, request.user)
    return Response(day_data(on, request.user))


def _decide(request, status):
    if get_role(request.user) not in APPROVER_ROLES:
        raise PermissionDenied('Tutup kaunter hanya disemak oleh Supervisor atau Pengurusan.')
    on = _day(request.data.get('date'))
    note = str(request.data.get('note') or '').strip()[:1000]
    if status == 'RETURNED' and not note:
        raise ValidationError({'note': 'Nyatakan apa yang perlu dikira semula.'})
    with transaction.atomic():
        close = DailyCashClose.objects.select_for_update().filter(date=on).first()
        if not close:
            raise ValidationError('Kaunter belum ditutup pada tarikh ini.')
        if close.status != 'CLOSED':
            raise ValidationError('Tutup kaunter ini tidak menunggu semakan.')
        if close.closed_by_user_id == request.user.id and get_role(request.user) != MANAGEMENT:
            raise PermissionDenied('Anda tidak boleh mengesahkan tutup kaunter yang anda buat sendiri.')
        close.status, close.verified_by, close.verified_at, close.verify_note = status, display_name(request.user), timezone.now(), note
        close.save(update_fields=['status', 'verified_by', 'verified_at', 'verify_note'])
        notify.cash_close_decided(close)
    return Response(day_data(on, request.user))


@api_view(['POST'])
def cash_close_verify(request):
    return _decide(request, 'VERIFIED')


@api_view(['POST'])
def cash_close_return(request):
    """Back to Admin for a recount, with what to look at."""
    return _decide(request, 'RETURNED')


@api_view(['GET'])
def cash_close_history(request):
    """?month=YYYY-MM: every day of the month that had receipts or a close, newest first."""
    month = request.query_params.get('month') or date.today().strftime('%Y-%m')
    first, after = month_range(month, 'month')
    days = set(PaymentReceipt.objects.filter(payment_date__gte=first, payment_date__lt=after).values_list('payment_date', flat=True))
    closes = {c.date: c for c in DailyCashClose.objects.filter(date__gte=first, date__lt=after)}
    rows = []
    for on in sorted(days | set(closes), reverse=True):
        live = day_totals(on)
        rows.append({'date': on, 'receipts_total': live['receipts_total'], 'receipt_count': live['receipt_count'],
                     'cash_receipts': live['cash_receipts'], 'close': close_data(closes.get(on), live)})
    return Response({'month': month, 'days': rows})


def counter_alerts(user, today=None):
    """For the dashboard: closes waiting for this person's check, and recent days with takings but no close."""
    today = today or date.today()
    role = get_role(user)
    waiting = DailyCashClose.objects.filter(status='CLOSED')
    if role != MANAGEMENT and user is not None:
        waiting = waiting.exclude(closed_by_user=user)
    since = today - timedelta(days=7)
    took = set(PaymentReceipt.objects.filter(status='VALID', payment_date__gte=since, payment_date__lt=today).values_list('payment_date', flat=True))
    closed = set(DailyCashClose.objects.filter(date__gte=since).values_list('date', flat=True))
    return {
        'to_verify': waiting.count() if role in APPROVER_ROLES else 0,
        'returned': DailyCashClose.objects.filter(status='RETURNED').count(),
        'unclosed_days': sorted(took - closed),
        'today_closed': DailyCashClose.objects.filter(date=today).exists(),
    }
