from datetime import time
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
    teaching_since = models.DateField(null=True, blank=True)  # when they started teaching, possibly before joining the centre
    remarks = models.TextField(blank=True)

    def __str__(self):
        return f"[{self.teacher_code}] {self.full_name} ({self.teacher_type})"

class TeacherAttendance(models.Model):
    """One class session (j-status.doc: date, grade, subject, teacher in charge, present/absent,
    reason of leave, replacement teacher). The pay for the session is fixed when it is recorded."""
    STATUS_CHOICES = [
        ('PRESENT', 'Hadir'),
        ('ABSENT', 'Tidak Hadir'),
        ('REPLACED', 'Diganti'),
        ('CANCELLED', 'Kelas Batal'),
    ]
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name='attendances')
    timetable_class = models.ForeignKey('academic.ClassTimetable', on_delete=models.SET_NULL, null=True, blank=True, related_name='teacher_attendances')
    class_label = models.CharField(max_length=60, blank=True)  # kept if the class is later removed
    date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PRESENT')
    reason = models.CharField(max_length=200, blank=True)  # reason of leave when absent / replaced
    replacement_teacher = models.ForeignKey(Teacher, on_delete=models.SET_NULL, null=True, blank=True, related_name='replacements_done')
    allowance_earned = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)  # rate of whoever taught
    remarks = models.TextField(blank=True)
    recorded_by = models.CharField(max_length=120, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', 'class_label']
        constraints = [
            models.UniqueConstraint(fields=['timetable_class', 'date'], name='one_record_per_class_per_day'),
        ]

    def __str__(self):
        return f"{self.date} - {self.teacher.teacher_code}: {self.status}"

    @property
    def paid_teacher_id(self):
        """The teacher who is paid for this session, if anyone."""
        if self.status == 'PRESENT':
            return self.teacher_id
        if self.status == 'REPLACED':
            return self.replacement_teacher_id
        return None


class TeacherPayment(models.Model):
    """Monthly pay per teacher: calculated from attendance, verified by Supervisor,
    approved or rejected by Management, then paid (j-status.doc Teachers: Payment)."""
    STATUS_CHOICES = [
        ('DRAFT', 'Draf (dikira)'),
        ('VERIFIED', 'Disahkan Supervisor'),
        ('APPROVED', 'Diluluskan Management'),
        ('REJECTED', 'Ditolak Management'),
        ('PAID', 'Telah Dibayar'),
    ]
    METHOD_CHOICES = [
        ('BANK_TRANSFER', 'Pindahan Bank'),
        ('CASH', 'Tunai'),
        ('CHEQUE', 'Cek'),
    ]
    teacher = models.ForeignKey(Teacher, on_delete=models.PROTECT, related_name='payments')
    month = models.DateField()  # first day of the month
    sessions = models.PositiveIntegerField(default=0)
    calculated_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    adjustment = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # +/- for under / over payment
    adjustment_note = models.CharField(max_length=200, blank=True)
    amount_payable = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    calculated_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.CharField(max_length=120, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.CharField(max_length=120, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_comment = models.TextField(blank=True)
    paid_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
    paid_by = models.CharField(max_length=120, blank=True)
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ['-month', 'teacher__full_name']
        constraints = [models.UniqueConstraint(fields=['teacher', 'month'], name='one_payment_per_teacher_month')]

    def __str__(self):
        return f"{self.teacher.teacher_code} {self.month:%Y-%m}: RM{self.amount_payable} ({self.status})"


class TeacherComplaint(models.Model):
    """Complaint / action report (j-status.doc: description, complained by, date, action taken, PIC, action date)"""
    SEVERITY_CHOICES = [
        ('LOW', 'Rendah'),
        ('MEDIUM', 'Sederhana'),
        ('HIGH', 'Tinggi'),
    ]
    STATUS_CHOICES = [
        ('OPEN', 'Baru'),
        ('IN_PROGRESS', 'Dalam Tindakan'),
        ('RESOLVED', 'Selesai'),
    ]
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name='complaints')
    date_reported = models.DateField()
    complained_by = models.CharField(max_length=150)
    category = models.CharField(max_length=100, blank=True)
    description = models.TextField()
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default='LOW')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    action_taken = models.TextField(blank=True)
    action_pic = models.CharField(max_length=120, blank=True)
    action_date = models.DateField(null=True, blank=True)
    recorded_by = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_reported', '-id']

    def __str__(self):
        return f"{self.date_reported} {self.teacher.teacher_code}: {self.category or self.description[:30]}"

class TeacherRateIncrement(models.Model):
    """Rate increment request and yearly history per teacher; Management approves"""
    STATUS_CHOICES = [
        ('PENDING', 'Menunggu Kelulusan'),
        ('APPROVED', 'Diluluskan'),
        ('REJECTED', 'Ditolak'),
    ]
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name='rate_increments')
    previous_rate = models.DecimalField(max_digits=8, decimal_places=2)
    proposed_rate = models.DecimalField(max_digits=8, decimal_places=2)
    effective_date = models.DateField()
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    proposed_by = models.CharField(max_length=120, blank=True)
    decided_by = models.CharField(max_length=120, blank=True)
    decision_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_date', '-id']

    def __str__(self):
        return f"{self.teacher.teacher_code}: RM{self.previous_rate} -> RM{self.proposed_rate} ({self.status})"

