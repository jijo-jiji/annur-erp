"""The week-5 rule (Phase E): fee follow-up after the counter's reminders.

Weeks 2 to 4 of a month the counter sends reminders (follow_up_week in services.py). A monthly invoice still unpaid in
week 5 (from day 29, or the month's last day in a shorter month) becomes a task for Supervisor to contact the parent
by WhatsApp or phone and record the outcome. The arrears rule (unpaid for the set number of months) comes after.

Tasks are made when the dashboard, the follow-up list or `manage.py week5_followups` runs, for the current month once
week 5 has started and for the month before (in case nobody opened the system in its week 5). An invoice raised so late
that it was not due before week 5 waits for next month's arrears instead."""
import calendar
from datetime import date
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from core import notify
from core.permissions import APPROVER_ROLES, display_name, get_role
from .models import Invoice, PaymentFollowUp
from .services import OPEN_STATUSES

WEEK5_DAY = 29


def week5_start(month_first):
    """The first day of week 5 of a month (day 29, or the last day when the month is shorter)."""
    return month_first.replace(day=min(WEEK5_DAY, calendar.monthrange(month_first.year, month_first.month)[1]))


def months_due(today):
    current = today.replace(day=1)
    previous = (current.replace(day=1) - date.resolution).replace(day=1)
    return [previous] + ([current] if today >= week5_start(current) else [])


def invoices_needing_task(today):
    rows = []
    for month in months_due(today):
        rows += list(Invoice.objects.filter(
            invoice_type='MONTHLY', billing_month=month, status__in=OPEN_STATUSES, balance_due__gt=0,
            student__status__in=('ACTIVE', 'ON_HOLD'), due_date__lt=week5_start(month), follow_up__isnull=True,
        ))
    return rows


def generate(today=None):
    """Make the week-5 tasks that are due; returns how many were made. Supervisor is told once a day."""
    today = today or date.today()
    made = 0
    for invoice in invoices_needing_task(today):
        with transaction.atomic():
            _, created = PaymentFollowUp.objects.get_or_create(invoice=invoice, defaults={'created_on': today})
            made += created
    notify.week5_tasks(made, today)
    return made


def state(task):
    if task.invoice.status == 'PAID':
        return 'PAID'
    return 'DONE' if task.outcome else 'OPEN'


def open_tasks():
    """Tasks still waiting for Supervisor: no outcome recorded and the invoice not paid."""
    return PaymentFollowUp.objects.filter(outcome='').exclude(invoice__status='PAID')


class FollowUpSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    billing_month = serializers.DateField(source='invoice.billing_month', read_only=True)
    balance = serializers.DecimalField(source='invoice.balance_due', max_digits=8, decimal_places=2, read_only=True)
    due_date = serializers.DateField(source='invoice.due_date', read_only=True)
    invoice_status = serializers.CharField(source='invoice.status', read_only=True)
    reminders = serializers.IntegerField(source='invoice.reminder_count', read_only=True)
    student_code = serializers.CharField(source='invoice.student.student_id', read_only=True)
    student_name = serializers.CharField(source='invoice.student.full_name', read_only=True)
    form_level = serializers.CharField(source='invoice.student.form_level', read_only=True)
    outcome_label = serializers.CharField(source='get_outcome_display', read_only=True)
    channel_label = serializers.CharField(source='get_channel_display', read_only=True)
    state = serializers.SerializerMethodField()

    class Meta:
        model = PaymentFollowUp
        fields = ['id', 'invoice', 'invoice_number', 'billing_month', 'balance', 'due_date', 'invoice_status', 'reminders',
                  'student_code', 'student_name', 'form_level', 'created_on', 'outcome', 'outcome_label', 'channel',
                  'channel_label', 'promised_date', 'note', 'contacted_by', 'contacted_at', 'state']

    def get_state(self, obj):
        return state(obj)


@api_view(['GET'])
def follow_ups(request):
    """The week-5 tasks: every open one, and those done or paid in the last two months."""
    generate()
    since = (date.today().replace(day=1) - date.resolution).replace(day=1)
    rows = (PaymentFollowUp.objects.select_related('invoice__student')
            .filter(Q(invoice__billing_month__gte=since) | (Q(outcome='') & ~Q(invoice__status='PAID')))
            .order_by('-invoice__billing_month', 'invoice__student__full_name'))
    return Response(FollowUpSerializer(rows, many=True).data)


@api_view(['POST'])
def follow_up_record(request, pk):
    """{outcome, channel, promised_date, note}: what the parent said. Supervisor or Management; can be recorded again
    while the invoice is unpaid (for example a promised date that passed)."""
    if get_role(request.user) not in APPROVER_ROLES:
        raise PermissionDenied('Susulan minggu 5 direkod oleh Supervisor atau Pengurusan.')
    task = PaymentFollowUp.objects.select_related('invoice__student').filter(pk=pk).first()
    if not task:
        raise ValidationError('Tugasan tidak dijumpai.')
    if task.invoice.status == 'PAID':
        raise ValidationError('Invois ini sudah dibayar.')
    outcome = request.data.get('outcome')
    if outcome not in dict(PaymentFollowUp.OUTCOMES):
        raise ValidationError({'outcome': 'Pilih hasil susulan.'})
    channel = request.data.get('channel') or ''
    if channel not in dict(PaymentFollowUp.CHANNELS):
        raise ValidationError({'channel': 'Pilih cara menghubungi.'})
    note = str(request.data.get('note') or '').strip()[:1000]
    promised = None
    if outcome == 'PROMISED':
        from students.drilldown import parse_day
        if not request.data.get('promised_date'):
            raise ValidationError({'promised_date': 'Nyatakan tarikh yang dijanjikan.'})
        promised = parse_day(request.data['promised_date'], 'promised_date')
        if promised < date.today():
            raise ValidationError({'promised_date': 'Tarikh janji tidak boleh sebelum hari ini.'})
    if outcome == 'OTHER' and not note:
        raise ValidationError({'note': 'Terangkan hasil susulan.'})
    task.outcome, task.channel, task.promised_date, task.note = outcome, channel, promised, note
    task.contacted_by, task.contacted_at = display_name(request.user), timezone.now()
    task.save()
    return Response(FollowUpSerializer(task).data)
