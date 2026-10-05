"""Change requests: setup data is changed by proposing the change and an approver deciding it
(j-status.doc: the person in charge edits until approved; after that only the approver).

Each kind of setup data has a handler that says who may propose and who may decide, checks the
values and applies them. A change made by someone who may decide it applies at once but is recorded
in the same list; anyone else's waits as PENDING."""
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

    def apply(self, action, target_id, values):
        """Save the change and return the record."""
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

    def apply(self, action, target_id, values):
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


HANDLERS = {h.kind: h for h in (SubjectHandler(), VendorHandler())}


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
        record = handler.apply(action, target_id, values)
        req.target_id = record.pk
        req.status, req.direct, req.seen = 'APPROVED', True, True
        req.decided_by, req.decided_at = display_name(user), timezone.now()
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
    record = handler.apply(req.action, req.target_id, values)
    req.target_id = record.pk
    req.payload, req.before = values, before
    req.status, req.decided_by, req.decided_at = 'APPROVED', display_name(user), timezone.now()
    req.decision_comment = (comment or '').strip()
    req.seen = req.requested_by_id == user.id
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
