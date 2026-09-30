"""Invoicing: the monthly run, discounts, student credit and overdue status."""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import F
from rest_framework.exceptions import ValidationError
from business_config.models import BusinessSetting
from core import numbering
from .models import Discount, Invoice

OPEN_STATUSES = ('UNPAID', 'PARTIAL', 'OVERDUE')
CENT = Decimal('0.01')


def setting(key, default):
    row = BusinessSetting.objects.filter(key=key).first()
    return row.value if row else default


def due_date_for(month, on):
    """The monthly due day of `month`; an invoice raised after that day gets 7 days to pay."""
    due = month.replace(day=min(int(setting('MONTHLY_DUE_DAY', 7)), 28))
    return due if due >= on else on + timedelta(days=7)


def mark_overdue(today=None):
    today = today or date.today()
    return Invoice.objects.filter(status__in=('UNPAID', 'PARTIAL'), due_date__lt=today, balance_due__gt=0).update(status='OVERDUE')


def settle_status(invoice, today=None):
    today = today or date.today()
    if invoice.balance_due <= 0:
        invoice.status = 'PAID'
    elif invoice.due_date < today:
        invoice.status = 'OVERDUE'
    else:
        invoice.status = 'PARTIAL' if invoice.total_paid > 0 else 'UNPAID'


def discount_problem(discount, on):
    """Why a discount cannot be used on `on`, or None."""
    if not discount.is_active:
        return 'Diskaun ini tidak aktif.'
    if discount.valid_from and on < discount.valid_from:
        return f"Diskaun ini sah mulai {discount.valid_from:%d/%m/%Y}."
    if discount.valid_until and on > discount.valid_until:
        return f"Diskaun ini tamat pada {discount.valid_until:%d/%m/%Y}."
    if discount.max_uses is not None and discount.used_count >= discount.max_uses:
        return 'Had penggunaan kod ini telah dicapai.'
    return None


def discount_amount(discount, fee):
    """Discounts apply to the monthly fee only, never the registration fee, and never below zero."""
    fee = Decimal(fee)
    if discount.mode == 'PERCENT':
        amount = (fee * Decimal(discount.value) / 100).quantize(CENT, ROUND_HALF_UP)
    else:
        amount = Decimal(discount.value)
    return min(amount, fee)


def _record_use(discount):
    Discount.objects.filter(pk=discount.pk).update(used_count=F('used_count') + 1)


@transaction.atomic
def apply_discount(invoice, code, on=None):
    on = on or date.today()
    discount = Discount.objects.select_for_update().filter(code__iexact=(code or '').strip()).first()
    if not discount:
        raise ValidationError({'code': 'Kod diskaun tidak dijumpai.'})
    problem = discount_problem(discount, on)
    if problem:
        raise ValidationError({'code': problem})
    if invoice.discount_id or invoice.discount_amount > 0:
        raise ValidationError({'code': 'Invois ini sudah mempunyai diskaun.'})
    if invoice.status == 'PAID':
        raise ValidationError({'code': 'Invois ini sudah dibayar.'})
    amount = min(discount_amount(discount, invoice.monthly_fee), invoice.balance_due)
    if amount <= 0:
        raise ValidationError({'code': 'Tiada yuran bulanan untuk didiskaun pada invois ini.'})
    invoice.discount = discount
    invoice.discount_amount = amount
    invoice.discount_remarks = f"{discount.name} ({discount.code})"
    invoice.total_payable -= amount
    invoice.balance_due -= amount
    settle_status(invoice, on)
    invoice.save()
    _record_use(discount)
    return invoice


@transaction.atomic
def apply_credit(invoice, on=None):
    """Use the student's stored credit (from earlier overpayments) against this invoice."""
    student = type(invoice.student).objects.select_for_update().get(pk=invoice.student_id)
    use = min(student.credit_balance, invoice.balance_due)
    if use <= 0:
        raise ValidationError({'detail': 'Tiada kredit atau baki untuk ditolak.'})
    student.credit_balance -= use
    student.save(update_fields=['credit_balance'])
    invoice.credit_applied += use
    invoice.total_paid += use
    invoice.balance_due -= use
    settle_status(invoice, on)
    invoice.save()
    return invoice


