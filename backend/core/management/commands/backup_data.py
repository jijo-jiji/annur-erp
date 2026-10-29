"""Take a consistent copy of the centre's data: the database and every uploaded file, in one dated archive.

Run it every night (deploy/annur-backup.timer) and before every update. The database is copied with SQLite's own
backup call, so it is safe while the system is in use. Old archives are deleted after --keep-days. An archive on the
same server does not protect against losing the server: copy the backup folder somewhere else as well.

On PostgreSQL (the hosted setup) the database is written as text (db.json) instead of a SQLite file. It is read back
into a freshly migrated database with `manage.py loaddata db.json`. Files kept in Cloudflare R2 are not in the archive:
they are already stored outside the server."""
import sqlite3
import tarfile
import tempfile
import time
from pathlib import Path
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

# What a restore does not need, or rebuilds itself when the tables are created
JSON_EXCLUDE = ('contenttypes', 'auth.permission', 'sessions', 'admin.logentry')


class Command(BaseCommand):
    help = 'Write annur-YYYYMMDD-HHMMSS.tar.gz (database + uploads) to the backup folder and remove archives older than --keep-days.'

    def add_arguments(self, parser):
        parser.add_argument('--dest', help='Backup folder (default: ANNUR_BACKUP_DIR, else <data folder>/backups)')
        parser.add_argument('--keep-days', type=int, default=30, help='Delete archives older than this many days (default 30)')
        parser.add_argument('--format', choices=['auto', 'sqlite', 'json'], default='auto',
                            help='sqlite: a copy of the SQLite file. json: every record as text, for PostgreSQL and for moving data '
                                 'from one database to another. Default: sqlite on SQLite, json on anything else.')

    def copy_sqlite(self, folder):
        snapshot = folder / 'db.sqlite3'
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
        return snapshot

    def dump_json(self, folder):
        snapshot = folder / 'db.json'
        call_command('dumpdata', '--natural-foreign', '--natural-primary', '--output', str(snapshot),
                     *[arg for name in JSON_EXCLUDE for arg in ('--exclude', name)])
        return snapshot

    def handle(self, *args, **options):
        kind = options['format']
        if kind == 'auto':
            kind = 'sqlite' if connection.vendor == 'sqlite' else 'json'
        if kind == 'sqlite' and connection.vendor != 'sqlite':
            raise CommandError('A copy of the SQLite file needs a SQLite database. Use --format json.')
        dest = Path(options['dest'] or settings.BACKUP_DIR)
        dest.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime('%Y%m%d-%H%M%S')
        final = dest / f'annur-{stamp}.tar.gz'
        partial = dest / f'annur-{stamp}.tar.gz.partial'

        with tempfile.TemporaryDirectory(dir=dest) as tmp:
            snapshot = self.copy_sqlite(Path(tmp)) if kind == 'sqlite' else self.dump_json(Path(tmp))
            uploads = Path(settings.MEDIA_ROOT)
            with tarfile.open(partial, 'w:gz') as archive:
                archive.add(snapshot, arcname=snapshot.name)
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
