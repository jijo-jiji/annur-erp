"""Upload rules: what each kind of attachment accepts, who may upload / view / delete it."""
import os
from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from .permissions import APPROVER_ROLES, get_role

MB = 1024 * 1024
IMAGE = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}
PDF = {'.pdf': 'application/pdf'}
OFFICE = {
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
VIDEO = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'}

RULES = {
    'STUDENT_PHOTO': {'types': IMAGE, 'max': 5 * MB, 'single': True},
    'STAFF_PHOTO': {'types': IMAGE, 'max': 5 * MB, 'single': True},
    'FEEDBACK': {'types': {**IMAGE, **VIDEO}, 'max': 50 * MB},
    'STAFF_DOC': {'types': {**PDF, **IMAGE, **OFFICE}, 'max': 10 * MB},
    'VOUCHER': {'types': {**PDF, **IMAGE}, 'max': 10 * MB},
    'VOUCHER_SIGNATURE': {'types': {'.png': 'image/png'}, 'max': 1 * MB, 'single': True},
    'HANDOUT': {'types': {**PDF, **IMAGE, **OFFICE}, 'max': 25 * MB, 'single': True},
}
# Files shown in the browser; everything else downloads
INLINE_TYPES = set(IMAGE.values()) | set(PDF.values()) | set(VIDEO.values())
VOUCHER_OPEN = ('DRAFT', 'VERIFIED_ADMIN', 'PENDING_SUPERVISOR', 'PENDING_MANAGEMENT')


def _head(upload, n=16):
    upload.seek(0)
    head = upload.read(n)
    upload.seek(0)
    return head


def validate_upload(kind, upload):
    """Check the extension, the size and that the content really is that type of file."""
    rule = RULES[kind]
    ext = os.path.splitext(upload.name or '')[1].lower()
    if ext not in rule['types']:
        allowed = ', '.join(sorted(rule['types']))
        raise ValidationError({'file': f"Jenis fail tidak dibenarkan. Dibenarkan: {allowed}."})
    if upload.size > rule['max']:
        raise ValidationError({'file': f"Fail terlalu besar (maksimum {rule['max'] // MB} MB)."})
    if upload.size == 0:
        raise ValidationError({'file': 'Fail kosong.'})
    head = _head(upload)
    ok = True
    if ext in IMAGE:
        try:
            with Image.open(upload) as img:
                img.verify()
        except (UnidentifiedImageError, OSError, SyntaxError):
            ok = False
        upload.seek(0)
    elif ext == '.pdf':
        ok = head.startswith(b'%PDF')
    elif ext in ('.docx', '.pptx'):
        ok = head.startswith(b'PK\x03\x04')
    elif ext in ('.doc', '.ppt'):
        ok = head.startswith(b'\xd0\xcf\x11\xe0')
    elif ext in ('.mp4', '.mov'):
        ok = head[4:8] in (b'ftyp', b'moov', b'wide', b'mdat')
    elif ext == '.webm':
        ok = head.startswith(b'\x1a\x45\xdf\xa3')
    if not ok:
        raise ValidationError({'file': 'Kandungan fail tidak sepadan dengan jenisnya.'})
    return rule['types'][ext]


def target(kind, object_id):
    """The record an attachment belongs to."""
    from academic.models import LessonHandout
    from expenses.models import PaymentVoucher
    from students.models import Student, StudentFeedback
    from teachers.models import StaffMember
    model = {
        'STUDENT_PHOTO': Student, 'FEEDBACK': StudentFeedback, 'STAFF_PHOTO': StaffMember, 'STAFF_DOC': StaffMember,
        'VOUCHER': PaymentVoucher, 'VOUCHER_SIGNATURE': PaymentVoucher, 'HANDOUT': LessonHandout,
    }.get(kind)
    if model is None:
        raise ValidationError({'kind': 'Jenis lampiran tidak sah.'})
    obj = model.objects.filter(pk=object_id).first()
    if obj is None:
        raise NotFound('Rekod tidak dijumpai.')
    return obj


def _own_staff(user, staff):
    return staff.user_id is not None and staff.user_id == user.id


def check(user, action, kind, obj, attachment=None):
    """Raise PermissionDenied unless `user` may `action` ('view' / 'upload' / 'delete') this kind on `obj`."""
    role = get_role(user)
    approver = role in APPROVER_ROLES
    allowed = False
    reason = 'Anda tidak mempunyai kebenaran untuk fail ini.'
    if kind in ('STUDENT_PHOTO', 'FEEDBACK', 'HANDOUT'):
        allowed = action in ('view', 'upload') or approver
    elif kind == 'STAFF_PHOTO':
        allowed = action == 'view' or approver or _own_staff(user, obj)
    elif kind == 'STAFF_DOC':
        if action == 'delete':
            reason = 'Dokumen sokongan yang telah dihantar tidak boleh dipadam.'
        else:
            allowed = approver or _own_staff(user, obj)
    elif kind == 'VOUCHER':
        if action == 'view':
            allowed = True
        elif obj.status not in VOUCHER_OPEN:
            reason = 'Baucar ini telah diputuskan; lampiran dikunci.'
        else:
            allowed = action == 'upload' or approver or (attachment and attachment.uploaded_by_id == user.id)
    elif kind == 'VOUCHER_SIGNATURE':
        if action == 'view':
            allowed = True
        elif obj.status == 'REJECTED':
            reason = 'Baucar ini telah ditolak.'
        elif action == 'delete' and obj.status not in VOUCHER_OPEN:
            reason = 'Tandatangan pada baucar yang diluluskan tidak boleh dipadam.'
        else:
            allowed = True
    if not allowed:
        raise PermissionDenied(reason)