def month_start(value):
    if isinstance(value, date):
        return value.replace(day=1)
    try:
        year, month = str(value)[:7].split('-')
        return date(int(year), int(month), 1)
    except (TypeError, ValueError):
        raise ValidationError({'month': 'Bulan tidak sah (format YYYY-MM).'})


def monthly_run(month, dry_run=True, on=None):
    """Raise the month's invoice for every active monthly student who does not have one yet.

    Each row says what happened (or would happen) to one student, so the counter staff
    can check the list before confirming."""
    from students.models import Student
    from students.services import monthly_fee

    month = month_start(month)
    on = on or date.today()
    rows = []
    students = (Student.objects.filter(student_type='MONTHLY', status__in=('ACTIVE', 'ON_HOLD'))
                .select_related('standing_discount').prefetch_related('enrolled_classes').order_by('form_level', 'full_name'))
    already = set(Invoice.objects.filter(billing_month=month).exclude(invoice_type='OTHER').values_list('student_id', flat=True))

    for student in students:
        row = {'student_id': student.id, 'student_code': student.student_id, 'name': student.full_name,
               'form_level': student.form_level, 'subjects': student.enrolled_classes.count()}
        if student.status == 'ON_HOLD':
            rows.append({**row, 'result': 'SKIPPED', 'reason': 'Ditangguhkan'})
            continue
        if student.id in already:
            rows.append({**row, 'result': 'SKIPPED', 'reason': 'Invois bulan ini sudah ada'})
            continue
        fee = monthly_fee(student)
        if fee <= 0:
            rows.append({**row, 'result': 'SKIPPED', 'reason': 'Tiada kelas / yuran'})
            continue

        discount = student.standing_discount
        discount_note = ''
        if discount and discount_problem(discount, month):
            discount_note = f"{discount.name}: {discount_problem(discount, month)}"
            discount = None
        disc = discount_amount(discount, fee) if discount else Decimal('0')
        total = fee - disc
        credit = min(student.credit_balance, total)
        row.update({
            'monthly_fee': fee, 'discount': disc, 'discount_name': discount.name if discount else '',
            'discount_note': discount_note, 'credit': credit, 'total': total, 'balance': total - credit,
        })
        if dry_run:
            rows.append({**row, 'result': 'READY'})
            continue

        with transaction.atomic():
            invoice = Invoice.objects.create(
                invoice_number=numbering.invoice_number(Invoice, on),
                student=student, invoice_type='MONTHLY', billing_month=month,
                registration_fee=0, monthly_fee=fee,
                discount=discount, discount_amount=disc,
                discount_remarks=(f"{discount.name} ({discount.code})" if discount
                                  else student.special_fee_note if student.special_monthly_fee is not None else ''),
                total_payable=total, total_paid=0, balance_due=total, status='UNPAID',
                due_date=due_date_for(month, on),
            )
            if discount:
                _record_use(discount)
            if credit > 0:
                apply_credit(invoice, on)
        rows.append({**row, 'result': 'CREATED', 'invoice_number': invoice.invoice_number})

    return {
        'month': month,
        'dry_run': dry_run,
        'ready': sum(1 for r in rows if r['result'] == 'READY'),
        'created': sum(1 for r in rows if r['result'] == 'CREATED'),
        'skipped': sum(1 for r in rows if r['result'] == 'SKIPPED'),
        'total_billed': sum((r.get('total', 0) for r in rows if r['result'] in ('READY', 'CREATED')), Decimal('0')),
        'rows': rows,
    }


def follow_up_week(invoice, today=None):
    """Week of the billing month (2-5) used for the w2-w5 payment follow-up; None once the month has passed."""
    today = today or date.today()
    if invoice.billing_month.year != today.year or invoice.billing_month.month != today.month:
        return None
    return min(5, (today.day - 1) // 7 + 1)
