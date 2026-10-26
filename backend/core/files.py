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

# The size limits are Management's to change (Settings), within a safe maximum; the signature is fixed.
# The file types themselves are a security rule and never change here.
SIZE_SETTING = {
    'STUDENT_PHOTO': 'upload_photo_mb', 'STAFF_PHOTO': 'upload_photo_mb', 'FEEDBACK': 'upload_feedback_mb',
    'STAFF_DOC': 'upload_document_mb', 'VOUCHER': 'upload_document_mb', 'HANDOUT': 'upload_handout_mb',
    'RESULT_SLIP': 'upload_document_mb', 'PAYMENT_PROOF': 'upload_document_mb',
    'TEACHER_PHOTO': 'upload_photo_mb', 'TEACHER_DOC': 'upload_document_mb', 'TEACHER_FORM': 'upload_document_mb',
}
RULES = {
    'STUDENT_PHOTO': {'types': IMAGE, 'single': True},
    'STAFF_PHOTO': {'types': IMAGE, 'single': True},
    'FEEDBACK': {'types': {**IMAGE, **VIDEO}},
    'STAFF_DOC': {'types': {**PDF, **IMAGE, **OFFICE}},
    'VOUCHER': {'types': {**PDF, **IMAGE}},
    'VOUCHER_SIGNATURE': {'types': {'.png': 'image/png'}, 'max': 1 * MB, 'single': True},
    'HANDOUT': {'types': {**PDF, **IMAGE, **OFFICE}, 'single': True},
    'RESULT_SLIP': {'types': {**IMAGE, **PDF}, 'single': True},  # sent with the public results form
    'PAYMENT_PROOF': {'types': {**IMAGE, **PDF}},  # the parent's transfer slip or screenshot, on the receipt
    'TEACHER_PHOTO': {'types': IMAGE, 'single': True},
    'TEACHER_DOC': {'types': {**IMAGE, **PDF}},  # IC and teaching permit copies
    'TEACHER_FORM': {'types': {**IMAGE, **PDF}},  # sent with the teacher's private form; moved to the teacher when approved
}


def max_bytes(kind):
    if kind in SIZE_SETTING:
        from . import thresholds
        return int(thresholds.value(SIZE_SETTING[kind])) * MB
    return RULES[kind]['max']
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
    limit = max_bytes(kind)
    if upload.size > limit:
        raise ValidationError({'file': f"Fail terlalu besar (maksimum {limit // MB} MB)."})
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
    from billing.models import PaymentReceipt
    from expenses.models import PaymentVoucher
    from teachers.models import Teacher
    from .models import ChangeRequest
    from students.models import ResultSubmission, Student, StudentFeedback
    from teachers.models import StaffMember
    model = {
        'STUDENT_PHOTO': Student, 'FEEDBACK': StudentFeedback, 'STAFF_PHOTO': StaffMember, 'STAFF_DOC': StaffMember,
        'VOUCHER': PaymentVoucher, 'VOUCHER_SIGNATURE': PaymentVoucher, 'HANDOUT': LessonHandout,
        'RESULT_SLIP': ResultSubmission, 'PAYMENT_PROOF': PaymentReceipt,
        'TEACHER_PHOTO': Teacher, 'TEACHER_DOC': Teacher, 'TEACHER_FORM': ChangeRequest,
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
    elif kind == 'RESULT_SLIP':
        allowed = action == 'view' or approver  # it arrives with the public form; staff only look at it
    elif kind == 'TEACHER_PHOTO':
        allowed = action == 'view' or approver
    elif kind == 'TEACHER_DOC':  # IC and permit copies: personal documents
        allowed = approver
    elif kind == 'TEACHER_FORM':  # arrives with the teacher's form; staff only look at it until it is decided
        allowed = action == 'view' and approver
    elif kind == 'PAYMENT_PROOF':
        if action == 'view':
            allowed = True
        elif obj.status != 'VALID':
            reason = 'Resit ini telah dibatalkan; bukti bayaran dikunci.'
        else:  # whoever recorded it may take back a wrong file; approvers may remove any
            allowed = action == 'upload' or approver or (attachment and attachment.uploaded_by_id == user.id)
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
