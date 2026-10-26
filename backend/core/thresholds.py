"""Settings Management can change without the developer: voucher approval amounts, how early alerts appear,
defaults for new staff, upload size limits, the prefix of document numbers and the names of the lead stages.

Each has a default that applies until it is changed, and a check (a range, a time, a list of days or a pattern) so a typing
mistake cannot switch an alert off, lock a file type out or break a document number. A change applies from then on:
vouchers already waiting keep their approver, documents already numbered keep their number, staff already added keep
their own leave and working time. Every change is recorded (see core.centre.events)."""
import re
from decimal import Decimal, InvalidOperation
from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import SettingEvent
from .permissions import MANAGEMENT, display_name, require_role


def _spec(key, label, group, default, kind='number', unit='', low=None, high=None, pattern=None, options=None):
    return {'key': key, 'label': label, 'group': group, 'default': default, 'kind': kind, 'unit': unit,
            'min': low, 'max': high, 'pattern': pattern, 'options': options}


LEAD_STAGES = [('ENQUIRY', 'Enquiry'), ('CONTENT_1', 'Content 1'), ('CONTENT_2', 'Content 2'), ('CONTENT_3', 'Content 3'),
               ('TRIAL', 'Free Trial'), ('WAITING_PAYMENT', 'Waiting Payment'), ('REGISTERED', 'Registered'), ('ACTIVE', 'Active')]

