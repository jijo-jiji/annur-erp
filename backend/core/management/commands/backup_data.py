"""Take a consistent copy of the centre's data: the database and every uploaded file, in one dated archive.

Run it every night (deploy/annur-backup.timer) and before every update. The database is copied with SQLite's own
backup call, so it is safe while the system is in use. Old archives are deleted after --keep-days. An archive on the
same server does not protect against losing the server: copy the backup folder somewhere else as well."""
import sqlite3
import tarfile
import tempfile
import time
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = 'Write annur-YYYYMMDD-HHMMSS.tar.gz (database + uploads) to the backup folder and remove archives older than --keep-days.'

    def add_arguments(self, parser):
        parser.add_argument('--dest', help='Backup folder (default: ANNUR_BACKUP_DIR, else <data folder>/backups)')
        parser.add_argument('--keep-days', type=int, default=30, help='Delete archives older than this many days (default 30)')

    def handle(self, *args, **options):
        if connection.vendor != 'sqlite':
            raise CommandError('This backup is written for the SQLite database.')
        dest = Path(options['dest'] or settings.BACKUP_DIR)
        dest.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime('%Y%m%d-%H%M%S')
        final = dest / f'annur-{stamp}.tar.gz'
        partial = dest / f'annur-{stamp}.tar.gz.partial'

        with tempfile.TemporaryDirectory(dir=dest) as tmp:
            snapshot = Path(tmp) / 'db.sqlite3'
            connection.ensure_connection()
            target = sqlite3.connect(snapshot)
            started = time.monotonic()

            def give_up_if_stuck(status, remaining, total):
                if time.monotonic() - started > 120:
                    raise CommandError('The database stayed busy for two minutes, so no backup was made. Try again.')
            try:
                connection.connection.backup(target, progress=give_up_if_stuck)
                if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise CommandError('The database copy failed its integrity check. No backup was kept.')
            finally:
                target.close()
            uploads = Path(settings.MEDIA_ROOT)
            with tarfile.open(partial, 'w:gz') as archive:
                archive.add(snapshot, arcname='db.sqlite3')
                if uploads.is_dir():
                    archive.add(uploads, arcname='uploads')
        partial.chmod(0o600)  # personal data of students and staff
        partial.replace(final)

        removed = 0
        cutoff = time.time() - options['keep_days'] * 86400
        for old in dest.glob('annur-*.tar.gz'):
            if old != final and old.stat().st_mtime < cutoff:
                old.unlink()
                removed += 1
        size = final.stat().st_size / (1024 * 1024)
        self.stdout.write(self.style.SUCCESS(f'Backup written: {final} ({size:.1f} MB). Removed {removed} older archive(s).'))
