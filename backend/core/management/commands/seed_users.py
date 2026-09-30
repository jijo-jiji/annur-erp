import secrets
from pathlib import Path
from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand
from core.permissions import ALL_ROLES, ADMIN, SUPERVISOR, MANAGEMENT

# Users listed in j-status.doc: Admin 1, Admin 2, Supervisor, Management
DEFAULT_USERS = [
    ('admin1', 'Admin', '1', ADMIN),
    ('admin2', 'Admin', '2', ADMIN),
    ('supervisor', 'Supervisor', '', SUPERVISOR),
    ('management', 'Management', '', MANAGEMENT),
]

CREDENTIALS_FILE = Path(settings.BASE_DIR) / 'dev_credentials.txt'


class Command(BaseCommand):
    help = "Create role groups and the four default users. New passwords are written to dev_credentials.txt (git-ignored)."

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Generate new passwords for the default users too')

    def handle(self, *args, **options):
        for role in ALL_ROLES:
            Group.objects.get_or_create(name=role)

        issued = []
        for username, first, last, role in DEFAULT_USERS:
            user, created = User.objects.get_or_create(
                username=username, defaults={'first_name': first, 'last_name': last}
            )
            user.groups.set([Group.objects.get(name=role)])
            if created or options['reset']:
                password = secrets.token_urlsafe(9)
                user.set_password(password)
                issued.append((username, role, password))
            user.save()

        if issued:
            lines = [f"{u:<12} {r:<11} {p}" for u, r, p in issued]
            with CREDENTIALS_FILE.open('a', encoding='utf-8') as f:
                f.write("\n".join(lines) + "\n")
            self.stdout.write(self.style.SUCCESS(
                f"{len(issued)} password(s) written to {CREDENTIALS_FILE.name}. Change them after first login."
            ))
        else:
            self.stdout.write("Users and groups are up to date; no passwords changed (use --reset to issue new ones).")
