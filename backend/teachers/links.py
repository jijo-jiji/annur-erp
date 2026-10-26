"""Teacher private links (Phase F).

Management makes a link for one teacher (or a general link for applicants) and sends it, for example by WhatsApp. The
teacher opens it on their phone without a login and fills in their details, bank account, subjects, experience, permit,
photo and IC. The form becomes a teacher change request for Management (core/change_requests.py TeacherHandler); the
files wait on that request and move to the teacher when it is approved, or are deleted when it is rejected.

Only a SHA-256 fingerprint of each link is stored. A lost link is replaced with a new one (which cancels the old);
Management can cancel any link at any time. A teacher has one working personal link at a time. Phase I uses the same
personal link for the teacher's class page."""
import hashlib
import secrets
from datetime import date
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, parser_classes, permission_classes, throttle_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from core.throttles import PublicTeacherThrottle
from core import files, notify
from core.models import Attachment, ChangeRequest
from core.permissions import MANAGEMENT, display_name
from .models import Teacher, TeacherLink

FORM_FILES = {'photo': 'PHOTO', 'ic': 'IC', 'permit': 'PERMIT'}  # form field -> document type


def fingerprint(token):
    return hashlib.sha256(token.encode()).hexdigest()


def make(kind, by, teacher=None, label='', expires_on=None):
    """A new link and its address token (shown once). A teacher's earlier personal link stops working."""
    token = secrets.token_urlsafe(24)
    with transaction.atomic():
        if teacher is not None:
            TeacherLink.objects.filter(teacher=teacher, revoked_at=None).update(revoked_at=timezone.now(), revoked_by=f"{by} (pautan baharu)")
        link = TeacherLink.objects.create(kind=kind, teacher=teacher, token_hash=fingerprint(token), hint=token[-4:],
                                          label=label, expires_on=expires_on, created_by=by)
    return link, token


def working(token):
    """The link a token opens, if it still works; None otherwise."""
    if not token or len(token) > 100:
        return None
    link = TeacherLink.objects.select_related('teacher').filter(token_hash=fingerprint(token), revoked_at=None).first()
    if link is None or (link.expires_on and link.expires_on < date.today()):
        return None
    if link.kind == 'TEACHER' and (link.teacher is None or not link.teacher.is_active):
        return None
    return link


# ---- Staff: Management makes and cancels links ----------------------------------------------------------------------

class TeacherLinkSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True, default=None)
    teacher_code = serializers.CharField(source='teacher.teacher_code', read_only=True, default=None)
    state = serializers.SerializerMethodField()
    waiting = serializers.SerializerMethodField()

    class Meta:
        model = TeacherLink
        fields = ['id', 'kind', 'teacher', 'teacher_name', 'teacher_code', 'hint', 'label', 'expires_on', 'created_by', 'created_at',
                  'revoked_at', 'revoked_by', 'last_used_at', 'submissions', 'state', 'waiting']
        read_only_fields = fields

    def get_state(self, obj):
        if obj.revoked_at:
            return 'REVOKED'
        if obj.expires_on and obj.expires_on < date.today():
            return 'EXPIRED'
        return 'ACTIVE'

    def get_waiting(self, obj):
        return bool(obj.last_request_id and obj.last_request.status == 'PENDING')


