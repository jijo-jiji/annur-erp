"""The office's daily checklist (Phase D). The items are a Data induk list (27_daily_checklist) the centre edits; staff
tick them through the day and Supervisor or Management checks the day once, after which the ticks are kept as they were.

Some items show what the system can see beside them (`meta_info.auto`, see business_config.setup_lists): whether the
counter was closed, how many of the day's classes have attendance, how many fee reminders were recorded, whether
tomorrow's handouts are printed (Phase G). The person
still ticks the item; the hint only helps them check."""
from datetime import date
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from business_config.setup_lists import DAILY_CHECKLIST
from .models import DailyChecklist
from .permissions import APPROVER_ROLES, display_name, get_role


def _day(raw):
    from students.drilldown import parse_day
    on = parse_day(raw, 'date') if raw else date.today()
    if on > date.today():
        raise ValidationError({'date': 'Tarikh tidak boleh selepas hari ini.'})
    return on


def current_items():
    from business_config.models import DynamicMasterData
    rows = sorted(DynamicMasterData.objects.filter(category=DAILY_CHECKLIST, status='APPROVED'),
                  key=lambda r: ((r.meta_info or {}).get('order', 999), r.label))
    return [{'code': r.code, 'label': r.label, 'auto': (r.meta_info or {}).get('auto', '')} for r in rows]


def hint(auto, on):
    """What the system sees for an item, in a few words, or ''."""
    if auto == 'cash_close':
        from billing.models import DailyCashClose
        close = DailyCashClose.objects.filter(date=on).first()
        state = {'CLOSED': 'menunggu semakan', 'RETURNED': 'dikembalikan untuk dikira semula', 'VERIFIED': 'disahkan'}[close.status] if close else ''
        return f"Ditutup oleh {close.closed_by}, {state}" if close else 'Kaunter belum ditutup'
    if auto == 'attendance':
        from students.models import ClassAttendanceSession
        from teachers.payroll import roster
        held = [r['class_id'] for r in roster(on) if not (r.get('record') and r['record'].get('status') == 'CANCELLED')]
        if not held:
            return 'Tiada kelas pada hari ini'
        taken = ClassAttendanceSession.objects.filter(date=on, timetable_class_id__in=held).count()
        return f"{taken}/{len(held)} kelas sudah diambil kedatangan"
    if auto == 'handouts':
        from academic.handouts import tomorrow_hint
        return tomorrow_hint(on)
    if auto == 'reminders':
        from billing.models import Invoice
        n = Invoice.objects.filter(last_reminder_at=on).count()
        return f"{n} peringatan yuran direkod" if n else 'Tiada peringatan direkod'
    return ''


def day_data(on, user):
    record = DailyChecklist.objects.filter(date=on).first()
    ticks = record.ticks if record else {}
    checked = bool(record and record.checked_at)
    items = record.items_at_check if checked else current_items()
    known = {i['code'] for i in items}
    # an item ticked earlier and removed from the list since still shows, with the name it had
    items = items + [{'code': code, 'label': t.get('label', code), 'auto': ''} for code, t in ticks.items() if code not in known]
    rows = [{**i, 'done': i['code'] in ticks, 'by': ticks.get(i['code'], {}).get('by', ''), 'at': ticks.get(i['code'], {}).get('at'),
             'note': ticks.get(i['code'], {}).get('note', ''), 'hint': hint(i['auto'], on)} for i in items]
    return {
        'date': on, 'items': rows, 'done': sum(1 for r in rows if r['done']), 'total': len(rows),
        'checked_by': record.checked_by if record else '',
        'checked_at': timezone.localtime(record.checked_at) if record and record.checked_at else None,
        'check_note': record.check_note if record else '',
        'can_check': not checked and get_role(user) in APPROVER_ROLES,
        'can_tick': not checked,
    }


@api_view(['GET'])
def checklist(request):
    """?date=YYYY-MM-DD (default today): the day's items, what was ticked, by whom, and the Supervisor's check."""
    return Response(day_data(_day(request.query_params.get('date')), request.user))


@api_view(['POST'])
def checklist_tick(request):
    """{date, code, done, note}: tick or untick one item, until the day is checked."""
    on = _day(request.data.get('date'))
    code = str(request.data.get('code') or '')
    item = next((i for i in current_items() if i['code'] == code), None)
    with transaction.atomic():
        record, _ = DailyChecklist.objects.select_for_update().get_or_create(date=on)
        if record.checked_at:
            raise ValidationError('Senarai semak hari ini sudah disemak oleh Supervisor.')
        done = str(request.data.get('done', 'true')).lower() not in ('false', '0', 'no')
        if done:
            if item is None:
                raise ValidationError({'code': 'Perkara ini tiada dalam senarai semak.'})
            record.ticks[code] = {'label': item['label'], 'by': display_name(request.user), 'at': timezone.localtime().isoformat(),
                                  'note': str(request.data.get('note') or '').strip()[:300]}
        else:
            record.ticks.pop(code, None)
        record.save(update_fields=['ticks'])
    return Response(day_data(on, request.user))


@api_view(['POST'])
def checklist_check(request):
    """{date, note}: Supervisor or Management checks the day; the list and its ticks are kept as they were."""
    if get_role(request.user) not in APPROVER_ROLES:
        raise PermissionDenied('Senarai semak disemak oleh Supervisor atau Pengurusan.')
    on = _day(request.data.get('date'))
    with transaction.atomic():
        record, _ = DailyChecklist.objects.select_for_update().get_or_create(date=on)
        if record.checked_at:
            raise ValidationError('Senarai semak hari ini sudah disemak.')
        items = current_items()
        missing = [i['label'] for i in items if i['code'] not in record.ticks]
        note = str(request.data.get('note') or '').strip()[:1000]
        if missing and not note:
            raise ValidationError({'note': f"Belum ditanda: {', '.join(missing)}. Nyatakan catatan sebelum menyemak."})
        record.items_at_check = items
        record.checked_by, record.checked_at, record.check_note = display_name(request.user), timezone.now(), note
        record.save()
    return Response(day_data(on, request.user))
