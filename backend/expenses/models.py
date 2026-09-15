from django.db import models

class Vendor(models.Model):
    vendor_id = models.CharField(max_length=30, unique=True)
    vendor_name = models.CharField(max_length=150)
    pic_name = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account = models.CharField(max_length=50, blank=True)
    tin_number = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, default='ACTIVE')

    def __str__(self):
        return f"[{self.vendor_id}] {self.vendor_name}"

class PaymentVoucher(models.Model):
    TIER_CHOICES = [
        ('TIER_1', 'Below RM500 (Admin Verification)'),
        ('TIER_2', 'RM500 - RM3,000 (Supervisor Approval)'),
        ('TIER_3', 'Above RM3,000 (Management Approval)'),
    ]
    STATUS_CHOICES = [
        ('DRAFT', 'Draf'),
        ('VERIFIED_ADMIN', 'Disahkan Admin'),
        ('APPROVED_SUPERVISOR', 'Diluluskan Supervisor'),
        ('APPROVED_MANAGEMENT', 'Diluluskan Pengurusan'),
        ('REJECTED', 'Ditolak'),
    ]
    pv_number = models.CharField(max_length=30, unique=True) # e.g. PV26-0301
    date = models.DateField()
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.CharField(max_length=100)
    subcategory = models.CharField(max_length=100, blank=True)
    payment_method = models.CharField(max_length=50, default='ONLINE_TRANSFER')
    ref_number = models.CharField(max_length=100, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    items_description = models.TextField()
    remarks = models.TextField(blank=True)
    tier_level = models.CharField(max_length=20, choices=TIER_CHOICES, default='TIER_1')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='DRAFT')
    prepared_by = models.CharField(max_length=100, default='Admin')
    approved_by = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.pv_number}] RM{self.amount} - {self.category} ({self.status})"
