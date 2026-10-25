# Run inside `manage.py shell` by start-backend.mjs, against the throwaway end-to-end database only.
from datetime import date, timedelta
from django.contrib.auth.models import User
from students.models import Lead

# The demo logins get a password the tests know
for username in ('admin1', 'admin2', 'supervisor', 'management'):
    user = User.objects.get(username=username)
    user.set_password('E2e-Test-Pass-2026')
    user.save()

# One finished lead is old enough to have left the board (it should only be found in Arkib)
Lead.objects.filter(lead_id='LD-2026-003').update(stage_changed_at=date.today() - timedelta(days=90))
print('[e2e] demo logins ready, one old finished lead')

# One monthly fee from last month, due on the 7th and still unpaid: it becomes a week-5 task for Supervisor
from billing.models import Invoice
from students.models import Student
student = Student.objects.filter(status='ACTIVE', student_type='MONTHLY').order_by('student_id').last()
first = date.today().replace(day=1)
last_month = (first - timedelta(days=1)).replace(day=1)
if not Invoice.objects.filter(student=student, billing_month=last_month, invoice_type='MONTHLY').exists():
    Invoice.objects.create(
        invoice_number=f'INV-E2E-{last_month:%Y%m}', student=student, billing_month=last_month, invoice_type='MONTHLY',
        registration_fee=0, monthly_fee=240, total_payable=240, balance_due=240, status='OVERDUE', due_date=last_month.replace(day=7),
    )
print(f'[e2e] week-5 invoice for {student.full_name}')