class TeacherLinkViewSet(viewsets.ReadOnlyModelViewSet):
    """Pengurusan only (client decision 10). POST {kind, teacher, label, expires_on} answers once with the address token."""
    queryset = TeacherLink.objects.select_related('teacher', 'last_request')
    serializer_class = TeacherLinkSerializer
    read_roles = (MANAGEMENT,)
    write_roles = (MANAGEMENT,)

    def create(self, request):
        kind = request.data.get('kind')
        if kind not in dict(TeacherLink.KINDS):
            raise ValidationError({'kind': 'Jenis pautan tidak sah.'})
        teacher = None
        if kind == 'TEACHER':
            teacher = Teacher.objects.filter(pk=request.data.get('teacher'), is_active=True).first()
            if teacher is None:
                raise ValidationError({'teacher': 'Pilih guru yang aktif.'})
        expires = request.data.get('expires_on') or None
        if expires:
            from students.drilldown import parse_day
            expires = parse_day(expires, 'expires_on')
            if expires < date.today():
                raise ValidationError({'expires_on': 'Tarikh tamat tidak boleh sebelum hari ini.'})
        label = str(request.data.get('label') or '').strip()[:120]
        if kind == 'APPLICANT' and not label:
            raise ValidationError({'label': 'Namakan pautan ini, cth. Pengambilan guru 2027.'})
        link, token = make(kind, display_name(request.user), teacher, label, expires)
        return Response({**self.get_serializer(link).data, 'token': token}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        link = self.get_object()
        if not link.revoked_at:
            link.revoked_at, link.revoked_by = timezone.now(), display_name(request.user)
            link.save(update_fields=['revoked_at', 'revoked_by'])
        return Response(self.get_serializer(link).data)


# ---- Public: the form behind a link ---------------------------------------------------------------------------------

def _gone():
    return NotFound('Pautan ini tidak sah, telah tamat atau telah dibatalkan. Hubungi pusat untuk pautan baharu.')


def _subjects():
    from business_config.models import SubjectMaster
    return [{'id': s.id, 'name': s.name, 'level': s.level_category} for s in SubjectMaster.objects.filter(is_active=True).order_by('level_category', 'name')]


def _current(teacher):
    return {
        'full_name': teacher.full_name, 'phone_number': teacher.phone_number, 'email': teacher.email, 'bank_name': teacher.bank_name,
        'bank_account': teacher.bank_account, 'subjects_qualified': sorted(teacher.subjects_qualified.values_list('pk', flat=True)),
        'teaching_since': teacher.teaching_since, 'teaching_permit_expiry': teacher.teaching_permit_expiry,
        'has_photo': Attachment.objects.filter(kind='TEACHER_PHOTO', object_id=teacher.pk).exists(),
        'documents': sorted(set(Attachment.objects.filter(kind='TEACHER_DOC', object_id=teacher.pk).values_list('doc_type', flat=True))),
    }


def _form_data(request):
    data = {k: request.data.get(k) for k in ('full_name', 'phone_number', 'email', 'bank_name', 'bank_account', 'teaching_since',
                                             'teaching_permit_expiry', 'remarks') if k in request.data}
    if 'subjects_qualified' in request.data:
        raw = request.data.getlist('subjects_qualified') if hasattr(request.data, 'getlist') else request.data.get('subjects_qualified')
        if isinstance(raw, str):
            raw = [s for s in raw.split(',') if s]
        data['subjects_qualified'] = [int(s) for s in raw or [] if str(s).isdigit()]
    return data


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@throttle_classes([PublicTeacherThrottle])
def public_teacher_link(request, token):
    """GET: what the form needs (the teacher's details now, the subjects). POST: the form, with photo / ic / permit files."""
    link = working(token)
    if link is None:
        raise _gone()
    from core.centre import profile
    if request.method == 'GET':
        waiting = bool(link.last_request_id and ChangeRequest.objects.filter(pk=link.last_request_id, status='PENDING').exists())
        return Response({
            'kind': link.kind, 'centre': profile()['name'], 'subjects': _subjects(), 'waiting': waiting,
            'teacher': {'code': link.teacher.teacher_code, **_current(link.teacher)} if link.teacher else None,
        })
    return Response(submit(link, request), status=status.HTTP_201_CREATED)


def submit(link, request):
    from core.change_requests import handler_for
    handler = handler_for('TEACHER')
    uploads = {doc: request.FILES.get(field) for field, doc in FORM_FILES.items() if request.FILES.get(field)}
    types = {doc: files.validate_upload('TEACHER_FORM', upload) for doc, upload in uploads.items()}
    if 'PHOTO' in types and not types['PHOTO'].startswith('image/'):
        raise ValidationError({'photo': 'Gambar mesti fail JPG, PNG atau WEBP.'})
    data = _form_data(request)
    data['documents'] = sorted(uploads)
    action = 'UPDATE' if link.kind == 'TEACHER' else 'CREATE'
    target = link.teacher_id
    with transaction.atomic():
        link = TeacherLink.objects.select_for_update().get(pk=link.pk)
        pending = link.last_request if link.last_request_id and link.last_request.status == 'PENDING' else None
        if pending:
            # sending again before Management decides replaces the waiting form (and any file sent again)
            kept = set(Attachment.objects.filter(kind='TEACHER_FORM', object_id=pending.pk).exclude(doc_type__in=list(uploads))
                       .values_list('doc_type', flat=True))
            data['documents'] = sorted(set(uploads) | kept)
        try:
            values, before, label = handler.validate_from_link(action, target, data, ignore=pending)
        except ValidationError as err:
            if action == 'UPDATE' and 'Sudah ada permohonan' in str(err.detail):
                raise ValidationError('Maklumat guru ini sedang dikemas kini oleh pusat. Cuba lagi selepas permohonan itu diputuskan.')
            if 'Tiada perubahan' in str(err.detail):
                raise ValidationError('Tiada perubahan untuk dihantar. Ubah maklumat atau lampirkan dokumen dahulu.')
            raise
        name = values.get('full_name') or (link.teacher.full_name if link.teacher else '')
        by = f"{name} ({'pautan guru' if link.kind == 'TEACHER' else 'borang pemohon'})"
        if pending:
            req = pending
            req.payload, req.before, req.target_label, req.requested_by_name = values, before, label, by
            req.save(update_fields=['payload', 'before', 'target_label', 'requested_by_name'])
            Attachment.objects.filter(kind='TEACHER_FORM', object_id=req.pk, doc_type__in=list(uploads)).delete()
        else:
            req = ChangeRequest.objects.create(
                kind='TEACHER', action=action, target_id=target, target_label=label, payload=values, before=before,
                note='Dihantar melalui pautan guru' if link.kind == 'TEACHER' else f"Borang pemohon: {link.label}",
                requested_by=None, requested_by_name=by,
            )
        for doc, upload in uploads.items():
            Attachment.objects.create(kind='TEACHER_FORM', object_id=req.pk, file=upload, original_name=upload.name[:255],
                                      content_type=types[doc], size=upload.size,
                                      doc_type=doc, uploaded_by_name=by)
        link.last_request, link.last_used_at, link.submissions = req, timezone.now(), link.submissions + 1
        link.save(update_fields=['last_request', 'last_used_at', 'submissions'])
        if not pending:
            notify.change_request_submitted(req)
    return {'success': True, 'replaced': bool(pending), 'reference': f"GR-{req.pk:05d}"}


# ---- Public: the teacher's classes today (Phase I) ------------------------------------------------------------------

def _teacher_link(token):
    link = working(token)
    if link is None or link.kind != 'TEACHER':
        raise _gone()
    return link


def _teacher_classes(link, on):
    """Today's classes this teacher takes: their own, and those they cover as the replacement."""
    from academic.models import ClassTimetable
    from students import checkin
    rows = [r for r in checkin.held_on(on)
            if r.get('teacher_id') == link.teacher_id or (r.get('record') and r['record'].get('replacement_teacher') == link.teacher_id)]
    classes = ClassTimetable.objects.select_related('slot', 'subject', 'classroom').in_bulk([r['class_id'] for r in rows])
    return sorted((classes[r['class_id']] for r in rows if r['class_id'] in classes), key=lambda c: c.slot.start_time)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicTeacherThrottle])
