from django.db import models
from students.models import Student

class Invoice(models.Model):
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
    whatsapp_sent = models.BooleanField(default=False)
    received_by = models.CharField(max_length=100, default='Admin Pejabat')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.receipt_number}] RM{self.amount_paid} ({self.payment_method})"
