"""Sequential document numbers that restart per period (e.g. REC-2026-0001, PV26-0901), and student codes."""
import re
from django.db import connection


def one_at_a_time(key):
    """Make a second request that wants the next number wait for the first to save its own.

    Reading the highest number and saving the next one are two steps. SQLite lets only one write transaction run at a
    time, so nobody could slip in between. PostgreSQL does not, and two requests at the same moment would take the same
    number (and the second would fail, as every number is unique). This holds a lock until the surrounding transaction
    ends, so the caller must be inside `transaction.atomic()` and save the record there."""
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', [key])


def next_number(model, field, prefix, width):
    """Next number after the highest existing `prefix + digits` value of `field`."""
    one_at_a_time(f'{model._meta.db_table}.{field}')
    pattern = re.compile(rf'^{re.escape(prefix)}(\d+)$')
    highest = 0
    for value in model.objects.filter(**{f'{field}__startswith': prefix}).values_list(field, flat=True):
        match = pattern.match(value)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"{prefix}{highest + 1:0{width}d}"


def _prefix(name):
    from . import thresholds  # the start of each number is Management's to change (Settings)
    return thresholds.value(name)


# Student codes look like HQ-260001: the prefix, the two-digit year of registration, then one running number
# across all students and all years, so the last four digits never repeat even when the year or prefix changes.
STUDENT_CODE = re.compile(r'^[A-Z]{1,6}-\d{2}(\d{4,})$')


def student_serial(code):
    match = STUDENT_CODE.match(code or '')
    return int(match.group(1)) if match else None


def student_code(prefix, year, serial):
    return f"{prefix}-{year % 100:02d}{serial:04d}"


def student_id(model, on_date):
    one_at_a_time(f'{model._meta.db_table}.student_id')
    serials = (student_serial(code) for code in model.objects.values_list('student_id', flat=True))
    return student_code(_prefix('prefix_student'), on_date.year, max((s for s in serials if s), default=0) + 1)


def invoice_number(model, on_date):
    return next_number(model, 'invoice_number', f"{_prefix('prefix_invoice')}-{on_date.year}-", 4)


def receipt_number(model, on_date):
    return next_number(model, 'receipt_number', f"{_prefix('prefix_receipt')}-{on_date.year}-", 4)


def voucher_number(model, on_date):
    # j-status.doc format PVYY-MM01: year, month, then a running number within the month
    return next_number(model, 'pv_number', f"{_prefix('prefix_voucher')}{on_date:%y}-{on_date:%m}", 2)
