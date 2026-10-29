"""The hosted setup: Neon (PostgreSQL), Cloudflare R2, the web app on another address, and the host's health check."""
import importlib.util
import os
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
from io import StringIO
from pathlib import Path
from unittest import skipUnless

from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings

from annur_erp.cloud import database_from_url, r2_storage

MANAGE = Path(__file__).resolve().parent.parent / 'manage.py'
NEON = 'postgresql://annur_owner:p%40ss%2Fword@ep-quiet-rain-a1b2c3-pooler.ap-southeast-1.aws.neon.tech/annur?sslmode=require&channel_binding=require'
R2 = {'R2_BUCKET': 'annur-files', 'R2_ACCOUNT_ID': 'abc123', 'R2_ACCESS_KEY_ID': 'key', 'R2_SECRET_ACCESS_KEY': 'secret'}


class DatabaseAddressTests(SimpleTestCase):
    def test_a_neon_address_becomes_a_database_entry(self):
        db = database_from_url(NEON)
        self.assertEqual(db['ENGINE'], 'django.db.backends.postgresql')
        self.assertEqual((db['NAME'], db['USER']), ('annur', 'annur_owner'))
        self.assertEqual(db['PASSWORD'], 'p@ss/word')  # characters that cannot sit in an address arrive encoded
        self.assertEqual(db['HOST'], 'ep-quiet-rain-a1b2c3-pooler.ap-southeast-1.aws.neon.tech')
        self.assertEqual(db['PORT'], '')
        self.assertEqual(db['OPTIONS']['sslmode'], 'require')  # Neon refuses connections without it
        self.assertEqual(db['OPTIONS']['channel_binding'], 'require')

    def test_the_connection_survives_neon_going_to_sleep(self):
        db = database_from_url(NEON)
        self.assertTrue(db['CONN_HEALTH_CHECKS'])  # a connection closed while idle is replaced, not used
        self.assertGreater(db['OPTIONS']['connect_timeout'], 5)  # the first connection after sleep is slow
        self.assertTrue(db['DISABLE_SERVER_SIDE_CURSORS'])  # Neon's pooler cannot keep a cursor open

    def test_a_port_is_kept(self):
        self.assertEqual(database_from_url('postgres://u:p@localhost:5433/db')['PORT'], 5433)

    def test_anything_that_is_not_a_postgresql_address_is_refused(self):
        for bad in ('mysql://u:p@host/db', 'postgresql://u:p@host', 'postgresql:///db', 'db.sqlite3', 'https://neon.tech'):
            with self.assertRaises(ImproperlyConfigured, msg=bad):
                database_from_url(bad)


class FileStorageSettingsTests(SimpleTestCase):
    def test_without_a_bucket_the_uploads_folder_is_used(self):
        self.assertIsNone(r2_storage({}))
        self.assertIsNone(r2_storage({'R2_BUCKET': '  '}))

    def test_a_bucket_with_a_key_missing_is_refused_and_names_what_is_missing(self):
        with self.assertRaises(ImproperlyConfigured) as caught:
            r2_storage({'R2_BUCKET': 'annur-files', 'R2_ACCOUNT_ID': 'abc123', 'R2_ACCESS_KEY_ID': 'key'})
        self.assertIn('R2_SECRET_ACCESS_KEY', str(caught.exception))
        with self.assertRaises(ImproperlyConfigured) as caught:
            r2_storage({k: v for k, v in R2.items() if k != 'R2_ACCOUNT_ID'})
        self.assertIn('R2_ACCOUNT_ID', str(caught.exception))

    @staticmethod
    def has_botocore():
        return importlib.util.find_spec('botocore') is not None

    def test_the_bucket_is_reached_through_the_account_address(self):
        if not self.has_botocore():
            self.skipTest('botocore is installed only with requirements-production.txt')
        options = r2_storage(R2)['OPTIONS']
        self.assertEqual(options['endpoint_url'], 'https://abc123.r2.cloudflarestorage.com')
        self.assertEqual((options['bucket_name'], options['region_name']), ('annur-files', 'auto'))
        eu = r2_storage({**R2, 'R2_ENDPOINT_URL': 'https://abc123.eu.r2.cloudflarestorage.com'})
        self.assertEqual(eu['OPTIONS']['endpoint_url'], 'https://abc123.eu.r2.cloudflarestorage.com')

    def test_uploads_do_not_trip_the_checksum_headers_r2_rejects(self):
        if not self.has_botocore():
            self.skipTest('botocore is installed only with requirements-production.txt')
        config = r2_storage(R2)['OPTIONS']['client_config']
        self.assertEqual(config.request_checksum_calculation, 'when_required')
        self.assertEqual(config.response_checksum_validation, 'when_required')
        self.assertEqual(config.signature_version, 's3v4')


