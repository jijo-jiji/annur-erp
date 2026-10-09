"""Limits and alert thresholds Management can change (voucher approval amounts, how early alerts appear, ...).

Each has a default that applies until it is changed, and a range so a typing mistake cannot switch an alert off
or make every voucher need approval. A new voucher limit applies to vouchers made after the change; vouchers
already waiting keep the approver they were given."""
from decimal import Decimal, InvalidOperation
from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import SettingEvent
from .permissions import MANAGEMENT, display_name, require_role

# name -> (setting key, label, unit, default, minimum, maximum, group)
SPECS = {
    'voucher_tier1': ('VOUCHER_TIER1_LIMIT', 'Baucar di bawah amaun ini disahkan oleh Admin', 'RM', 500, 1, 1000000, 'Baucar'),
    'voucher_tier2': ('VOUCHER_TIER2_LIMIT', 'Baucar sehingga amaun ini diluluskan Supervisor atau Pengurusan; di atasnya Pengurusan sahaja', 'RM', 3000, 1, 10000000, 'Baucar'),
    'permit_warning_days': ('PERMIT_WARNING_DAYS', 'Amaran permit mengajar akan luput', 'hari sebelum', 60, 1, 365, 'Amaran'),
    'contract_alert_days': ('CONTRACT_ALERT_DAYS', 'Amaran kontrak staf akan tamat', 'hari sebelum', 30, 1, 365, 'Amaran'),
    'birthday_alert_days': ('BIRTHDAY_ALERT_DAYS', 'Peringatan hari lahir staf', 'hari sebelum', 7, 1, 60, 'Amaran'),
    'low_attendance_pct': ('LOW_ATTENDANCE_PCT', 'Amaran kehadiran kelas rendah di bawah', '%', 70, 1, 100, 'Amaran'),
    'attendance_window_days': ('ATTENDANCE_WINDOW_DAYS', 'Kehadiran dikira daripada', 'hari lepas', 30, 7, 365, 'Amaran'),
    'nearly_full_seats': ('NEARLY_FULL_SEATS', 'Kelas dikira hampir penuh apabila kerusi kosong tinggal', 'kerusi', 2, 1, 10, 'Amaran'),
    'follow_up_days': ('FOLLOW_UP_DAYS', 'Peringatan susulan prospek selepas setiap tindakan', 'hari', 7, 1, 60, 'Amaran'),
}


def _number(name, raw):
    key, label, unit, default, low, high, group = SPECS[name]
    try:
        number = Decimal(str(raw).strip())
    except (InvalidOperation, AttributeError):
        raise ValueError(f'{label}: masukkan nombor.')
    if unit != 'RM' and number != number.to_integral_value():
        raise ValueError(f'{label}: masukkan nombor bulat.')
    if not low <= number <= high:
        raise ValueError(f'{label}: mesti antara {low:,} dan {high:,}.')
    return int(number) if unit != 'RM' else number.quantize(Decimal('0.01'))


def values():
    """Every threshold as a number: the saved one, or the default."""
    from business_config.models import BusinessSetting
    saved = dict(BusinessSetting.objects.filter(key__in=[s[0] for s in SPECS.values()]).values_list('key', 'value'))
    out = {}
    for name, (key, label, unit, default, low, high, group) in SPECS.items():
        try:
            out[name] = _number(name, saved[key]) if key in saved else (Decimal(default) if unit == 'RM' else default)
        except (ValueError, KeyError):
            out[name] = Decimal(default) if unit == 'RM' else default  # a damaged value never switches an alert off
    return out


def value(name):
    return values()[name]


def _plain(number):
    return float(number) if isinstance(number, Decimal) else number


def listing():
    current = values()
    return [{
        'name': name, 'label': label, 'unit': unit, 'group': group, 'value': _plain(current[name]), 'default': default,
        'min': low, 'max': high,
    } for name, (key, label, unit, default, low, high, group) in SPECS.items()]


@transaction.atomic
def save(changes, user):
    from business_config.models import BusinessSetting
    unknown = [k for k in changes if k not in SPECS]
    if unknown:
        raise ValidationError({k: 'Medan tidak dikenali.' for k in unknown})
    cleaned, errors = {}, {}
    for name, raw in changes.items():
        try:
            cleaned[name] = _number(name, raw)
        except ValueError as err:
            errors[name] = str(err)
    if errors:
        raise ValidationError(errors)
    current = values()
    merged = {**current, **cleaned}
    if merged['voucher_tier1'] >= merged['voucher_tier2']:
        raise ValidationError({'voucher_tier2': 'Had baucar Supervisor mesti lebih tinggi daripada had baucar Admin.'})
    for name, number in cleaned.items():
        if number == current[name]:
            continue
        key, label = SPECS[name][0], SPECS[name][1]
        BusinessSetting.objects.update_or_create(key=key, defaults={'value': str(number), 'description': label})
        SettingEvent.objects.create(key=key, label=label[:60], old_value=str(current[name]), new_value=str(number), by_name=display_name(user))
    return listing()


@api_view(['GET', 'PUT'])
def thresholds(request):
    """Everyone reads the limits (screens explain who approves what); Management changes them."""
    if request.method == 'PUT':
        require_role(request, MANAGEMENT)
        return Response(save(request.data, request.user))
    return Response(listing())
