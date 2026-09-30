from django.db import models
from students.models import Student

class Discount(models.Model):
    """Discount type with its voucher code (j-status.doc: discount type, voucher code, RM).

    Recurring discounts (e.g. siblings) are assigned to a student and applied to every monthly
    invoice; one-off codes (e.g. a promotion) are keyed in against a single invoice."""
    MODES = [('FIXED', 'RM'), ('PERCENT', '%')]
    name = models.CharField(max_length=100)  # discount type, e.g. "Adik-beradik", "Anak yatim", "Promosi Merdeka"
    code = models.CharField(max_length=30, unique=True)
    mode = models.CharField(max_length=10, choices=MODES, default='FIXED')
    value = models.DecimalField(max_digits=8, decimal_places=2)
    recurring = models.BooleanField(default=False)
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    max_uses = models.PositiveIntegerField(null=True, blank=True)
    used_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.code})"


class Invoice(models.Model):
    TYPES = [
        ('FIRST', 'Pendaftaran & Bulan Pertama'),
        ('MONTHLY', 'Yuran Bulanan'),
        ('OTHER', 'Lain-lain (Seminar dll.)'),
    ]
    STATUS_CHOICES = [
        ('UNPAID', 'Belum Bayar'),
        ('PARTIAL', 'Sebahagian'),
        ('PAID', 'Selesai Bayar'),
        ('OVERDUE', 'Tertunggak'),
    ]
    invoice_number = models.CharField(max_length=40, unique=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='invoices')
    billing_month = models.DateField() # e.g. 2026-03-01
    registration_fee = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)
    monthly_fee = models.DecimalField(max_digits=8, decimal_places=2, default=240.00)
    discount_amount = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)
    discount_remarks = models.CharField(max_length=150, blank=True)
    discount = models.ForeignKey(Discount, on_delete=models.PROTECT, null=True, blank=True, related_name='invoices')
    invoice_type = models.CharField(max_length=10, choices=TYPES, default='FIRST')
    description = models.CharField(max_length=150, blank=True)  # for OTHER invoices, e.g. "Seminar SPM"
    credit_applied = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # from the student's credit
    reminder_count = models.PositiveIntegerField(default=0)
    last_reminder_at = models.DateField(null=True, blank=True)
    total_payable = models.DecimalField(max_digits=8, decimal_places=2)
    total_paid = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)
    balance_due = models.DecimalField(max_digits=8, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='UNPAID')
    due_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.invoice_number}] {self.student.full_name} - RM{self.total_payable} ({self.status})"

class PaymentReceipt(models.Model):
    METHOD_CHOICES = [
        ('DUITNOW_QR', 'DuitNow QR'),
        ('ONLINE_BANKING', 'Online Banking / FPX'),
        ('CASH', 'Tunai'),
        ('CARD', 'Kad Debit/Kredit'),
    ]
    receipt_number = models.CharField(max_length=40, unique=True) # e.g. REC-2026-0001
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='payments')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='payments')
    payment_date = models.DateField()
    amount_paid = models.DecimalField(max_digits=8, decimal_places=2)
    payment_method = models.CharField(max_length=30, choices=METHOD_CHOICES, default='DUITNOW_QR')
    reference_number = models.CharField(max_length=100, blank=True)
    payment_type = models.CharField(max_length=20, choices=[
        ('REG_FEE', 'Yuran Pendaftaran'),
        ('MONTHLY', 'Yuran Bulanan'),
        ('SEMINAR', 'Seminar'),
        ('OUTSTANDING', 'Tunggakan'),
    ], default='MONTHLY')
    payment_month = models.DateField(null=True, blank=True)  # which month a monthly fee covers
    notes = models.TextField(blank=True)
    overpaid_amount = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # moved to student credit
    whatsapp_sent = models.BooleanField(default=False)
    received_by = models.CharField(max_length=100, default='Admin Pejabat')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.receipt_number}] RM{self.amount_paid} ({self.payment_method})"
