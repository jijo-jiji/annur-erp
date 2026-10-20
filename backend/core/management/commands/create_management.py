"""Create the first Management login on a new server.

Every other login is then created by Management inside the app (Settings > Pengguna). The password is asked
for at the keyboard and never shown or kept in the shell history; ANNUR_MANAGEMENT_PASSWORD exists for scripted
setup only."""
import getpass
import os
from django.contrib.auth import password_validation
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from core import accounts
from core.permissions import MANAGEMENT


class Command(BaseCommand):
    help = "Create a Management login (the person who finally approves and sets the centre's policy)."

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True, help='3-30 characters: lowercase letters, numbers, dot or underscore')
        parser.add_argument('--name', required=True, help='Full name shown on records and approvals')

    @transaction.atomic
    def handle(self, *args, **options):
        username = options['username'].strip().lower()
        name = ' '.join(options['name'].split())
        if not accounts.USERNAME.match(username):
            raise CommandError('Username must be 3 to 30 characters: lowercase letters, numbers, dot or underscore.')
        if User.objects.filter(username__iexact=username).exists():
            raise CommandError(f'The username "{username}" is already in use.')
        if not name or len(name) > 150:
            raise CommandError('A full name is required.')

        password = os.environ.get('ANNUR_MANAGEMENT_PASSWORD') or getpass.getpass('Password (at least 10 characters): ')
        if not os.environ.get('ANNUR_MANAGEMENT_PASSWORD') and password != getpass.getpass('Password again: '):
            raise CommandError('The two passwords did not match. Nothing was created.')
        user = User(username=username, first_name=name)
        try:
            password_validation.validate_password(password, user)
        except ValidationError as err:
            raise CommandError('; '.join(err.messages))

        user.set_password(password)
        user.save()
        accounts.set_role(user, MANAGEMENT)
        accounts.set_flag(user, False)  # chosen by the person themselves, so no forced change at first login
        accounts.log(user, 'CREATED', 'Management (dicipta semasa pemasangan)', None)
        self.stdout.write(self.style.SUCCESS(f'Management login "{username}" created. Sign in at the site and create the other logins in Settings.'))
