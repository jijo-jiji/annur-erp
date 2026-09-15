from django.db import models

class SubjectMaster(models.Model):
    LEVEL_CHOICES = [
        ('PRIMARY', 'Primary (Darjah 5-6)'),
        ('LOWER_SEC', 'Lower Secondary (Form 1-3)'),
        ('UPPER_SEC', 'Upper Secondary (Form 4-5)'),
    ]
    STREAM_CHOICES = [
        ('TERAS', 'Teras / General'),
        ('SAINS', 'Aliran Sains'),
        ('SASTERA', 'Aliran Sastera'),
    ]
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    level_category = models.CharField(max_length=20, choices=LEVEL_CHOICES)
    stream = models.CharField(max_length=20, choices=STREAM_CHOICES, default='TERAS')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} - {self.name} ({self.level_category})"

class PricingTier(models.Model):
    CATEGORY_CHOICES = [
        ('SECONDARY', 'Sekolah Menengah (Form 1 - 5)'),
        ('DARJAH_5', 'Darjah 5'),
        ('DARJAH_6', 'Darjah 6'),
        ('WALK_IN', 'Walk-in Rate'),
    ]
    level_category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    subject_count = models.IntegerField(default=4)
    price_per_subject = models.DecimalField(max_digits=8, decimal_places=2, default=60.00)
    total_price = models.DecimalField(max_digits=8, decimal_places=2, default=240.00)
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['level_category', 'subject_count']

    def __str__(self):
        return f"{self.level_category} - {self.subject_count} Sub: RM{self.total_price}"

class BusinessSetting(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.key} = {self.value}"

class TeacherRateSetting(models.Model):
    teacher_type = models.CharField(max_length=30, unique=True) # PERMANENT or REPLACEMENT
    base_rate_per_session = models.DecimalField(max_digits=8, decimal_places=2, default=60.00)
    annual_increment_pct = models.DecimalField(max_digits=5, decimal_places=2, default=5.00)
    description = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return f"{self.teacher_type}: RM{self.base_rate_per_session}/sesi"
