"""Invoicing: the monthly run, discounts, student credit, overdue status, and recording or cancelling a payment."""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from business_config.models import BusinessSetting
from core import numbering
from .models import Discount, Invoice, PaymentReceipt

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


# ---- Payments ------------------------------------------------------------------------------------------------------

RECEIPT_FIELDS = ('payment_date', 'amount_paid', 'payment_method', 'reference_number', 'payment_type', 'payment_month', 'notes')


@transaction.atomic
def record_payment(invoice, values, received_by, replaces=None):
    """Issue a receipt for a payment on `invoice` and take it off the balance. Anything above the balance is kept as
    credit for the student (overpayment). `values` holds the RECEIPT_FIELDS; `replaces` is the cancelled receipt a
    correction replaces."""
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    student = type(invoice.student).objects.select_for_update().get(pk=invoice.student_id)
    payment_date = values.get('payment_date') or date.today()
    amount = Decimal(values['amount_paid'])
    overpaid = max(Decimal('0'), amount - invoice.balance_due)
    receipt = PaymentReceipt.objects.create(
        invoice=invoice, student=student, payment_date=payment_date, amount_paid=amount,
        payment_method=values.get('payment_method') or 'DUITNOW_QR', reference_number=values.get('reference_number') or '',
        payment_type=values.get('payment_type') or 'MONTHLY', payment_month=values.get('payment_month'),
        notes=values.get('notes') or '', overpaid_amount=overpaid, received_by=received_by, replaces=replaces,
        receipt_number=numbering.receipt_number(PaymentReceipt, payment_date),
    )
    invoice.total_paid += amount - overpaid
    invoice.balance_due = max(Decimal('0'), invoice.total_payable - invoice.total_paid)
    settle_status(invoice)
    invoice.save()
    if overpaid:
        student.credit_balance += overpaid
        student.save(update_fields=['credit_balance'])
    return receipt


def cancel_problem(receipt):
    """Why `receipt` cannot be cancelled now, or None."""
    if receipt.status != 'VALID':
        return 'Resit ini sudah dibatalkan.'
    if receipt.overpaid_amount > receipt.student.credit_balance:
        return (f"Lebihan {receipt.overpaid_amount:.2f} daripada resit ini sudah digunakan sebagai kredit pada invois lain, "
                f"jadi resit ini tidak boleh dibatalkan.")
    return None


@transaction.atomic
def cancel_receipt(receipt, reason, by_name):
    """Cancel a receipt: its amount comes off the invoice again and its overpayment off the student's credit. The receipt
    stays (struck through) with the reason, so its number is never reused and the history stays complete."""
    receipt = PaymentReceipt.objects.select_for_update().select_related('student').get(pk=receipt.pk)
    problem = cancel_problem(receipt)
    if problem:
        raise ValidationError(problem)
    invoice = Invoice.objects.select_for_update().get(pk=receipt.invoice_id)
    student = type(receipt.student).objects.select_for_update().get(pk=receipt.student_id)
    invoice.total_paid -= receipt.amount_paid - receipt.overpaid_amount
    invoice.balance_due = max(Decimal('0'), invoice.total_payable - invoice.total_paid)
    settle_status(invoice)
    invoice.save()
    if receipt.overpaid_amount:
        student.credit_balance -= receipt.overpaid_amount
        student.save(update_fields=['credit_balance'])
    receipt.status, receipt.cancel_reason, receipt.cancelled_by, receipt.cancelled_at = 'CANCELLED', reason, by_name, timezone.now()
    receipt.save(update_fields=['status', 'cancel_reason', 'cancelled_by', 'cancelled_at'])
    return receipt


def invoice_edit_problem(invoice):
    """An invoice's amounts may change only while nothing has been paid or credited against it."""
    if invoice.total_paid > 0 or invoice.credit_applied > 0 or invoice.payments.filter(status='VALID').exists():
        return 'Invois yang sudah ada bayaran atau kredit tidak boleh diubah. Batalkan resitnya dahulu.'
    return None


@transaction.atomic
def edit_invoice(invoice, values):
    """Change an unpaid invoice's fee, registration fee or description. A discount from a code follows the new fee
    (a percentage is worked out again); the total and balance are worked out again."""
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    problem = invoice_edit_problem(invoice)
    if problem:
        raise ValidationError(problem)
    for field in ('monthly_fee', 'registration_fee', 'description'):
        if field in values:
            setattr(invoice, field, values[field])
    invoice.monthly_fee, invoice.registration_fee = Decimal(invoice.monthly_fee), Decimal(invoice.registration_fee)
    if invoice.discount_id:
        invoice.discount_amount = discount_amount(invoice.discount, invoice.monthly_fee)
    invoice.discount_amount = min(Decimal(invoice.discount_amount), invoice.monthly_fee)
    invoice.total_payable = invoice.registration_fee + invoice.monthly_fee - invoice.discount_amount
    invoice.balance_due = invoice.total_payable - invoice.total_paid
    settle_status(invoice)
    invoice.save()
    return invoice