class HostedStartupTests(SimpleTestCase):
    """The settings are read when the server starts, so these start it, as test_the_live_server_refuses_to_start does."""

    @staticmethod
    def start(*command, **env):
        base = {k: v for k, v in os.environ.items() if not k.startswith(('ANNUR_', 'DJANGO_', 'DATABASE_', 'R2_', 'RENDER_'))}
        return subprocess.run([sys.executable, str(MANAGE), *(command or ('check',))], env={**base, **env},
                              capture_output=True, text=True, cwd=MANAGE.parent)

    PRODUCTION = {'ANNUR_ENV': 'production', 'DJANGO_SECRET_KEY': 'k' * 60}

    def test_a_hosted_database_without_r2_refuses_to_start(self):
        # the host's disk is wiped at every update; files kept on it would disappear without a word
        run = self.start(**self.PRODUCTION, ANNUR_HOSTS='api.example.com', DATABASE_URL=NEON)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('R2_BUCKET', run.stderr)

    def test_render_supplies_the_address_the_server_answers_on(self):
        run = self.start(**self.PRODUCTION, RENDER_EXTERNAL_HOSTNAME='annur-api.onrender.com')
        self.assertEqual(run.returncode, 0, run.stderr)
        shown = self.start('shell', '-c', 'from django.conf import settings; print(settings.ALLOWED_HOSTS, settings.CSRF_TRUSTED_ORIGINS)',
                           **self.PRODUCTION, RENDER_EXTERNAL_HOSTNAME='annur-api.onrender.com')
        self.assertIn("['annur-api.onrender.com'] ['https://annur-api.onrender.com']", shown.stdout)

    def test_only_the_named_web_app_may_call_the_api(self):
        code = 'from django.conf import settings; print(settings.CORS_ALLOWED_ORIGINS, settings.REST_FRAMEWORK["NUM_PROXIES"])'
        one_server = self.start('shell', '-c', code, **self.PRODUCTION, ANNUR_HOSTS='erp.example.com')
        self.assertIn("[] 1", one_server.stdout)  # one address: nobody else needs access, one proxy (nginx) in front
        hosted = self.start('shell', '-c', code, **self.PRODUCTION, ANNUR_HOSTS='api.example.com',
                            ANNUR_CORS_ORIGINS='https://annur.vercel.app/, https://erp.annur.my', ANNUR_PROXIES='2')
        self.assertIn("['https://annur.vercel.app', 'https://erp.annur.my'] 2", hosted.stdout)  # a trailing slash is forgiven


class HealthCheckTests(TestCase):
    def test_the_hosts_health_check_is_answered_without_the_host_and_https_rules(self):
        # Render calls it by an internal address over plain HTTP; both rules would refuse that
        with override_settings(ALLOWED_HOSTS=['api.example.com'], SECURE_SSL_REDIRECT=True):
            health = self.client.get('/healthz', HTTP_HOST='10.0.0.7')
            self.assertEqual((health.status_code, health.content), (200, b'ok'))
            self.assertEqual(self.client.get('/api/v1/centre/', HTTP_HOST='10.0.0.7').status_code, 400)  # the rules still apply to the API
            self.assertEqual(self.client.get('/api/v1/centre/', HTTP_HOST='api.example.com').status_code, 301)

    def test_it_does_not_touch_the_database(self):
        with self.assertNumQueries(0):
            self.client.get('/healthz')


@skipUnless(connection.vendor == 'postgresql', 'SQLite runs one write transaction at a time, so the race cannot happen there')
class NumberingRaceTests(TransactionTestCase):
    """Two requests that ask for the next number at the same moment, as two counters saving a receipt would."""

    def test_two_requests_at_once_never_take_the_same_number(self):
        from django.contrib.auth.models import Group
        from django.db import transaction
        from core import numbering
        taken, errors = [], []
        both_here = threading.Barrier(2)

        def request():
            try:
                with transaction.atomic():
                    both_here.wait(timeout=10)
                    name = numbering.next_number(Group, 'name', 'NO-', 3)
                    time.sleep(0.5)  # the rest of the request: the other one is by now reading the same highest number
                    Group.objects.create(name=name)
                    taken.append(name)
            except Exception as err:  # noqa: BLE001 - the test reports whatever went wrong
                errors.append(repr(err))
            finally:
                connection.close()

        threads = [threading.Thread(target=request) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        self.assertEqual(sorted(taken), ['NO-001', 'NO-002'])


class JsonBackupTests(TransactionTestCase):
    """The backup for PostgreSQL, where the database is not a file that can be copied."""

    def test_the_json_backup_loads_back_into_an_empty_database(self):
        User.objects.create_user(username='sebelum_sandar', password='test-pass-123')
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'backups'
            call_command('backup_data', dest=str(dest), format='json', stdout=StringIO())
            archive = next(dest.glob('annur-*.tar.gz'))
            with tarfile.open(archive) as tar:
                self.assertIn('db.json', tar.getnames())
                self.assertNotIn('db.sqlite3', tar.getnames())
                tar.extract('db.json', tmp)
            call_command('flush', interactive=False, verbosity=0)
            self.assertFalse(User.objects.filter(username='sebelum_sandar').exists())
            call_command('loaddata', str(Path(tmp) / 'db.json'), verbosity=0)
            restored = User.objects.get(username='sebelum_sandar')
            self.assertTrue(restored.check_password('test-pass-123'))

    def test_a_sqlite_file_copy_is_refused_on_another_database(self):
        from unittest import mock
        from django.core.management.base import CommandError
        with mock.patch('core.management.commands.backup_data.connection') as fake:
            fake.vendor = 'postgresql'
            with self.assertRaises(CommandError):
                call_command('backup_data', format='sqlite', stdout=StringIO())
