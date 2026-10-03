from datetime import date
from django.db import models
from academic.models import ClassTimetable
from business_config.models import SubjectMaster

class Student(models.Model):
    TYPE_CHOICES = [
        ('MONTHLY', 'Bulanan (Tetap)'),
        ('WALK_IN', 'Walk-in / Sambilan'),
    ]
    STREAM_CHOICES = [
        ('SAINS', 'Aliran Sains'),
        ('SASTERA', 'Aliran Sastera'),
        ('GENERAL', 'Umum'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Menunggu Kelulusan'),
        ('ACTIVE', 'Aktif'),
        ('ON_HOLD', 'Tangguh (On-Hold)'),
        ('TERMINATED', 'Berhenti / Tidak Aktif'),
        ('REJECTED', 'Pendaftaran Ditolak'),
    ]
    student_id = models.CharField(max_length=30, unique=True)
    full_name = models.CharField(max_length=150)
    ic_number = models.CharField(max_length=20)
    student_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='MONTHLY')
    form_level = models.CharField(max_length=10)  # grade code from master data 1_form (core.grades)
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
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    registration_comment = models.TextField(blank=True)
    registration_decided_by = models.CharField(max_length=120, blank=True)
    on_hold_until = models.DateField(null=True, blank=True)
    left_date = models.DateField(null=True, blank=True)  # date the student became inactive

    # Walk-in details (j-status.doc: description and subjects for walk-in)
    walk_in_description = models.TextField(blank=True)
    walk_in_subjects = models.ManyToManyField(SubjectMaster, blank=True, related_name='walk_in_students')

    # Billing special case (non-standard rate / below minimum subjects) and overpayment credit
    special_monthly_fee = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    special_fee_note = models.CharField(max_length=200, blank=True)
    credit_balance = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    # Recurring discount (e.g. siblings) applied to every monthly invoice; set by Supervisor / Management
    standing_discount = models.ForeignKey('billing.Discount', on_delete=models.SET_NULL, null=True, blank=True, related_name='students')
    
    # Parents
    parent1_name = models.CharField(max_length=120)
    parent1_phone = models.CharField(max_length=30)
    parent1_email = models.EmailField(blank=True)
    parent1_occupation = models.CharField(max_length=100, blank=True)
    parent1_age = models.CharField(max_length=30, blank=True)  # age band code from master data 7_parent_age
    parent1_relation = models.CharField(max_length=30, default='Bapa')
    
    parent2_name = models.CharField(max_length=120, blank=True)
    parent2_phone = models.CharField(max_length=30, blank=True)
    parent2_email = models.EmailField(blank=True)
    parent2_occupation = models.CharField(max_length=100, blank=True)
    parent2_age = models.CharField(max_length=30, blank=True)
    parent2_relation = models.CharField(max_length=30, default='Ibu')
    
    preferred_contact = models.CharField(max_length=20, choices=[('PARENT_1', 'Bapa/Penjaga 1'), ('PARENT_2', 'Ibu/Penjaga 2')], default='PARENT_1')
    
    # SAPS MOE Consent & Parent Agreement Clauses
    saps_consent = models.BooleanField(default=True)
    agree_terms_7th_payment = models.BooleanField(default=True)
    agree_terms_2months_auto_drop = models.BooleanField(default=True)
    agree_terms_2weeks_notice = models.BooleanField(default=True)
    
    # Enrolled Classes
    enrolled_classes = models.ManyToManyField(ClassTimetable, blank=True, related_name='students')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.student_id}] {self.full_name} ({self.form_level})"

class StudentExamResult(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='exam_results')
    exam_name = models.CharField(max_length=100)  # exam type label from master data 10_exam_type
    form_level = models.CharField(max_length=10, blank=True)  # form at the time of the exam
    subject = models.ForeignKey(SubjectMaster, on_delete=models.CASCADE)
    grade = models.CharField(max_length=10) # A+, A, B, C, etc.
    mark = models.IntegerField(null=True, blank=True)
    exam_date = models.DateField(null=True, blank=True)
    date_recorded = models.DateField(auto_now_add=True)

    class Meta:
        ordering = ['exam_date', 'id']

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.code}: {self.grade}"

