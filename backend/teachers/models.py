from django.db import models
from business_config.models import SubjectMaster

class Teacher(models.Model):
    TYPE_CHOICES = [
        ('PERMANENT', 'Cikgu Permanent'),
        ('REPLACEMENT', 'Cikgu Ganti Aktif'),
    ]
    teacher_code = models.CharField(max_length=20, unique=True) # e.g. NAK, SF, AZ, Z
    full_name = models.CharField(max_length=120)
    phone_number = models.CharField(max_length=30)
    email = models.EmailField(blank=True)
    teacher_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='PERMANENT')
    is_active = models.BooleanField(default=True)
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account = models.CharField(max_length=50, blank=True)
    teaching_permit_expiry = models.DateField(null=True, blank=True)
    rate_per_session = models.DecimalField(max_digits=8, decimal_places=2, default=60.00)
    subjects_qualified = models.ManyToManyField(SubjectMaster, blank=True)
    joined_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True)

    def __str__(self):
        return f"[{self.teacher_code}] {self.full_name} ({self.teacher_type})"

class TeacherAttendance(models.Model):
    STATUS_CHOICES = [
        ('PRESENT', 'Hadir'),
        ('ABSENT', 'Tidak Hadir'),
        ('REPLACED', 'Diganti'),
    ]
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PRESENT')
    replacement_teacher = models.ForeignKey(Teacher, on_delete=models.SET_NULL, null=True, blank=True, related_name='replacements_done')
    allowance_earned = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)
    remarks = models.TextField(blank=True)

    def __str__(self):
        return f"{self.date} - {self.teacher.teacher_code}: {self.status}"
