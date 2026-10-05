"""The grade (form) list, configurable in master data (j-status.doc: Grade ** - grade code,
grade name, next grade, description). Category `1_form`; approved entries only."""
from rest_framework.exceptions import ValidationError

CATEGORY = '1_form'
LEVELS = {'PRIMARY': 'Rendah', 'LOWER': 'Menengah Rendah', 'UPPER': 'Menengah Atas'}
# Older entries stored the level in English
LEVEL_ALIASES = {'primary': 'PRIMARY', 'lower sec': 'LOWER', 'upper sec': 'UPPER'}
# Used only if the master list is empty, so the system still works on a fresh database
FALLBACK = [
    ('S5', 'Darjah 5', 'PRIMARY', 'S6'), ('S6', 'Darjah 6', 'PRIMARY', 'F1'),
    ('F1', 'Tingkatan 1', 'LOWER', 'F2'), ('F2', 'Tingkatan 2', 'LOWER', 'F3'), ('F3', 'Tingkatan 3', 'LOWER', 'F4'),
    ('F4', 'Tingkatan 4', 'UPPER', 'F5'), ('F5', 'Tingkatan 5', 'UPPER', ''),
]


# Fee group of the seeded grades; a grade added later picks its group in master data (meta.fee_group)
LEGACY_FEE_GROUP = {'S5': 'DARJAH_5', 'S6': 'DARJAH_6', 'F1': 'SECONDARY', 'F2': 'SECONDARY',
                    'F3': 'SECONDARY', 'F4': 'SECONDARY', 'F5': 'SECONDARY'}


def _level(value):
    value = str(value or '').strip()
    return value if value in LEVELS else LEVEL_ALIASES.get(value.lower(), 'UPPER')


def grade_list():
    """Approved grades, lowest first: code, label, level, next, description, order."""
    from business_config.models import DynamicMasterData
    rows = []
    for item in DynamicMasterData.objects.filter(category=CATEGORY, status='APPROVED'):
        meta = item.meta_info if isinstance(item.meta_info, dict) else {}
        try:
            order = int(meta.get('order', 999))
        except (TypeError, ValueError):
            order = 999
        rows.append({
            'code': item.code, 'label': item.label, 'level': _level(meta.get('level')),
            'next': meta.get('next', '') or '',
            'fee_group': meta.get('fee_group') or LEGACY_FEE_GROUP.get(item.code, ''), 'description': meta.get('description', '') or '', 'order': order,
        })
    if not rows:
        rows = [{'code': c, 'label': l, 'level': lv, 'next': n, 'fee_group': LEGACY_FEE_GROUP.get(c, ''), 'description': '', 'order': i}
                for i, (c, l, lv, n) in enumerate(FALLBACK)]
    return sorted(rows, key=lambda r: (r['order'], r['code']))


def by_code():
    return {g['code']: g for g in grade_list()}


def label(code):
    return by_code().get(code, {}).get('label', code)


def level_of(code):
    return by_code().get(code, {}).get('level', 'UPPER')


def display_order():
    """Highest grade first, as the dashboard lists forms (Tingkatan 5 ... Darjah)."""
    return [g['code'] for g in reversed(grade_list())]


def validate(code):
    if code not in by_code():
        raise ValidationError('Tingkatan / darjah tidak sah. Pilih daripada senarai gred di Data Induk.')
    return code