class Lead(models.Model):
    # j-status.doc: the 8 conversion stages, in order. LOST sits outside the funnel.
    STAGES = [
        ('ENQUIRY', 'Enquiry'),
        ('CONTACTED', 'Contacted'),
        ('CONTENT_1', 'Content 1'),
        ('CONTENT_2', 'Content 2'),
        ('TRIAL', 'Free Trial'),
        ('WAITING_PAYMENT', 'Waiting Payment'),
        ('REGISTERED', 'Registered'),
        ('ACTIVE', 'Active'),
    ]
    STAGE_ORDER = [code for code, _ in STAGES]
    CLOSED_STAGES = ('REGISTERED', 'ACTIVE', 'LOST')
    STATUS_CHOICES = STAGES + [('LOST', 'Tidak Berminat (Lost)')]

    lead_id = models.CharField(max_length=30, unique=True)
    student_name = models.CharField(max_length=150)
    parent_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30)
    email = models.EmailField(blank=True)
    form_level = models.CharField(max_length=20)
    school_name = models.CharField(max_length=150, blank=True)
    lead_source = models.CharField(max_length=50, default='WHATSAPP')
    interested_subjects = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ENQUIRY')
    trial_date = models.DateField(null=True, blank=True)
    trial_feedback = models.TextField(blank=True)
    assigned_to = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    campaign = models.CharField(max_length=100, blank=True)
    enquiry_date = models.DateField(default=date.today)
    stage_changed_at = models.DateField(default=date.today)
    # Stage the lead had reached when it was marked LOST, so conversion rates still count it
    lost_at_stage = models.CharField(max_length=20, blank=True)
    lost_reason = models.CharField(max_length=255, blank=True)
    # One week after the latest action unless staff set another date (j-status.doc reminder)
    next_follow_up = models.DateField(null=True, blank=True)
    converted_student = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True, related_name='lead_origin')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.lead_id}] {self.student_name} ({self.form_level}) - {self.status}"

    @property
    def reached_stage(self):
        """Furthest funnel stage reached; a lost lead counts up to where it was lost."""
        return self.lost_at_stage if self.status == 'LOST' else self.status


class LeadActivity(models.Model):
    """Follow-up log per lead: date, action, remark, PIC and outcome (j-status.doc Lead Funnel)."""
    OUTCOMES = [
        ('DONE', 'Selesai'),
        ('WAITING_REPLY', 'Menunggu Respons'),
        ('NO_RESPONSE', 'Tiada Respons'),
    ]
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='activities')
    activity_date = models.DateField(default=date.today)
    stage = models.CharField(max_length=20, choices=Lead.STATUS_CHOICES)
    from_stage = models.CharField(max_length=20, blank=True)  # set when this entry records a stage move
    action = models.CharField(max_length=100)
    remark = models.TextField(blank=True)
    pic = models.CharField(max_length=100)
    outcome = models.CharField(max_length=20, choices=OUTCOMES, default='DONE')
    next_follow_up = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-activity_date', '-id']


class StudentFeedback(models.Model):
    """Feedback from a parent or the student, with photos / videos as attachments (kind FEEDBACK)."""
    GIVEN_BY = [('PARENT', 'Ibu bapa'), ('STUDENT', 'Pelajar')]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='feedback')
    date = models.DateField(default=date.today)
    given_by = models.CharField(max_length=10, choices=GIVEN_BY, default='PARENT')
    description = models.TextField()
    recorded_by = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']


class StudentEvent(models.Model):
    """Permanent history of a student's lifecycle (j-status.doc: HISTORY / DESCRIPTION)"""
    TYPE_CHOICES = [
        ('REGISTERED', 'Didaftarkan'),
        ('APPROVED', 'Pendaftaran Diluluskan'),
        ('REJECTED', 'Pendaftaran Ditolak'),
        ('ADD_SUBJECT', 'Tambah Subjek'),
        ('DROP_SUBJECT', 'Gugur Subjek'),
        ('CHANGE_CLASS', 'Tukar Kelas'),
        ('WAITLIST', 'Senarai Menunggu'),
        ('ON_HOLD', 'Tangguh'),
        ('RESUME', 'Aktif Semula'),
        ('TERMINATE', 'Berhenti'),
        ('NOTE', 'Catatan'),
        ('PROMOTE', 'Naik Tingkatan'),
        ('FEEDBACK', 'Maklum Balas'),
    ]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    event_date = models.DateField()
    timetable_class = models.ForeignKey(ClassTimetable, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    from_class = models.ForeignKey(ClassTimetable, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    class_label = models.CharField(max_length=100, blank=True)  # kept even if the class is later deleted
    reason_code = models.CharField(max_length=60, blank=True)  # master data 14_drop_reason
    reason_text = models.TextField(blank=True)
    hold_until = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)
    action = models.TextField(blank=True)
    recorded_by = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-event_date', '-id']

    def __str__(self):
        return f"{self.event_date} {self.student.student_id} {self.event_type}"


class ClassWaitlist(models.Model):
    STATUS_CHOICES = [
        ('WAITING', 'Menunggu'),
        ('ENROLLED', 'Dimasukkan'),
        ('CANCELLED', 'Dibatalkan'),
    ]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='waitlist_entries')
    timetable_class = models.ForeignKey(ClassTimetable, on_delete=models.CASCADE, related_name='waitlist')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='WAITING')
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_by = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ['created_at']


class ClassAttendanceSession(models.Model):
    """One class on one day: staff record attendance and add notes (j-status.doc: STUDENT ATTENDANCE)"""
    timetable_class = models.ForeignKey(ClassTimetable, on_delete=models.CASCADE, related_name='attendance_sessions')
    date = models.DateField()
    note = models.TextField(blank=True)
    recorded_by = models.CharField(max_length=120, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('timetable_class', 'date')
        ordering = ['-date']


class StudentAttendance(models.Model):
    session = models.ForeignKey(ClassAttendanceSession, on_delete=models.CASCADE, related_name='marks')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='attendance')
    present = models.BooleanField(default=True)
    late = models.BooleanField(default=False)  # present but arrived late
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ('session', 'student')
