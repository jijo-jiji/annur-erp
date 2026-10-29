"""The hosted setup: PostgreSQL (Neon) for the data and Cloudflare R2 for uploaded files.

A hosted web service (Render) has no permanent disk, so the SQLite file and the uploads folder cannot live on it.
settings.py uses these two helpers only when DATABASE_URL / R2_BUCKET are set; without them the system keeps using the
SQLite file and the uploads folder, exactly as on a single server or a developer's machine."""
from urllib.parse import parse_qsl, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured


def database_from_url(url):
    """Django's DATABASES entry for a PostgreSQL connection string, such as the one Neon shows:
    postgresql://user:password@ep-name.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"""
    parts = urlsplit(url)
    if parts.scheme not in ('postgres', 'postgresql') or not parts.hostname or not parts.path.strip('/'):
        raise ImproperlyConfigured(
            'DATABASE_URL must be a PostgreSQL address: postgresql://user:password@host/database?sslmode=require')
    return {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': unquote(parts.path.lstrip('/')),
        'USER': unquote(parts.username or ''),
        'PASSWORD': unquote(parts.password or ''),
        'HOST': parts.hostname,
        'PORT': parts.port or '',
        # Neon stops its compute when idle, which closes connections that were kept open. Django checks a kept
        # connection before using it and opens a new one when it is gone; waiting 15 seconds covers a cold start.
        'CONN_MAX_AGE': 60,
        'CONN_HEALTH_CHECKS': True,
        # Safe through Neon's connection pooler (PgBouncer), which cannot keep a cursor open between queries
        'DISABLE_SERVER_SIDE_CURSORS': True,
        # sslmode and the other options in the address (Neon needs sslmode=require) go to the driver as they are
        'OPTIONS': {'connect_timeout': 15, **dict(parse_qsl(parts.query))},
    }


R2_REQUIRED = ('R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY')


def r2_storage(env):
    """The `default` entry of STORAGES for a private R2 bucket, or None when R2_BUCKET is not set.

    The bucket stays private: files are never given a public address, they are read by the server and served through
    the permission-checked download (core/attachments.py), as with the uploads folder."""
    if not env.get('R2_BUCKET', '').strip():
        return None
    missing = [name for name in R2_REQUIRED if not env.get(name, '').strip()]
    endpoint = env.get('R2_ENDPOINT_URL', '').strip()
    if not endpoint:
        account = env.get('R2_ACCOUNT_ID', '').strip()
        if not account:
            missing.append('R2_ACCOUNT_ID')
        endpoint = f'https://{account}.r2.cloudflarestorage.com'
    if missing:
        raise ImproperlyConfigured('R2 is partly set up. Missing: ' + ', '.join(missing))
    # Imported here so a machine that does not use R2 does not need boto3
    from botocore.config import Config
    return {
        'BACKEND': 'storages.backends.s3.S3Storage',
        'OPTIONS': {
            'bucket_name': env['R2_BUCKET'].strip(),
            'access_key': env['R2_ACCESS_KEY_ID'].strip(),
            'secret_key': env['R2_SECRET_ACCESS_KEY'].strip(),
            'endpoint_url': endpoint,
            'region_name': 'auto',
            # boto3 adds checksum headers to every upload and download by default, which R2 answers with an
            # "internal error". Asking for them only when a call requires them is the setting Cloudflare documents.
            # Setting client_config replaces the signature options, so they are repeated here.
            'client_config': Config(
                signature_version='s3v4',
                request_checksum_calculation='when_required',
                response_checksum_validation='when_required',
            ),
        },
    }