SPECS = {
    # Voucher approval
    'voucher_tier1': _spec('VOUCHER_TIER1_LIMIT', 'Baucar di bawah amaun ini disahkan oleh Admin', 'Baucar', 500, unit='RM', low=1, high=1000000),
    'voucher_tier2': _spec('VOUCHER_TIER2_LIMIT', 'Baucar sehingga amaun ini diluluskan Supervisor atau Pengurusan; di atasnya Pengurusan sahaja', 'Baucar', 3000, unit='RM', low=1, high=10000000),
    # Alerts
    'permit_warning_days': _spec('PERMIT_WARNING_DAYS', 'Amaran permit mengajar akan luput', 'Amaran', 60, unit='hari sebelum', low=1, high=365),
    'contract_alert_days': _spec('CONTRACT_ALERT_DAYS', 'Amaran kontrak staf akan tamat', 'Amaran', 30, unit='hari sebelum', low=1, high=365),
    'birthday_alert_days': _spec('BIRTHDAY_ALERT_DAYS', 'Peringatan hari lahir staf', 'Amaran', 7, unit='hari sebelum', low=1, high=60),
    'low_attendance_pct': _spec('LOW_ATTENDANCE_PCT', 'Amaran kehadiran kelas rendah di bawah', 'Amaran', 70, unit='%', low=1, high=100),
    'attendance_window_days': _spec('ATTENDANCE_WINDOW_DAYS', 'Kehadiran dikira daripada', 'Amaran', 30, unit='hari lepas', low=7, high=365),
    'nearly_full_seats': _spec('NEARLY_FULL_SEATS', 'Kelas dikira hampir penuh apabila kerusi kosong tinggal', 'Amaran', 2, unit='kerusi', low=1, high=10),
    'follow_up_days': _spec('FOLLOW_UP_DAYS', 'Peringatan susulan prospek selepas setiap tindakan', 'Amaran', 7, unit='hari', low=1, high=60),
    # Starting values for a staff member added from now on (each person's own values can still be changed)
    'default_al_days': _spec('DEFAULT_AL_DAYS', 'Cuti tahunan (AL) setahun', 'Staf baharu', 12, unit='hari', low=0, high=60),
    'default_mc_days': _spec('DEFAULT_MC_DAYS', 'Cuti sakit (MC) setahun', 'Staf baharu', 14, unit='hari', low=0, high=60),
    'default_el_days': _spec('DEFAULT_EL_DAYS', 'Cuti kecemasan (EL) setahun', 'Staf baharu', 3, unit='hari', low=0, high=60),
    'default_work_start': _spec('DEFAULT_WORK_START', 'Waktu masuk kerja', 'Staf baharu', '08:30', kind='time'),
    'default_work_end': _spec('DEFAULT_WORK_END', 'Waktu keluar kerja', 'Staf baharu', '17:30', kind='time'),
    'default_work_days': _spec('DEFAULT_WORK_DAYS', 'Hari bekerja', 'Staf baharu', '0,1,2,3,4,5', kind='weekdays'),
    # Upload size limits, within a safe maximum
    'upload_photo_mb': _spec('UPLOAD_PHOTO_MB', 'Gambar pelajar dan staf', 'Muat naik fail', 5, unit='MB', low=1, high=10),
    'upload_document_mb': _spec('UPLOAD_DOCUMENT_MB', 'Dokumen staf dan lampiran baucar', 'Muat naik fail', 10, unit='MB', low=1, high=25),
    'upload_feedback_mb': _spec('UPLOAD_FEEDBACK_MB', 'Gambar dan video maklum balas', 'Muat naik fail', 50, unit='MB', low=1, high=200),
    'upload_handout_mb': _spec('UPLOAD_HANDOUT_MB', 'Nota dan modul kelas', 'Muat naik fail', 25, unit='MB', low=1, high=100),
    # The start of document numbers; the running number and the year carry on
    'prefix_student': _spec('PREFIX_STUDENT', 'ID pelajar (cth. HQ-260001)', 'Nombor dokumen', 'HQ', kind='text', pattern=r'[A-Z]{1,6}'),
    'prefix_invoice': _spec('PREFIX_INVOICE', 'Nombor invois (cth. INV-2026-0001)', 'Nombor dokumen', 'INV', kind='text', pattern=r'[A-Z]{1,6}'),
    'prefix_receipt': _spec('PREFIX_RECEIPT', 'Nombor resit (cth. REC-2026-0001)', 'Nombor dokumen', 'REC', kind='text', pattern=r'[A-Z]{1,6}'),
    'prefix_voucher': _spec('PREFIX_VOUCHER', 'Nombor baucar (cth. PV26-0901)', 'Nombor dokumen', 'PV', kind='text', pattern=r'[A-Z]{1,6}'),
    # QR self check-in (students/checkin.py), client decision 12; every one editable
    'checkin_open_before': _spec('CHECKIN_OPEN_BEFORE', 'Imbasan kedatangan dibuka sebelum kelas bermula', 'Kedatangan QR', 15, unit='minit', low=0, high=60),
    'checkin_open_after': _spec('CHECKIN_OPEN_AFTER', 'Imbasan kedatangan ditutup selepas kelas bermula', 'Kedatangan QR', 30, unit='minit', low=5, high=180),
    'checkin_late_minutes': _spec('CHECKIN_LATE_MINUTES', 'Dikira lewat selepas kelas bermula', 'Kedatangan QR', 10, unit='minit', low=0, high=120),
    # Prestasi pelajar (students/performance.py) and the pass rates on Keputusan peperiksaan
    'results_pass_mark': _spec('RESULTS_PASS_MARK', 'Markah lulus peperiksaan sekolah', 'Prestasi pelajar', 40, unit='markah', low=1, high=100),
    'results_drop_marks': _spec('RESULTS_DROP_MARKS', 'Dikira merosot jika markah turun sebanyak', 'Prestasi pelajar', 10, unit='markah', low=1, high=50),
    # Leads that finished (registered, active or not interested) leave the board after this many days;
    # they stay in the Arkib tab and on the student list
    'lead_board_days': _spec('LEAD_BOARD_DAYS', 'Prospek yang selesai kekal di papan selama', 'Peringkat prospek', 30, unit='hari', low=7, high=365),
    # How telephone numbers read and are typed (core/phone.py). Saved numbers are never rewritten when these change.
    'phone_prefix': _spec('PHONE_PREFIX', 'Awalan nombor yang dipaparkan', 'Format nombor telefon', 'plus60', kind='choice',
                          options=[('plus60', '+60 (+6013-347-4009)'), ('60', '60 (6013-347-4009)'), ('0', '0 (013-347-4009)')]),
    'phone_separator': _spec('PHONE_SEPARATOR', 'Pemisah dalam nombor yang dipaparkan', 'Format nombor telefon', 'dash', kind='choice',
                             options=[('dash', 'Sengkang (+6013-347-4009)'), ('space', 'Ruang (+6013 347 4009)'), ('none', 'Tiada (+60133474009)')]),
    'phone_input': _spec('PHONE_INPUT', 'Nombor dalam kotak input bermula dengan', 'Format nombor telefon', '60', kind='choice',
                         options=[('60', '60 (60133474009)'), ('0', '0 (0133474009)'), ('plus60', '+60 (+60133474009)')]),
    # Names of the lead stages (the order and the rules of the stages stay as they are)
    **{f'lead_label_{code}': _spec(f'LEAD_LABEL_{code}', f'Peringkat {i + 1}', 'Peringkat prospek', label, kind='text', pattern=r'.{1,30}')
       for i, (code, label) in enumerate(LEAD_STAGES)},
}