class StaffMember(models.Model):
    """Office staff (j-status.doc Staff Management). Job details are filled in by Management."""
    MARITAL_CHOICES = [
        ('SINGLE', 'Bujang'),
        ('MARRIED', 'Berkahwin'),
        ('DIVORCED', 'Bercerai'),
        ('WIDOWED', 'Balu / Duda'),
    ]
    EMPLOYMENT_CHOICES = [
        ('PERMANENT', 'Tetap'),
        ('CONTRACT', 'Kontrak'),
        ('PART_TIME', 'Sambilan'),
        ('INTERN', 'Pelatih / Latihan Industri'),
    ]
    # Job fields only Management may change; each change is written to the staff history
    JOB_FIELDS = ('role', 'department', 'join_date', 'employment_type', 'contract_start', 'contract_end',
                  'work_start', 'work_end', 'work_days', 'al_entitlement', 'mc_entitlement', 'el_entitlement',
                  'is_active', 'user')

    staff_id = models.CharField(max_length=20, unique=True)
    user = models.OneToOneField('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='staff_profile')
    # Personal
    name = models.CharField(max_length=120)
    ic_number = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    marital_status = models.CharField(max_length=10, choices=MARITAL_CHOICES, blank=True)
    dependents = models.PositiveIntegerField(default=0)
    address = models.TextField(blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30)
    skills = models.TextField(blank=True)
    # Emergency contact
    emergency_name = models.CharField(max_length=120, blank=True)
    emergency_phone = models.CharField(max_length=30, blank=True)
    emergency_address = models.TextField(blank=True)
    emergency_email = models.EmailField(blank=True)
    emergency_relation = models.CharField(max_length=50, blank=True)
    # Job details (Management)
    role = models.CharField(max_length=100)  # position
    department = models.CharField(max_length=100, default='Pentadbiran & Khidmat Pelanggan')
    join_date = models.DateField(null=True, blank=True)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_CHOICES, default='PERMANENT')
    contract_start = models.DateField(null=True, blank=True)
    contract_end = models.DateField(null=True, blank=True)
    work_start = models.TimeField(default=time(8, 30))
    work_end = models.TimeField(default=time(17, 30))
    work_days = models.CharField(max_length=20, default='0,1,2,3,4,5')  # weekday numbers, Monday = 0
    al_entitlement = models.PositiveIntegerField(default=12)  # days per year
    mc_entitlement = models.PositiveIntegerField(default=14)
    el_entitlement = models.PositiveIntegerField(default=3)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"[{self.staff_id}] {self.name} - {self.role}"

    @property
    def work_weekdays(self):
        return {int(d) for d in self.work_days.split(',') if d.strip().isdigit()}


