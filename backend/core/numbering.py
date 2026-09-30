"""Sequential document numbers that restart per period (e.g. REC-2026-0001, PV26-0901)."""
import re


def next_number(model, field, prefix, width):
    """Next number after the highest existing `prefix + digits` value of `field`."""
    pattern = re.compile(rf'^{re.escape(prefix)}(\d+)$')
    highest = 0
    for value in model.objects.filter(**{f'{field}__startswith': prefix}).values_list(field, flat=True):
        match = pattern.match(value)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"{prefix}{highest + 1:0{width}d}"


def student_id(model, on_date):
    return next_number(model, 'student_id', f"AN-{on_date.year}-", 3)


def invoice_number(model, on_date):
    return next_number(model, 'invoice_number', f"INV-{on_date.year}-", 4)


def receipt_number(model, on_date):
    return next_number(model, 'receipt_number', f"REC-{on_date.year}-", 4)


def voucher_number(model, on_date):
    # j-status.doc format PVYY-MM01: year, month, then a running number within the month
    return next_number(model, 'pv_number', f"PV{on_date:%y}-{on_date:%m}", 2)
