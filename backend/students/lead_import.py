"""Bulk import of leads from a CSV the centre has collected (a Facebook form export, a booth sign-up sheet...).

The browser reads the file and sends the rows; this module checks every row against the centre's own lists
(sources, grades, subjects, campaigns), spots numbers the centre already has, and only then creates leads.
Nothing is trusted from the preview: committing checks the rows again against the data as it is at that moment.
"""
import re
from datetime import date, datetime
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework.exceptions import ValidationError
from business_config.models import DynamicMasterData, SubjectMaster
from core import grades, numbering, phone as phones
from . import leads
from .models import Lead, Student

MAX_ROWS = 1000
SUBJECT_SPLIT = re.compile(r'[;|/,]')


def clean_phone(raw):
    """The number as the system keeps it (core/phone.py: 60133474009), whatever style the file used and even when Excel dropped
    the leading 0. An empty string means it cannot be a phone number."""
    return phones.normalize(raw) or ''


def _lookup(items):
    """label or code, in any capitalisation -> the code"""
    table = {}
    for code, label in items:
        table[str(code).strip().lower()] = code
        table[str(label).strip().lower()] = code
    return table


def _parse_date(text):
    text = str(text or '').strip()
    if not text:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%d/%m/%y'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(text)


class Lists:
    """The centre's own lists, loaded once for a whole file."""

    def __init__(self):
        approved = DynamicMasterData.objects.filter(status='APPROVED')
        self.sources = _lookup(approved.filter(category='3_lead_source').values_list('code', 'label'))
        self.campaigns = _lookup(approved.filter(category='22_lead_campaign').values_list('label', 'label'))
        self.schools = _lookup(approved.filter(category='6_school').values_list('label', 'label'))
        self.grades = _lookup((g['code'], g['label']) for g in grades.grade_list())
        self.subjects = _lookup(SubjectMaster.objects.filter(is_active=True).values_list('code', 'name'))

        # Numbers the centre already has, so the same family is not entered twice
        self.known_phones = {}
        for lead in Lead.objects.exclude(phone='').values_list('phone', 'lead_id'):
            self.known_phones.setdefault(clean_phone(lead[0]), f'prospek {lead[1]}')
        for student in Student.objects.values_list('phone_number', 'parent1_phone', 'parent2_phone', 'student_id'):
            for number in student[:3]:
                if number:
                    self.known_phones.setdefault(clean_phone(number), f'pelajar {student[3]}')
        self.known_phones.pop('', None)


def check_defaults(defaults, lists):
    defaults = defaults or {}
    out, errors = {}, {}
    source = str(defaults.get('lead_source') or '').strip()
    if source:
        if source.lower() not in lists.sources:
            errors['lead_source'] = 'Sumber tidak dikenali.'
        else:
            out['lead_source'] = lists.sources[source.lower()]
    campaign = str(defaults.get('campaign') or '').strip()
    if campaign:
        if campaign.lower() not in lists.campaigns:
            errors['campaign'] = 'Kempen tiada dalam Data induk.'
        else:
            out['campaign'] = lists.campaigns[campaign.lower()]
    status = str(defaults.get('status') or 'ENQUIRY')
    if status not in leads.MOVABLE_STAGES:
        errors['status'] = 'Peringkat permulaan tidak sah.'
    out['status'] = status
    out['assigned_to'] = str(defaults.get('assigned_to') or '').strip()[:100]
    if errors:
        raise ValidationError({'defaults': errors})
    return out


