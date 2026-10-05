"""Change requests: setup data is changed by proposing the change and an approver deciding it
(j-status.doc: the person in charge edits until approved; after that only the approver).

Admin's proposals wait as PENDING. Supervisor / Management changes apply at once but are recorded
in the same list. Each kind of setup data has a handler that checks the values and applies them."""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from .models import ChangeRequest
from .permissions import APPROVER_ROLES, display_name, get_role


class Handler:
    kind = ''
    fields = {}  # field -> label shown in the list of changes

    def validate(self, action, target_id, data, ignore=None):
        """Return (values to apply, values they replace, label of the record)."""
        raise NotImplementedError

    def apply(self, action, target_id, values):
        """Save the change and return the record."""
        raise NotImplementedError

    def display(self, field, value):
        return '' if value is None else str(value)


class SubjectHandler(Handler):
    kind = 'SUBJECT'
    fields = {'code': 'Kod', 'name': 'Nama', 'level_category': 'Peringkat', 'stream': 'Aliran', 'is_active': 'Status'}

    def _model(self):
        from business_config.models import SubjectMaster
        return SubjectMaster

    def _serializer(self, data, instance=None):
        from business_config.serializers import SubjectMasterSerializer
        return SubjectMasterSerializer(instance, data=data, partial=instance is not None)

    def _pending(self, ignore=None):
        qs = ChangeRequest.objects.filter(kind=self.kind, status='PENDING')
        return qs.exclude(pk=ignore.pk) if ignore else qs

    def validate(self, action, target_id, data, ignore=None):
        Subject = self._model()
        data = {k: data[k] for k in self.fields if k in data}
        others = self._pending(ignore)
        if action == 'CREATE':
            data['code'] = str(data.get('code', '')).strip().upper()
            data['name'] = str(data.get('name', '')).strip()
            data.setdefault('is_active', True)
            serializer = self._serializer(data)
            serializer.is_valid(raise_exception=True)
            values = dict(serializer.validated_data)
            if others.filter(action='CREATE', payload__code=values['code']).exists():
                raise ValidationError({'code': f"Kod {values['code']} sudah dimohon dan menunggu kelulusan."})
            return values, {}, f"{values['code']} {values['name']}"

        subject = Subject.objects.filter(pk=target_id).first()
        if not subject:
            raise ValidationError('Subjek tidak dijumpai.')
        if 'code' in data and data['code'] != subject.code:
            raise ValidationError({'code': 'Kod subjek tidak boleh diubah kerana ia digunakan dalam rekod sedia ada.'})
        data.pop('code', None)
        if 'name' in data:
            data['name'] = str(data['name']).strip()
        serializer = self._serializer(data, subject)
        serializer.is_valid(raise_exception=True)
        values = {k: v for k, v in serializer.validated_data.items() if getattr(subject, k) != v}
        if not values:
            raise ValidationError('Tiada perubahan untuk dihantar.')
        if others.filter(action='UPDATE', target_id=subject.pk).exists():
            raise ValidationError('Sudah ada permohonan ubah untuk subjek ini yang menunggu kelulusan.')
        return values, {k: getattr(subject, k) for k in values}, f"{subject.code} {subject.name}"

    def apply(self, action, target_id, values):
        subject = self._model().objects.filter(pk=target_id).first() if action == 'UPDATE' else None
        serializer = self._serializer(values, subject)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    LEVELS = {'PRIMARY': 'Rendah (Darjah)', 'LOWER_SEC': 'Menengah rendah (T1-T3)', 'UPPER_SEC': 'Menengah atas (T4-T5)'}
    STREAMS = {'TERAS': 'Teras', 'SAINS': 'Sains', 'SASTERA': 'Sastera / Akaun'}

    def display(self, field, value):
        if field == 'level_category':
            return self.LEVELS.get(value, value)
        if field == 'stream':
            return self.STREAMS.get(value, value)
        if field == 'is_active':
            return 'Aktif' if value else 'Tidak aktif'
        return super().display(field, value)


HANDLERS = {h.kind: h for h in (SubjectHandler(),)}


def handler_for(kind):
    if kind not in HANDLERS:
        raise ValidationError({'kind': 'Jenis permohonan tidak sah.'})
    return HANDLERS[kind]


def changes_of(req):
    """The fields a request changes, ready to show: label, before (updates) and after."""
    handler = handler_for(req.kind)
    return [{
        'field': field,
        'label': handler.fields.get(field, field),
        'before': handler.display(field, req.before[field]) if field in req.before else None,
        'after': handler.display(field, value),
    } for field, value in req.payload.items()]


@transaction.atomic
def submit(user, kind, action, target_id, data, note):
    if action not in dict(ChangeRequest.ACTIONS):
        raise ValidationError({'action': 'Tindakan tidak sah.'})
    handler = handler_for(kind)
    direct = get_role(user) in APPROVER_ROLES
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
