"""Change requests: setup data is changed by proposing the change and an approver deciding it
(j-status.doc: the person in charge edits until approved; after that only the approver).

Each kind of setup data has a handler that says who may propose and who may decide, checks the
values and applies them. A change made by someone who may decide it applies at once but is recorded
in the same list; anyone else's waits as PENDING."""
import re
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from .models import ChangeRequest
from .permissions import ALL_ROLES, APPROVER_ROLES, MANAGEMENT, ROLE_LABELS, display_name, get_role


class Handler:
    kind = ''
    fields = {}  # field -> label shown in the list of changes
    proposers = ALL_ROLES  # who may ask for a change
    approvers = APPROVER_ROLES  # who may decide it (their own changes apply at once)

    def validate(self, action, target_id, data, ignore=None):
        """Return (values to apply, values they replace, label of the record)."""
        raise NotImplementedError

    def apply(self, action, target_id, values, req=None):
        """Save the change and return the record. `req` is the request being applied (who asked, who decided)."""
        raise NotImplementedError

    def display(self, field, value):
        return '' if value is None else str(value)


class ModelHandler(Handler):
    """Changes to one Django model, checked with its serializer."""
    key_field = ''  # unique field, also checked between waiting requests to add a record
    immutable = ()  # fields that cannot change once the record exists
    deletable = False  # whether a request may remove a record
    noun = ''  # for messages

    def model(self):
        raise NotImplementedError

    def serializer(self, data, instance=None):
        raise NotImplementedError

    def normalise(self, data, creating):
        return data

    def label(self, get):
        """Name of the record, from a function that returns a field's value."""
        raise NotImplementedError

    def delete_problem(self, obj):
        """Why the record cannot be removed, or None."""
        return None

    def save_extra(self, action, req):
        """Extra values stored with the record (who created it, ...)."""
        return {}

    def duplicate_pending(self, values, others):
        key = values.get(self.key_field)
        if key is not None and others.filter(action='CREATE', **{f'payload__{self.key_field}': key}).exists():
            raise ValidationError({self.key_field: f'{self.fields[self.key_field]} {key} sudah dimohon dan menunggu kelulusan.'})

    @staticmethod
    def jsonable(value):
        if hasattr(value, 'isoformat'):
            return value.isoformat()
        if isinstance(value, Decimal):
            return f'{value:.2f}'
        return value

    def _json(self, values):
        return {k: self.jsonable(v) for k, v in values.items()}

    def _others(self, ignore):
        qs = ChangeRequest.objects.filter(kind=self.kind, status='PENDING')
        return qs.exclude(pk=ignore.pk) if ignore else qs

    def validate(self, action, target_id, data, ignore=None):
        data = {k: data[k] for k in self.fields if k in data}
        others = self._others(ignore)
        if action == 'CREATE':
            serializer = self.serializer(self.normalise(data, True))
            serializer.is_valid(raise_exception=True)
            values = {k: v for k, v in serializer.validated_data.items() if k in self.fields}
            self.duplicate_pending(values, others)
            return self._json(values), {}, self.label(values.get)

        obj = self.model().objects.filter(pk=target_id).first()
        if not obj:
            raise ValidationError(f'{self.noun.capitalize()} tidak dijumpai.')
        if others.filter(action__in=('UPDATE', 'DELETE'), target_id=obj.pk).exists():
            raise ValidationError(f'Sudah ada permohonan untuk {self.noun} ini yang menunggu kelulusan.')
        label = self.label(lambda f: getattr(obj, f))
        if action == 'DELETE':
            if not self.deletable:
                raise ValidationError(f'{self.noun.capitalize()} tidak boleh dipadam.')
            problem = self.delete_problem(obj)
            if problem:
                raise ValidationError(problem)
            return {}, self._json({f: getattr(obj, f) for f in self.fields}), label

        for field in self.immutable:
            if field in data and data[field] != getattr(obj, field):
                raise ValidationError({field: f'{self.fields[field]} tidak boleh diubah kerana ia digunakan dalam rekod sedia ada.'})
            data.pop(field, None)
        serializer = self.serializer(self.normalise(data, False), obj)
        serializer.is_valid(raise_exception=True)
        values = {k: v for k, v in serializer.validated_data.items() if k in self.fields and getattr(obj, k) != v}
        if not values:
            raise ValidationError('Tiada perubahan untuk dihantar.')
        return self._json(values), self._json({k: getattr(obj, k) for k in values}), label

    def apply(self, action, target_id, values, req=None):
        obj = self.model().objects.filter(pk=target_id).first() if action in ('UPDATE', 'DELETE') else None
        if action == 'DELETE':
            obj.delete()
            return SimpleNamespace(pk=target_id)
        serializer = self.serializer(values, obj)
        serializer.is_valid(raise_exception=True)
        return serializer.save(**self.save_extra(action, req))