class StaffHistory(models.Model):
    """Job history: changes to position, department, contract, status (j-status.doc: History)."""
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='history')
    date = models.DateField()
    change = models.TextField()
    remark = models.TextField(blank=True)
    recorded_by = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']


class StaffRecord(models.Model):
    """General staff record (j-status.doc Record: date, description, remark)."""
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='records')
    date = models.DateField()
    description = models.TextField()
    remark = models.TextField(blank=True)
    recorded_by = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']


class StaffKPI(models.Model):
    """KPI set for a staff member for a year, then reviewed with an achievement score."""
    STATUS_CHOICES = [('SET', 'Ditetapkan'), ('REVIEWED', 'Disemak')]
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='kpis')
    year = models.PositiveIntegerField()
    title = models.CharField(max_length=150)
    target = models.CharField(max_length=200)
    weight = models.PositiveIntegerField(default=0)  # % of the year's KPI
    achieved = models.CharField(max_length=200, blank=True)
    score = models.PositiveIntegerField(null=True, blank=True)  # 0-100 % of target achieved
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='SET')
    set_by = models.CharField(max_length=120, blank=True)
    reviewed_by = models.CharField(max_length=120, blank=True)
    review_comment = models.TextField(blank=True)
    reviewed_at = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-year', 'staff__name', 'id']


class StaffAttendance(models.Model):
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField()
    clock_in = models.TimeField(null=True, blank=True)
    clock_out = models.TimeField(null=True, blank=True)
    location = models.CharField(max_length=150, default='Pusat Tuisyen An Nur (Telipot, KB)')
    status = models.CharField(max_length=20, default='PRESENT')
    note = models.CharField(max_length=200, blank=True)  # reason when a time was corrected
    corrected_by = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ['-date']
        constraints = [models.UniqueConstraint(fields=['staff', 'date'], name='one_attendance_per_staff_day')]

    def __str__(self):
        return f"{self.date} - {self.staff.name} ({self.clock_in} - {self.clock_out or 'Aktif'})"

    @property
    def late_minutes(self):
        if not self.clock_in or self.date.weekday() not in self.staff.work_weekdays:
            return 0
        return max(0, _minutes(self.clock_in) - _minutes(self.staff.work_start))

    @property
    def early_minutes(self):
        if not self.clock_out or self.date.weekday() not in self.staff.work_weekdays:
            return 0
        return max(0, _minutes(self.staff.work_end) - _minutes(self.clock_out))

    @property
    def worked_minutes(self):
        if not (self.clock_in and self.clock_out):
            return None
        return max(0, _minutes(self.clock_out) - _minutes(self.clock_in))


def _minutes(t):
    return t.hour * 60 + t.minute


class LeaveRequest(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Menunggu Kelulusan'),
        ('APPROVED', 'Diluluskan'),
        ('REJECTED', 'Ditolak'),
    ]
    TYPE_CHOICES = [
        ('AL', 'Cuti Tahunan (AL)'),
        ('MC', 'Cuti Sakit (MC)'),
        ('EL', 'Cuti Kecemasan (EL)'),
        ('UL', 'Cuti Tanpa Gaji (UL)'),
    ]
    leave_id = models.CharField(max_length=30, unique=True)
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='leave_requests')
    leave_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='AL')
    start_date = models.DateField()
    end_date = models.DateField()
    days_count = models.IntegerField(default=1)
    reason = models.TextField()
    mc_document = models.CharField(max_length=200, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    supervisor_remark = models.TextField(blank=True)
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-applied_at']

    def __str__(self):
        return f"[{self.leave_id}] {self.staff.name} - {self.leave_type} ({self.status})"