def teacher_classes(request, token):
    """The teacher's classes today, each with its live list and check-in code. The code is made the first time the page
    shows it while scanning is open, so a teacher opening the link early does not start check-in for every class."""
    from students import checkin
    link = _teacher_link(token)
    on = timezone.localdate()
    checkin.close_due()
    out = []
    for cls in _teacher_classes(link, on):
        found = checkin.checkin_for(cls, on) if checkin.state(cls, on) == 'OPEN' else checkin.ClassCheckIn.objects.filter(timetable_class=cls, date=on).first()
        out.append(checkin.checkin_data(cls, on, found))
    return Response({'date': on, 'teacher': link.teacher.full_name, 'classes': out})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicTeacherThrottle])
def teacher_class_action(request, token, class_id):
    """{action: mark, student, status: PRESENT | LATE | ABSENT} for a pupil without a phone, or {action: confirm}."""
    from students import checkin
    link = _teacher_link(token)
    on = timezone.localdate()
    cls = next((c for c in _teacher_classes(link, on) if c.pk == int(class_id)), None)
    if cls is None:
        raise ValidationError('Kelas ini bukan kelas anda hari ini.')
    found = checkin.checkin_for(cls, on)
    if found.confirmed_at:
        raise ValidationError('Senarai kelas ini sudah disahkan.')
    by = link.teacher.titled
    if request.data.get('action') == 'confirm':
        checkin.confirm(found, by)
    elif request.data.get('action') == 'mark':
        status_ = request.data.get('status')
        if status_ not in ('PRESENT', 'LATE', 'ABSENT'):
            raise ValidationError({'status': 'Pilih Hadir, Lewat atau Tidak hadir.'})
        student = next((s for s in checkin.students_of(cls) if str(s.pk) == str(request.data.get('student'))), None)
        if student is None:
            raise ValidationError({'student': 'Pelajar ini tiada dalam kelas.'})
        checkin.mark(cls, on, student, status_, 'TEACHER', by)
    else:
        raise ValidationError({'action': 'Tindakan tidak sah.'})
    link.last_used_at = timezone.now()
    link.save(update_fields=['last_used_at'])
    return Response(checkin.checkin_data(cls, on, found))