class SubjectHandler(ModelHandler):
    kind = 'SUBJECT'
    fields = {'code': 'Kod', 'name': 'Nama', 'level_category': 'Peringkat', 'stream': 'Aliran', 'is_active': 'Status'}
    key_field = 'code'
    immutable = ('code',)
    noun = 'subjek'
    LEVELS = {'PRIMARY': 'Rendah (Darjah)', 'LOWER_SEC': 'Menengah rendah (T1-T3)', 'UPPER_SEC': 'Menengah atas (T4-T5)'}
    STREAMS = {'TERAS': 'Teras', 'SAINS': 'Sains', 'SASTERA': 'Sastera / Akaun'}

    def model(self):
        from business_config.models import SubjectMaster
        return SubjectMaster

    def serializer(self, data, instance=None):
        from business_config.serializers import SubjectMasterSerializer
        return SubjectMasterSerializer(instance, data=data, partial=instance is not None)

    def normalise(self, data, creating):
        if 'code' in data:
            data['code'] = str(data['code']).strip().upper()
        if 'name' in data:
            data['name'] = str(data['name']).strip()
        if creating:
            data.setdefault('code', '')
            data.setdefault('name', '')
            data.setdefault('is_active', True)
        return data

    def label(self, get):
        return f"{get('code')} {get('name')}"

    def display(self, field, value):
        if field == 'level_category':
            return self.LEVELS.get(value, value)
        if field == 'stream':
            return self.STREAMS.get(value, value)
        if field == 'is_active':
            return 'Aktif' if value else 'Tidak aktif'
        return super().display(field, value)


class VendorHandler(ModelHandler):
    """Vendor details (j-status.doc: Supervisor holds them, Management approves or rejects the detail)."""
    kind = 'VENDOR'
    fields = {
        'vendor_id': 'No. SSM / ID', 'vendor_name': 'Nama pembekal', 'pic_name': 'PIC', 'phone_number': 'Telefon',
        'address': 'Alamat', 'bank_name': 'Bank', 'bank_account': 'No. akaun bank', 'tin_number': 'No. cukai (TIN)',
        'status': 'Status',
    }
    proposers = APPROVER_ROLES
    approvers = (MANAGEMENT,)
    key_field = 'vendor_id'
    noun = 'pembekal'

    def model(self):
        from expenses.models import Vendor
        return Vendor

    def serializer(self, data, instance=None):
        from expenses.serializers import VendorSerializer
        return VendorSerializer(instance, data=data, partial=instance is not None)

    def normalise(self, data, creating):
        data = {k: (str(v).strip() if isinstance(v, str) else v) for k, v in data.items()}
        if creating:
            data.setdefault('status', 'ACTIVE')
        return data

    def label(self, get):
        return f"{get('vendor_name')} ({get('vendor_id')})"

    def display(self, field, value):
        if field == 'status':
            return 'Aktif' if value == 'ACTIVE' else 'Tidak aktif'
        return str(value) if value not in (None, '') else '—'


