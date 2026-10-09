import os
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class MessageTemplate(models.Model):
    """The edited wording of one WhatsApp message (see core.messages); a message with no row uses its original wording."""
    key = models.CharField(max_length=40, unique=True)
    text = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)


class SettingEvent(models.Model):
    """A change to the centre's own details: which one, the old and new value, who and when."""
    key = models.CharField(max_length=60)
    label = models.CharField(max_length=60)
    old_value = models.CharField(max_length=300, blank=True)
    new_value = models.CharField(max_length=300, blank=True)
    by_name = models.CharField(max_length=150, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-at', '-id']


class AccountSecurity(models.Model):
    """Per login account: a password set by Management is temporary and must be changed at first login."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='security')
    must_change_password = models.BooleanField(default=False)


class AccountEvent(models.Model):
    """Who changed which login account, and how (accounts are never deleted, so this stays complete)."""
    ACTIONS = [
        ('CREATED', 'Akaun dibuat'), ('ROLE_CHANGED', 'Peranan diubah'), ('DEACTIVATED', 'Dinyahaktifkan'),
        ('REACTIVATED', 'Diaktifkan semula'), ('PASSWORD_RESET', 'Kata laluan ditetapkan semula'),
        ('PASSWORD_CHANGED', 'Kata laluan ditukar'), ('RENAMED', 'Nama diubah'), ('LINKED', 'Pautan staf diubah'),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    username = models.CharField(max_length=150)
    action = models.CharField(max_length=20, choices=ACTIONS)
    detail = models.CharField(max_length=250, blank=True)
    by_name = models.CharField(max_length=150, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-at', '-id']


class ChangeRequest(models.Model):
    """A proposed change to setup data (a subject, later vendors, categories, ...).
    Admin's proposals wait as PENDING until Supervisor / Management decides; changes made by
    Supervisor / Management apply at once and are recorded here too, so the history is complete."""
    KINDS = [
        ('SUBJECT', 'Subjek'), ('VENDOR', 'Pembekal'),
        ('EXPENSE_CATEGORY', 'Kategori perbelanjaan'), ('EXPENSE_SUBCATEGORY', 'Subkategori perbelanjaan'),
        ('TEACHER', 'Guru'), ('PRICING_TIER', 'Pakej yuran'), ('DISCOUNT', 'Diskaun'),
        ('TIME_SLOT', 'Slot masa'), ('CLASSROOM', 'Bilik darjah'), ('CLOSED_DATE', 'Tarikh tutup'),
    ]
    ACTIONS = [('CREATE', 'Tambah'), ('UPDATE', 'Ubah'), ('DELETE', 'Padam')]
    STATUS_CHOICES = [
        ('PENDING', 'Menunggu kelulusan'),
        ('APPROVED', 'Diluluskan'),
        ('REJECTED', 'Ditolak'),
        ('WITHDRAWN', 'Ditarik balik'),
    ]
    kind = models.CharField(max_length=20, choices=KINDS)
    action = models.CharField(max_length=10, choices=ACTIONS)
    target_id = models.IntegerField(null=True, blank=True)  # the record changed (set once created)
    target_label = models.CharField(max_length=200, blank=True)
    payload = models.JSONField(default=dict)  # the values to apply
    before = models.JSONField(default=dict, blank=True)  # the values they replace (updates)
    note = models.TextField(blank=True)  # requester's reason
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    direct = models.BooleanField(default=False)  # applied at once by an approver
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    requested_by_name = models.CharField(max_length=150)
    requested_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.CharField(max_length=150, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_comment = models.TextField(blank=True)
    seen = models.BooleanField(default=False)  # the requester has seen the decision

    class Meta:
        ordering = ['-requested_at', '-id']

    def __str__(self):
        return f"{self.kind} {self.action} {self.target_label} ({self.status})"


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
