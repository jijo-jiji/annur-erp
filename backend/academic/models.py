from django.db import models
from business_config.models import SubjectMaster
from teachers.models import Teacher

class Classroom(models.Model):
    name = models.CharField(max_length=50, unique=True)
    capacity = models.IntegerField(default=20)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} (Max {self.capacity})"

class TimeSlot(models.Model):
    DAY_CHOICES = [
        ('JUMAAT', 'Jumaat'),
        ('SABTU', 'Sabtu'),
        ('ISNIN', 'Isnin'),
        ('SELASA', 'Selasa'),
        ('RABU', 'Rabu'),
        ('KHAMIS', 'Khamis'),
    ]
    day = models.CharField(max_length=15, choices=DAY_CHOICES)
    start_time = models.CharField(max_length=10) # e.g. "09:00"
    end_time = models.CharField(max_length=10)   # e.g. "10:30"
    period_label = models.CharField(max_length=30) # e.g. "Pagi 9.00 - 10.30"

    class Meta:
        ordering = ['day', 'start_time']

    def __str__(self):
        return f"{self.day} {self.start_time}-{self.end_time} ({self.period_label})"

class ClassTimetable(models.Model):
    FORM_CHOICES = [
        ('S5', 'Darjah 5'),
        ('S6', 'Darjah 6'),
        ('F1', 'Form 1'),
        ('F2', 'Form 2'),
        ('F3', 'Form 3'),
        ('F4', 'Form 4'),
        ('F5', 'Form 5'),
    ]
    SECTION_CHOICES = [
        ('A', 'Seksyen A'),
        ('B', 'Seksyen B'),
        ('C', 'Seksyen C'),
        ('D', 'Seksyen D'),
    ]
    slot = models.ForeignKey(TimeSlot, on_delete=models.CASCADE, related_name='classes')
    subject = models.ForeignKey(SubjectMaster, on_delete=models.CASCADE)
    form_level = models.CharField(max_length=10, choices=FORM_CHOICES)
    section = models.CharField(max_length=5, choices=SECTION_CHOICES, default='A')
    teacher = models.ForeignKey(Teacher, on_delete=models.SET_NULL, null=True, blank=True)
    classroom = models.ForeignKey(Classroom, on_delete=models.SET_NULL, null=True, blank=True)
    max_seats = models.IntegerField(default=20)
    current_enrolled = models.IntegerField(default=0)

    class Meta:
        ordering = ['form_level', 'subject', 'section']

    @property
    def class_code(self):
        teacher_init = self.teacher.teacher_code if self.teacher else 'TBA'
        return f"{self.form_level} {self.subject.code} ({self.section}) {teacher_init}"

    @property
    def available_seats(self):
        return self.max_seats - self.current_enrolled

    def __str__(self):
        return self.class_code

class ClassRescheduleLog(models.Model):
    REASON_CHOICES = [
        ('PH', 'Cuti Umum / Hari Pelepasan Am'),
        ('MARKING_PAPER', 'Guru Menanda Kertas Peperiksaan'),
        ('TIME_MISTAKE', 'Pembetulan Jadual / Masa Bertindih'),
        ('EMERGENCY_LEAVE', 'Kecemasan / Cuti Sakit Guru'),
        ('EXTRA_SESSION', 'Kelas Tambahan Peperiksaan'),
        ('OTHER', 'Lain-lain'),
    ]
    timetable_class = models.ForeignKey(ClassTimetable, on_delete=models.CASCADE, related_name='reschedules')
    month_label = models.CharField(max_length=20) # e.g. "DEC '25", "JAN '26"
    tarikh_batal = models.DateField(null=True, blank=True)
    tarikh_ganti = models.DateField(null=True, blank=True)
    is_extra_class = models.BooleanField(default=False)
    reason_type = models.CharField(max_length=30, choices=REASON_CHOICES, default='OTHER')
    remarks = models.TextField(blank=True)
    supervisor_approved = models.BooleanField(default=False)
    whatsapp_notification_sent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        extra = "[EXTRA] " if self.is_extra_class else ""
        return f"{extra}{self.timetable_class.class_code} | Batal: {self.tarikh_batal} -> Ganti: {self.tarikh_ganti}"