class MasterEntryHandler(Handler):
    """Entries of a master-data list that Management controls (j-status.doc: Supervisor sets the
    categories and monthly budget, Management approves or rejects)."""
    master = ''  # DynamicMasterData.category
    proposers = APPROVER_ROLES
    approvers = (MANAGEMENT,)
    editable = ()  # fields that may change after the entry exists
    noun = ''

    def _entries(self):
        from business_config.models import DynamicMasterData
        return DynamicMasterData.objects.filter(category=self.master)

    def _code_and_label(self, data):
        code = re.sub(r'\s', '', str(data.get('code', ''))).upper()
        label = str(data.get('label', '')).strip()
        if not re.fullmatch(r'[A-Z0-9_]{1,60}', code):
            raise ValidationError({'code': 'Kod mesti huruf besar, nombor atau garis bawah sahaja, tanpa ruang.'})
        if not label or len(label) > 150:
            raise ValidationError({'label': 'Nama diperlukan (paling panjang 150 aksara).'})
        return code, label

    def new_values(self, data):
        """Checked values for a new entry."""
        raise NotImplementedError

    def changed_values(self, data):
        """Checked values for the fields that may change."""
        raise NotImplementedError

    def current(self, entry):
        """The entry's fields as the request sees them."""
        raise NotImplementedError

    def meta(self, values, entry=None):
        raise NotImplementedError

    def validate(self, action, target_id, data, ignore=None):
        data = {k: data[k] for k in self.fields if k in data}
        others = ChangeRequest.objects.filter(kind=self.kind, status='PENDING')
        if ignore:
            others = others.exclude(pk=ignore.pk)
        if action == 'CREATE':
            values = self.new_values(data)
            code, label = values['code'], values['label']
            if self._entries().filter(code=code).exists():
                raise ValidationError({'code': f'Kod {code} sudah digunakan.'})
            if self._entries().filter(label__iexact=label).exists():
                raise ValidationError({'label': f'{self.noun.capitalize()} {label} sudah wujud.'})
            if others.filter(action='CREATE').filter(payload__code=code).exists() or others.filter(action='CREATE', payload__label__iexact=label).exists():
                raise ValidationError(f'{self.noun.capitalize()} ini sudah dimohon dan menunggu kelulusan.')
            return values, {}, f'{code} {label}'

        entry = self._entries().filter(pk=target_id).first()
        if not entry:
            raise ValidationError(f'{self.noun.capitalize()} tidak dijumpai.')
        current = self.current(entry)
        for field, value in data.items():
            if field not in self.editable and value != current.get(field):
                raise ValidationError({field: f'{self.fields[field]} tidak boleh diubah kerana ia digunakan dalam baucar sedia ada.'})
        values = {k: v for k, v in self.changed_values({f: data[f] for f in self.editable if f in data}).items() if current.get(k) != v}
        if not values:
            raise ValidationError('Tiada perubahan untuk dihantar.')
        if others.filter(action='UPDATE', target_id=entry.pk).exists():
            raise ValidationError(f'Sudah ada permohonan ubah untuk {self.noun} ini yang menunggu kelulusan.')
        return values, {k: current[k] for k in values}, f'{entry.code} {entry.label}'

    def apply(self, action, target_id, values, req=None):
        from business_config.models import DynamicMasterData
        if action == 'CREATE':
            return DynamicMasterData.objects.create(
                category=self.master, code=values['code'], label=values['label'], meta_info=self.meta(values), status='APPROVED',
                created_by=req.requested_by_name if req else '', approved_by=req.decided_by if req else '',
                proposal_note=req.note if req else '', is_locked=True,
            )
        entry = self._entries().get(pk=target_id)
        entry.meta_info = self.meta(values, entry)
        entry.save()
        return entry


class ExpenseCategoryHandler(MasterEntryHandler):
    kind = 'EXPENSE_CATEGORY'
    master = '18_expense_cat'
    fields = {'code': 'Kod', 'label': 'Nama kategori', 'budget': 'Bajet bulanan'}
    editable = ('budget',)
    noun = 'kategori'

    @staticmethod
    def _budget(value):
        try:
            budget = Decimal(str(value if value not in (None, '') else 0)).quantize(Decimal('0.01'))
        except InvalidOperation:
            raise ValidationError({'budget': 'Bajet mesti nombor.'})
        if budget < 0 or budget > Decimal('10000000'):
            raise ValidationError({'budget': 'Bajet tidak sah.'})
        return float(budget)

    def new_values(self, data):
        code, label = self._code_and_label(data)
        return {'code': code, 'label': label, 'budget': self._budget(data.get('budget'))}

    def changed_values(self, data):
        return {'budget': self._budget(data['budget'])} if 'budget' in data else {}

    def current(self, entry):
        return {'code': entry.code, 'label': entry.label, 'budget': float(entry.meta_info.get('budget') or 0)}

    def meta(self, values, entry=None):
        meta = dict(entry.meta_info) if entry else {}
        if 'budget' in values:
            meta['budget'] = values['budget']
        return meta

    def display(self, field, value):
        return f'RM {float(value):,.2f}' if field == 'budget' else str(value)


