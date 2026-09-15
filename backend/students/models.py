from django.db import models
from academic.models import ClassTimetable
from business_config.models import SubjectMaster

class Student(models.Model):
    TYPE_CHOICES = [
        ('MONTHLY', 'Bulanan (Tetap)'),
        ('WALK_IN', 'Walk-in / Sambilan'),
    ]
    FORM_CHOICES = [
        ('S5', 'Darjah 5'),
        ('S6', 'Darjah 6'),
        ('F1', 'Form 1'),
        ('F2', 'Form 2'),
        ('F3', 'Form 3'),
        ('F4', 'Form 4'),
        ('F5', 'Form 5'),
    ]
    STREAM_CHOICES = [
        ('SAINS', 'Aliran Sains'),
        ('SASTERA', 'Aliran Sastera'),
        ('GENERAL', 'Umum'),
    ]
    STATUS_CHOICES = [
        ('ACTIVE', 'Aktif'),
        ('ON_HOLD', 'Tangguh (On-Hold)'),
        ('TERMINATED', 'Berhenti / Tidak Aktif'),
    ]
    student_id = models.CharField(max_length=30, unique=True)
    full_name = models.CharField(max_length=150)
    ic_number = models.CharField(max_length=20)
    student_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='MONTHLY')
    form_level = models.CharField(max_length=10, choices=FORM_CHOICES)
    stream = models.CharField(max_length=20, choices=STREAM_CHOICES, default='GENERAL')
    school_name = models.CharField(max_length=150, blank=True)
    school_code = models.CharField(max_length=30, blank=True)
    school_category = models.CharField(max_length=50, blank=True)
    
    phone_number = models.CharField(max_length=30)
    home_phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    
    join_date = models.DateField()
    lead_source = models.CharField(max_length=50, default='BANNER')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    
    # Parents
    parent1_name = models.CharField(max_length=120)
    parent1_phone = models.CharField(max_length=30)
    parent1_email = models.EmailField(blank=True)
    parent1_occupation = models.CharField(max_length=100, blank=True)
    parent1_relation = models.CharField(max_length=30, default='Bapa')
    
    parent2_name = models.CharField(max_length=120, blank=True)
    parent2_phone = models.CharField(max_length=30, blank=True)
    parent2_email = models.EmailField(blank=True)
    parent2_occupation = models.CharField(max_length=100, blank=True)
    parent2_relation = models.CharField(max_length=30, default='Ibu')
    
    preferred_contact = models.CharField(max_length=20, choices=[('PARENT_1', 'Bapa/Penjaga 1'), ('PARENT_2', 'Ibu/Penjaga 2')], default='PARENT_1')
    
    # SAPS MOE Consent & Parent Agreement Clauses
    saps_consent = models.BooleanField(default=True)
    agree_terms_7th_payment = models.BooleanField(default=True)
    agree_terms_2months_auto_drop = models.BooleanField(default=True)
    agree_terms_2weeks_notice = models.BooleanField(default=True)
    
    # 5-Point Office Checklist (Kegunaan Pejabat)
    checklist_ledger = models.BooleanField(default=False)    # L
    checklist_whatsapp = models.BooleanField(default=False)  # TEL
    checklist_senarai_pelajar = models.BooleanField(default=False) # SP
    checklist_kedatangan = models.BooleanField(default=False)     # AT
    checklist_sistem_pembayaran = models.BooleanField(default=False) # SY
    
    # Enrolled Classes
    enrolled_classes = models.ManyToManyField(ClassTimetable, blank=True, related_name='students')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.student_id}] {self.full_name} ({self.form_level})"

class StudentExamResult(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='exam_results')
    exam_name = models.CharField(max_length=100)
    subject = models.ForeignKey(SubjectMaster, on_delete=models.CASCADE)
    grade = models.CharField(max_length=10) # A+, A, B, C, etc.
    mark = models.IntegerField(null=True, blank=True)
    date_recorded = models.DateField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.code}: {self.grade}"