def _clean(name, raw):
    spec = SPECS[name]
    label, kind = spec['label'], spec['kind']
    if kind == 'time':
        value = str(raw or '').strip()
        if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', value):
            raise ValueError(f'{label}: masa mesti dalam format 24 jam HH:MM.')
        return value
    if kind == 'weekdays':
        parts = [p for p in str(raw if not isinstance(raw, (list, tuple)) else ','.join(map(str, raw))).replace(' ', '').split(',') if p != '']
        if not parts or any(p not in '0123456' or len(p) != 1 for p in parts):
            raise ValueError(f'{label}: pilih sekurang-kurangnya satu hari.')
        return ','.join(str(d) for d in sorted({int(p) for p in parts}))
    if kind == 'choice':
        value = str(raw if raw is not None else '').strip()
        if value not in dict(spec['options']):
            raise ValueError(f'{label}: pilih salah satu pilihan yang ada.')
        return value
    if kind == 'text':
        value = ' '.join(str(raw or '').split())
        if spec['pattern'].startswith('[A-Z]'):
            value = value.upper()  # prefixes are capitals
        if not re.fullmatch(spec['pattern'], value):
            raise ValueError(f'{label}: ' + ('huruf besar sahaja, 1 hingga 6 huruf.' if spec['pattern'].startswith('[A-Z]') else 'diperlukan (paling panjang 30 aksara).'))
        return value
    try:
        number = Decimal(str(raw).strip())
    except (InvalidOperation, AttributeError):
        raise ValueError(f'{label}: masukkan nombor.')
    if spec['unit'] != 'RM' and number != number.to_integral_value():
        raise ValueError(f'{label}: masukkan nombor bulat.')
    if not spec['min'] <= number <= spec['max']:
        raise ValueError(f"{label}: mesti antara {spec['min']:,} dan {spec['max']:,}.")
    return int(number) if spec['unit'] != 'RM' else number.quantize(Decimal('0.01'))


def _default(name):
    spec = SPECS[name]
    return Decimal(spec['default']) if spec['unit'] == 'RM' else spec['default']


def values():
    """Every setting: the saved value, or the default."""
    from business_config.models import BusinessSetting
    saved = dict(BusinessSetting.objects.filter(key__in=[s['key'] for s in SPECS.values()]).values_list('key', 'value'))
    out = {}
    for name, spec in SPECS.items():
        try:
            out[name] = _clean(name, saved[spec['key']]) if spec['key'] in saved else _default(name)
        except (ValueError, KeyError):
            out[name] = _default(name)  # a damaged value never switches anything off
    return out


def value(name):
    return values()[name]


def _plain(number):
    return float(number) if isinstance(number, Decimal) else number


def listing():
    current = values()
    return [{
        'name': name, 'label': s['label'], 'unit': s['unit'], 'group': s['group'], 'kind': s['kind'], 'value': _plain(current[name]),
        'default': s['default'], 'min': s['min'], 'max': s['max'],
        'options': [{'value': v, 'label': l} for v, l in s['options']] if s['options'] else None,
    } for name, s in SPECS.items()]


def stage_labels():
    """Names of the lead stages as the centre has set them."""
    current = values()
    return {code: current[f'lead_label_{code}'] for code, _ in LEAD_STAGES}


@transaction.atomic
def save(changes, user):
    from business_config.models import BusinessSetting
    unknown = [k for k in changes if k not in SPECS]
    if unknown:
        raise ValidationError({k: 'Medan tidak dikenali.' for k in unknown})
    cleaned, errors = {}, {}
    for name, raw in changes.items():
        try:
            cleaned[name] = _clean(name, raw)
        except ValueError as err:
            errors[name] = str(err)
    if errors:
        raise ValidationError(errors)
    current = values()
    merged = {**current, **cleaned}
    if merged['voucher_tier1'] >= merged['voucher_tier2']:
        raise ValidationError({'voucher_tier2': 'Had baucar Supervisor mesti lebih tinggi daripada had baucar Admin.'})
    if merged['default_work_start'] >= merged['default_work_end']:
        raise ValidationError({'default_work_end': 'Waktu keluar mesti selepas waktu masuk.'})
    if merged['checkin_late_minutes'] > merged['checkin_open_after']:
        raise ValidationError({'checkin_late_minutes': 'Masa dikira lewat mesti sebelum imbasan ditutup.'})
    for name, new in cleaned.items():
        if new == current[name]:
            continue
        key, label = SPECS[name]['key'], SPECS[name]['label']
        BusinessSetting.objects.update_or_create(key=key, defaults={'value': str(new), 'description': label})
        SettingEvent.objects.create(key=key, label=label[:60], old_value=str(current[name]), new_value=str(new), by_name=display_name(user))
    return listing()


@api_view(['GET', 'PUT'])
def thresholds(request):
    """Everyone reads the settings (screens explain who approves what); Management changes them."""
    if request.method == 'PUT':
        require_role(request, MANAGEMENT)
        return Response(save(request.data, request.user))
    return Response(listing())