class ExpenseSubcategoryHandler(MasterEntryHandler):
    kind = 'EXPENSE_SUBCATEGORY'
    master = '19_expense_subcat'
    fields = {'code': 'Kod', 'label': 'Nama subkategori', 'cat': 'Kategori'}
    editable = ('cat',)
    noun = 'subkategori'

    def _category(self, code):
        from business_config.models import DynamicMasterData
        code = str(code or '')
        if not DynamicMasterData.objects.filter(category='18_expense_cat', code=code, status='APPROVED').exists():
            raise ValidationError({'cat': 'Pilih kategori perbelanjaan yang sah.'})
        return code

    def new_values(self, data):
        code, label = self._code_and_label(data)
        return {'code': code, 'label': label, 'cat': self._category(data.get('cat'))}

    def changed_values(self, data):
        return {'cat': self._category(data['cat'])} if 'cat' in data else {}

    def current(self, entry):
        return {'code': entry.code, 'label': entry.label, 'cat': entry.meta_info.get('cat', '')}

    def meta(self, values, entry=None):
        meta = dict(entry.meta_info) if entry else {}
        if 'cat' in values:
            meta['cat'] = values['cat']
        return meta

    def display(self, field, value):
        if field == 'cat':
            from business_config.models import DynamicMasterData
            return DynamicMasterData.objects.filter(category='18_expense_cat', code=value).values_list('label', flat=True).first() or str(value)
        return str(value)