def check_row(raw, defaults, lists, seen, number):
    """One row -> {'status': ok | duplicate | error, 'messages': [...], 'data': {...}}"""
    errors = []
    value = lambda key: str(raw.get(key) or '').strip()  # noqa: E731
    data = {}

    phone = clean_phone(value('phone'))
    if not phone:
        errors.append('No. telefon tiada atau tidak sah.')
    data['phone'] = phone or value('phone')

    source = value('lead_source') or defaults.get('lead_source', '')
    if not source:
        errors.append('Sumber diperlukan (dalam fail atau sebagai nilai lalai).')
    elif source.lower() not in lists.sources:
        errors.append(f'Sumber "{source}" tidak dikenali.')
    else:
        data['lead_source'] = lists.sources[source.lower()]

    form = value('form_level')
    if form:
        if form.lower() in lists.grades:
            data['form_level'] = lists.grades[form.lower()]
        else:
            errors.append(f'Tingkatan "{form}" tidak dikenali.')
    else:
        data['form_level'] = ''

    names = [part.strip() for part in SUBJECT_SPLIT.split(value('subjects')) if part.strip()]
    codes = []
    for name in names:
        if name.lower() in lists.subjects:
            codes.append(lists.subjects[name.lower()])
        else:
            errors.append(f'Subjek "{name}" tidak dikenali.')
    data['interested_subjects'] = codes

    campaign = value('campaign') or defaults.get('campaign', '')
    if campaign:
        if campaign.lower() in lists.campaigns:
            data['campaign'] = lists.campaigns[campaign.lower()]
        else:
            errors.append(f'Kempen "{campaign}" tiada dalam Data induk.')
    else:
        data['campaign'] = ''

    school = value('school_name')
    data['school_name'] = lists.schools.get(school.lower(), school)  # a school not in the list is kept as typed

    email = value('email')
    if email:
        try:
            validate_email(email)
        except DjangoValidationError:
            errors.append('E-mel tidak sah.')
    data['email'] = email

    try:
        data['enquiry_date'] = _parse_date(value('enquiry_date'))
    except ValueError as err:
        errors.append(f'Tarikh "{err}" tidak sah (gunakan HH/BB/TTTT atau TTTT-BB-HH).')
        data['enquiry_date'] = None

    for field, limit in (('student_name', 150), ('parent_name', 150), ('notes', 2000)):
        data[field] = value(field)
        if len(data[field]) > limit:
            errors.append(f'{field} terlalu panjang (paling banyak {limit} aksara).')

    if errors:
        return {'status': 'error', 'messages': errors, 'data': data}

    key = clean_phone(data['phone'])
    if key in seen:
        return {'status': 'duplicate', 'messages': [f'No. telefon sama dengan baris {seen[key]} dalam fail ini.'], 'data': data}
    if key in lists.known_phones:
        return {'status': 'duplicate', 'messages': [f'No. telefon sudah ada ({lists.known_phones[key]}).'], 'data': data}
    seen[key] = number  # a later row with this number is the duplicate
    return {'status': 'ok', 'messages': [], 'data': data}


def check_rows(rows, defaults):
    if not isinstance(rows, list) or not rows:
        raise ValidationError({'rows': 'Fail tiada baris untuk diimport.'})
    if len(rows) > MAX_ROWS:
        raise ValidationError({'rows': f'Terlalu banyak baris (paling banyak {MAX_ROWS} sekali muat naik).'})
    lists = Lists()
    defaults = check_defaults(defaults, lists)
    seen, results = {}, []
    for number, raw in enumerate(rows, start=1):
        result = check_row(raw if isinstance(raw, dict) else {}, defaults, lists, seen, number)
        results.append({'row': number, **result})
    return defaults, results


def summary(results):
    counts = {'ok': 0, 'duplicate': 0, 'error': 0}
    for r in results:
        counts[r['status']] += 1
    return counts


def preview(rows, defaults):
    defaults, results = check_rows(rows, defaults)
    return {'committed': False, 'counts': summary(results), 'rows': [_public(r) for r in results]}


def commit(rows, defaults, by, filename=''):
    """Create a lead for every good row (duplicates and errors are left out and reported)."""
    defaults, results = check_rows(rows, defaults)
    created = []
    for result in results:
        if result['status'] != 'ok':
            continue
        data = result['data']
        on = data['enquiry_date'] or date.today()
        lead = Lead.objects.create(
            lead_id=numbering.next_number(Lead, 'lead_id', f"LD-{on.year}-", 3),
            student_name=data['student_name'], parent_name=data['parent_name'], phone=data['phone'], email=data['email'],
            form_level=data['form_level'], school_name=data['school_name'], lead_source=data['lead_source'],
            campaign=data['campaign'], interested_subjects=data['interested_subjects'], notes=data['notes'],
            status=defaults['status'], enquiry_date=on, stage_changed_at=on,
            assigned_to=defaults['assigned_to'] or by,
        )
        leads.log_activity(lead, by, 'Diimport dari CSV', filename, on=on)
        created.append(lead.lead_id)
        result['lead_id'] = lead.lead_id
    return {'committed': True, 'counts': summary(results), 'created': created, 'rows': [_public(r) for r in results]}


def _public(result):
    data = result['data']
    return {
        'row': result['row'], 'status': result['status'], 'messages': result['messages'], 'lead_id': result.get('lead_id'),
        'name': data.get('student_name') or data.get('parent_name') or '', 'phone': data.get('phone', ''),
    }
