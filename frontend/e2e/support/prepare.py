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