class TeacherHandler(Handler):
    """Teachers (j-status.doc: Supervisor adds a teacher and converts them to active / inactive,
    Management approves or rejects). The pay rate is set when the teacher is added; later rises
    go through the rate-increment flow, which keeps their history."""
    kind = 'TEACHER'
    fields = {
        'teacher_code': 'Kod guru', 'full_name': 'Nama', 'phone_number': 'Telefon', 'email': 'E-mel', 'teacher_type': 'Kategori',
        'is_active': 'Status', 'rate_per_session': 'Kadar sesi', 'bank_name': 'Bank', 'bank_account': 'No. akaun bank',
        'teaching_permit_expiry': 'Permit mengajar luput', 'subjects_qualified': 'Subjek', 'joined_date': 'Tarikh sertai',
        'teaching_since': 'Mula mengajar', 'remarks': 'Catatan',
    }
    proposers = APPROVER_ROLES
    approvers = (MANAGEMENT,)
    TYPES = {'PERMANENT': 'Tetap (Permanent)', 'REPLACEMENT': 'Sambilan (Part-time)'}
    DATES = ('teaching_permit_expiry', 'joined_date', 'teaching_since')
    TEXT = ('teacher_code', 'full_name', 'phone_number', 'email', 'bank_name', 'bank_account', 'remarks')

    @staticmethod
    def _jsonable(value):
        if hasattr(value, 'isoformat'):
            return value.isoformat()
        if isinstance(value, Decimal):
            return f'{value:.2f}'
        if isinstance(value, (list, tuple, set)):
            return sorted(getattr(v, 'pk', v) for v in value)
        return value

    def _serializer(self, data, instance=None):
        from teachers.serializers import TeacherSerializer
        return TeacherSerializer(instance, data=data, partial=instance is not None)

    def _current(self, teacher):
        current = {f: self._jsonable(getattr(teacher, f)) for f in self.fields if f != 'subjects_qualified'}
        current['subjects_qualified'] = sorted(teacher.subjects_qualified.values_list('pk', flat=True))
        return current

    def _clean(self, data):
        for f in self.TEXT:
            if isinstance(data.get(f), str):
                data[f] = data[f].strip()
        for f in self.DATES:
            if f in data and data[f] in ('', None):
                data[f] = None
        return data

    def validate(self, action, target_id, data, ignore=None):
        from academic.models import ClassTimetable
        from teachers.models import Teacher
        data = self._clean({k: data[k] for k in self.fields if k in data})
        others = ChangeRequest.objects.filter(kind=self.kind, status='PENDING')
        if ignore:
            others = others.exclude(pk=ignore.pk)

        if action == 'CREATE':
            code = re.sub(r'\s', '', str(data.get('teacher_code', ''))).upper()
            if not re.fullmatch(r'[A-Z0-9]{1,12}', code):
                raise ValidationError({'teacher_code': 'Kod guru mesti 1 hingga 12 huruf atau nombor, cth. NAK. Ia digunakan dalam kod kelas.'})
            data['teacher_code'] = code
            data.setdefault('is_active', True)
            if data.get('rate_per_session') in (None, ''):
                raise ValidationError({'rate_per_session': 'Kadar sesi permulaan diperlukan.'})
            serializer = self._serializer(data)
            serializer.is_valid(raise_exception=True)
            if not 0 <= serializer.validated_data['rate_per_session'] <= 5000:
                raise ValidationError({'rate_per_session': 'Kadar sesi tidak sah.'})
            values = {k: self._jsonable(v) for k, v in serializer.validated_data.items()}
            if others.filter(action='CREATE', payload__teacher_code=code).exists():
                raise ValidationError({'teacher_code': f'Kod {code} sudah dimohon dan menunggu kelulusan.'})
            return values, {}, f"{code} {values['full_name']}"

        teacher = Teacher.objects.filter(pk=target_id).first()
        if not teacher:
            raise ValidationError('Guru tidak dijumpai.')
        if 'teacher_code' in data and str(data['teacher_code']).upper() != teacher.teacher_code:
            raise ValidationError({'teacher_code': 'Kod guru tidak boleh diubah kerana ia digunakan dalam kod kelas.'})
        if 'rate_per_session' in data:
            try:
                same = Decimal(str(data['rate_per_session'])) == teacher.rate_per_session
            except InvalidOperation:
                same = False
            if not same:
                raise ValidationError({'rate_per_session': 'Kadar guru diubah melalui Kenaikan kadar, supaya sejarah kenaikan direkod.'})
        data.pop('teacher_code', None)
        data.pop('rate_per_session', None)
        serializer = self._serializer(data, teacher)
        serializer.is_valid(raise_exception=True)
        current = self._current(teacher)
        values = {k: self._jsonable(v) for k, v in serializer.validated_data.items() if self._jsonable(v) != current[k]}
        if not values:
            raise ValidationError('Tiada perubahan untuk dihantar.')
        if values.get('is_active') is False:
            n = ClassTimetable.objects.filter(teacher=teacher).count()
            if n:
                raise ValidationError({'is_active': f'Guru ini masih ditugaskan pada {n} kelas. Tukar guru kelas itu dahulu.'})
        if others.filter(action='UPDATE', target_id=teacher.pk).exists():
            raise ValidationError('Sudah ada permohonan ubah untuk guru ini yang menunggu kelulusan.')
        return values, {k: current[k] for k in values}, f'{teacher.teacher_code} {teacher.full_name}'

    def apply(self, action, target_id, values, req=None):
        from teachers.models import Teacher
        teacher = Teacher.objects.filter(pk=target_id).first() if action == 'UPDATE' else None
        serializer = self._serializer(values, teacher)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def display(self, field, value):
        from business_config.models import SubjectMaster
        if value in (None, ''):
            return '—'
        if field == 'teacher_type':
            return self.TYPES.get(value, value)
        if field == 'is_active':
            return 'Aktif' if value else 'Tidak aktif'
        if field == 'rate_per_session':
            return f'RM {float(value):,.2f}'
        if field == 'subjects_qualified':
            names = dict(SubjectMaster.objects.filter(pk__in=value).values_list('pk', 'name'))
            return ', '.join(names.get(pk, str(pk)) for pk in value) or '—'
        if field in self.DATES:
            y, m, d = str(value).split('-')
            return f'{d}/{m}/{y}'
        return str(value)


