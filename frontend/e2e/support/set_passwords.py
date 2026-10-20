# Run inside `manage.py shell` by start-backend.mjs: gives the demo logins a password the tests know.
# This only ever runs against the throwaway end-to-end database.
from django.contrib.auth.models import User

for username in ('admin1', 'admin2', 'supervisor', 'management'):
    user = User.objects.get(username=username)
    user.set_password('E2e-Test-Pass-2026')
    user.save()
print('[e2e] demo logins ready')
