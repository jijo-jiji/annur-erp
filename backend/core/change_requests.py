"""Change requests: setup data is changed by proposing the change and an approver deciding it
(j-status.doc: the person in charge edits until approved; after that only the approver).

Each kind of setup data has a handler that says who may propose and who may decide, checks the
values and applies them. A change made by someone who may decide it applies at once but is recorded
in the same list; anyone else's waits as PENDING."""
import re
from decimal import Decimal, InvalidOperation
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

    def _others(self, ignore):
        qs = ChangeRequest.objects.filter(kind=self.kind, status='PENDING')
        return qs.exclude(pk=ignore.pk) if ignore else qs

    def validate(self, action, target_id, data, ignore=None):
        data = {k: data[k] for k in self.fields if k in data}
        others = self._others(ignore)
        if action == 'CREATE':
            serializer = self.serializer(self.normalise(data, True))
            serializer.is_valid(raise_exception=True)
            values = dict(serializer.validated_data)
            key = values.get(self.key_field)
            if key is not None and others.filter(action='CREATE', **{f'payload__{self.key_field}': key}).exists():
                raise ValidationError({self.key_field: f'{self.fields[self.key_field]} {key} sudah dimohon dan menunggu kelulusan.'})
            return values, {}, self.label(values.get)

        obj = self.model().objects.filter(pk=target_id).first()
        if not obj:
            raise ValidationError(f'{self.noun.capitalize()} tidak dijumpai.')
        for field in self.immutable:
            if field in data and data[field] != getattr(obj, field):
                raise ValidationError({field: f'{self.fields[field]} tidak boleh diubah kerana ia digunakan dalam rekod sedia ada.'})
            data.pop(field, None)
        serializer = self.serializer(self.normalise(data, False), obj)
        serializer.is_valid(raise_exception=True)
        values = {k: v for k, v in serializer.validated_data.items() if getattr(obj, k) != v}
        if not values:
            raise ValidationError('Tiada perubahan untuk dihantar.')
        if others.filter(action='UPDATE', target_id=obj.pk).exists():
            raise ValidationError(f'Sudah ada permohonan ubah untuk {self.noun} ini yang menunggu kelulusan.')
        return values, {k: getattr(obj, k) for k in values}, self.label(lambda f: getattr(obj, f))

    def apply(self, action, target_id, values, req=None):
        obj = self.model().objects.filter(pk=target_id).first() if action == 'UPDATE' else None
        serializer = self.serializer(values, obj)
        serializer.is_valid(raise_exception=True)
        return serializer.save()


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


HANDLERS = {h.kind: h for h in (SubjectHandler(), VendorHandler(), ExpenseCategoryHandler(), ExpenseSubcategoryHandler())}



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
        kind=kind, action=action, target_id=target_id if action == 'UPDATE' else None, target_label=label,
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