class PricingTierHandler(ModelHandler):
    """Fee packages: a group (e.g. Darjah 1-4), its packages and the per-subject rate. The package
    total always follows the rate. A group is named once; renaming it renames every package in it."""
    kind = 'PRICING_TIER'
    fields = {'level_category': 'Kumpulan', 'group_label': 'Nama kumpulan', 'subject_count': 'Bilangan subjek', 'price_per_subject': 'Kadar / subjek'}
    proposers = APPROVER_ROLES
    approvers = (MANAGEMENT,)
    immutable = ('level_category', 'subject_count')
    deletable = True
    noun = 'pakej yuran'

    def model(self):
        from business_config.models import PricingTier
        return PricingTier

    def serializer(self, data, instance=None):
        from business_config.serializers import PricingTierSerializer
        return PricingTierSerializer(instance, data=data, partial=instance is not None)

    def normalise(self, data, creating):
        if 'group_label' in data:
            data['group_label'] = str(data['group_label']).strip()
        return data

    # Names of the groups that came with the system, shown when a group has not been given one
    DEFAULT_GROUPS = {'SECONDARY': 'Sekolah menengah', 'DARJAH_5': 'Darjah 5', 'DARJAH_6': 'Darjah 6', 'WALK_IN': 'Walk-in'}

    def label(self, get):
        group = get('group_label') or self.DEFAULT_GROUPS.get(get('level_category'), get('level_category'))
        return f"{group} · {get('subject_count')} subjek"

    def duplicate_pending(self, values, others):
        group, count = values.get('level_category'), values.get('subject_count')
        if others.filter(action='CREATE', payload__level_category=group, payload__subject_count=count).exists():
            raise ValidationError('Pakej ini sudah dimohon dan menunggu kelulusan.')

    def delete_problem(self, tier):
        from . import grades
        if self.model().objects.filter(level_category=tier.level_category).count() > 1:
            return None
        using = [g['label'] for g in grades.grade_list() if g['fee_group'] == tier.level_category]
        if using:
            return f"Pakej terakhir kumpulan ini masih digunakan oleh {', '.join(using)}. Pilih kumpulan lain pada gred itu dahulu."
        return None

    def apply(self, action, target_id, values, req=None):
        tier = super().apply(action, target_id, values, req)
        if action == 'UPDATE' and 'group_label' in values:
            self.model().objects.filter(level_category=tier.level_category).update(group_label=values['group_label'])
        return tier

    def display(self, field, value):
        if field == 'price_per_subject':
            return f'RM {float(value):,.2f}'
        if field == 'subject_count':
            return f'{value} subjek'
        return str(value) if value not in (None, '') else '—'


class DiscountHandler(ModelHandler):
    """Discount types and voucher codes (used at the counter and on student accounts)."""
    kind = 'DISCOUNT'
    fields = {
        'name': 'Nama diskaun', 'code': 'Kod baucar', 'mode': 'Jenis nilai', 'value': 'Nilai', 'recurring': 'Berulang',
        'valid_from': 'Sah dari', 'valid_until': 'Sah hingga', 'max_uses': 'Had penggunaan', 'is_active': 'Status',
    }
    proposers = APPROVER_ROLES
    approvers = (MANAGEMENT,)
    key_field = 'code'
    immutable = ('code',)
    deletable = True
    noun = 'diskaun'

    def model(self):
        from billing.models import Discount
        return Discount

    def serializer(self, data, instance=None):
        from billing.serializers import DiscountSerializer
        return DiscountSerializer(instance, data=data, partial=instance is not None)

    def normalise(self, data, creating):
        for f in ('valid_from', 'valid_until', 'max_uses'):
            if f in data and data[f] in ('', None):
                data[f] = None
        if 'name' in data:
            data['name'] = str(data['name']).strip()
        if 'code' in data:
            data['code'] = str(data['code']).strip().upper()
        if creating:
            data.setdefault('is_active', True)
        return data

    def label(self, get):
        return f"{get('name')} ({get('code')})"

    def delete_problem(self, discount):
        if discount.used_count or discount.invoices.exists() or discount.students.exists():
            return 'Diskaun ini telah digunakan. Nyahaktifkan sahaja.'
        return None

    def save_extra(self, action, req):
        return {'created_by': req.requested_by_name} if action == 'CREATE' and req else {}

    def display(self, field, value):
        if value in (None, ''):
            return 'Tiada had' if field == 'max_uses' else '—'
        if field == 'mode':
            return 'RM' if value == 'FIXED' else '%'
        if field == 'recurring':
            return 'Setiap bulan' if value else 'Sekali sahaja'
        if field == 'is_active':
            return 'Aktif' if value else 'Tidak aktif'
        if field in ('valid_from', 'valid_until'):
            y, m, d = str(value).split('-')
            return f'{d}/{m}/{y}'
        return str(value)


HANDLERS = {h.kind: h for h in (
    SubjectHandler(), VendorHandler(), ExpenseCategoryHandler(), ExpenseSubcategoryHandler(), TeacherHandler(),
    PricingTierHandler(), DiscountHandler(),
)}



def handler_for(kind):
    if kind not in HANDLERS:
        raise ValidationError({'kind': 'Jenis permohonan tidak sah.'})
    return HANDLERS[kind]


def kinds_decided_by(role):
    return [kind for kind, h in HANDLERS.items() if role in h.approvers]


