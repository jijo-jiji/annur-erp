import os
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


def attachment_path(instance, filename):
    """Stored under a random name so file names never reveal who or what they belong to."""
    ext = os.path.splitext(filename)[1].lower()
    now = timezone.now()
    return f"{instance.kind.lower()}/{now:%Y/%m}/{uuid.uuid4().hex}{ext}"


class Attachment(models.Model):
    """An uploaded file linked to a record (student photo, staff document, voucher attachment, ...).
    Files live outside any public URL and are only served through the permission-checked download."""
    KINDS = [
        ('STUDENT_PHOTO', 'Gambar Pelajar'),
        ('FEEDBACK', 'Maklum Balas (gambar/video)'),
        ('STAFF_PHOTO', 'Gambar Staf'),
        ('STAFF_DOC', 'Dokumen Sokongan Staf'),
        ('VOUCHER', 'Lampiran Baucar'),
        ('VOUCHER_SIGNATURE', 'Tandatangan Penerima'),
        ('HANDOUT', 'Fail Nota / Modul'),
    ]
    DOC_TYPES = [
        ('IC', 'Salinan Kad Pengenalan'),
        ('RESUME', 'Resume'),
        ('OFFER_LETTER', 'Surat Tawaran'),
        ('OTHER', 'Lain-lain'),
    ]
    kind = models.CharField(max_length=20, choices=KINDS)
    object_id = models.PositiveIntegerField()
    file = models.FileField(upload_to=attachment_path)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    doc_type = models.CharField(max_length=20, choices=DOC_TYPES, blank=True)
    description = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    uploaded_by_name = models.CharField(max_length=120, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at', '-id']
        indexes = [models.Index(fields=['kind', 'object_id'])]

    def __str__(self):
        return f"{self.kind} #{self.object_id}: {self.original_name}"