def can_decide(user, kind):
    return get_role(user) in handler_for(kind).approvers


def require_decider(user, kind):
    if not can_decide(user, kind):
        names = ' atau '.join(ROLE_LABELS[r] for r in handler_for(kind).approvers)
        raise PermissionDenied(f'Permohonan ini hanya boleh diputuskan oleh {names}.')


def changes_of(req):
    """The fields a request changes, ready to show: label, before (updates) and after."""
    handler = handler_for(req.kind)
    if req.action == 'DELETE':
        return [{'field': f, 'label': handler.fields.get(f, f), 'before': handler.display(f, v), 'after': 'dipadam'}
                for f, v in req.before.items() if f in handler.fields and v not in (None, '')]
    return [{
        'field': field,
        'label': handler.fields.get(field, field),
        'before': handler.display(field, req.before[field]) if field in req.before else None,
        'after': handler.display(field, value),
    } for field, value in req.payload.items() if not (req.action == 'CREATE' and value in (None, ''))]


@transaction.atomic
def submit(user, kind, action, target_id, data, note):
    if action not in dict(ChangeRequest.ACTIONS):
        raise ValidationError({'action': 'Tindakan tidak sah.'})
    handler = handler_for(kind)
    role = get_role(user)
    if role not in handler.proposers:
        names = ' atau '.join(ROLE_LABELS[r] for r in handler.proposers)
        raise PermissionDenied(f'Perubahan ini hanya boleh dimohon oleh {names}.')
    direct = role in handler.approvers
    note = (note or '').strip()
    if not direct and not note:
        raise ValidationError({'note': 'Nyatakan sebab permohonan.'})
    values, before, label = handler.validate(action, target_id, data if isinstance(data, dict) else {})
    req = ChangeRequest(
        kind=kind, action=action, target_id=target_id if action in ('UPDATE', 'DELETE') else None, target_label=label,
        payload=values, before=before, note=note, requested_by=user, requested_by_name=display_name(user),
    )
    if direct:
        req.status, req.direct, req.seen = 'APPROVED', True, True
        req.decided_by, req.decided_at = display_name(user), timezone.now()
        req.target_id = handler.apply(action, target_id, values, req).pk
    req.save()
    return req


def _pending_only(req):
    if req.status != 'PENDING':
        raise ValidationError('Permohonan ini sudah diputuskan atau ditarik balik.')


@transaction.atomic
def revise(req, user, data, note):
    """The person who asked can change a request until it is decided."""
    _pending_only(req)
    if req.requested_by_id != user.id:
        raise PermissionDenied('Hanya pemohon boleh mengubah permohonan ini.')
    note = (note if note is not None else req.note).strip()
    if not note:
        raise ValidationError({'note': 'Nyatakan sebab permohonan.'})
    values, before, label = handler_for(req.kind).validate(req.action, req.target_id, data, ignore=req)
    req.payload, req.before, req.target_label, req.note = values, before, label, note
    req.save()
    return req


@transaction.atomic
def approve(req, user, comment):
    require_decider(user, req.kind)
    _pending_only(req)
    handler = handler_for(req.kind)
    # Checked again: the data may have changed since the request was made
    values, before, label = handler.validate(req.action, req.target_id, req.payload, ignore=req)
    req.status, req.decided_by, req.decided_at = 'APPROVED', display_name(user), timezone.now()
    req.decision_comment = (comment or '').strip()
    req.seen = req.requested_by_id == user.id
    req.payload, req.before = values, before
    req.target_id = handler.apply(req.action, req.target_id, values, req).pk
    req.save()
    return req


@transaction.atomic
def reject(req, user, comment):
    require_decider(user, req.kind)
    _pending_only(req)
    comment = (comment or '').strip()
    if not comment:
        raise ValidationError({'comment': 'Nyatakan sebab penolakan.'})
    req.status, req.decided_by, req.decided_at = 'REJECTED', display_name(user), timezone.now()
    req.decision_comment = comment
    req.seen = req.requested_by_id == user.id
    req.save()
    return req


@transaction.atomic
def withdraw(req, user):
    _pending_only(req)
    if req.requested_by_id != user.id:
        raise PermissionDenied('Hanya pemohon boleh menarik balik permohonan ini.')
    req.status, req.seen = 'WITHDRAWN', True
    req.decided_at = timezone.now()
    req.save()
    return req
