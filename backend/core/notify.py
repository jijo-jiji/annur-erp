"""Notifications (Phase E): the bell beside each person's name.

Each workflow calls one function here when something starts waiting for someone, or when something a person asked
for is decided. This file is the one place that says who hears about what:

| Event | Who is told |
|---|---|
| A change request waits (subject, vendor, teacher, fees, slots, receipt, invoice, ...) | whoever may decide that kind |
| A change request is decided | the person who asked (unless they decided it themselves) |
| A registration waits (counter form, parent's QR form, sent again) | Supervisor and Management |
| A registration is approved or rejected | Admin (the counter) |
| A payment voucher waits | the approvers of its tier |
| A payment voucher is approved or rejected | the person who prepared it |
| A leave application waits / is decided | approvers / the applicant |
| An extra or cancelled class waits / needs verifying | Supervisor / Management |
| A master timetable change, a rate increase, teacher pay to approve | Management |
| Teacher pay verified, approved or rejected | the next person in the order |
| The counter is closed / returned or verified | approvers (not the closer) / the closer |
| A parent sends results on the public form | Admin and Supervisor |
| Week 5 unpaid fees become tasks | Supervisor (Management when there is none) |
| A teacher's report about a student is recorded | Supervisor and Management (not whoever recorded it) |
| A complaint about a teacher is recorded (from a parent, student or staff) | Supervisor and Management (not the recorder) |

A notification is saved in the same transaction as the action, so an action that fails leaves no notice behind; a
notice that cannot be saved never stops the action (it is logged instead)."""
import logging
from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from .models import Notification
from .permissions import ADMIN, APPROVER_ROLES, MANAGEMENT, SUPERVISOR, get_role

log = logging.getLogger(__name__)


def users_with(roles, exclude=None):
    """Active login accounts whose role is one of `roles`."""
    skip = getattr(exclude, 'pk', exclude)
    return [u for u in User.objects.filter(is_active=True) if u.pk != skip and get_role(u) in roles]


def send(users, title, body='', link='', kind='', key=''):
    """Put a notice in each person's bell. With `key`, a person gets that notice once however often it is sent."""
    for user in {u.pk: u for u in users if u is not None and u.is_active}.values():
        try:
            with transaction.atomic():  # a savepoint: a failure here never breaks the action that sent it
                values = {'kind': kind, 'title': title[:200], 'body': body[:300], 'link': link[:200]}
                if key:
                    Notification.objects.get_or_create(user=user, key=key[:120], defaults=values)
                else:
                    Notification.objects.create(user=user, **values)
        except Exception:  # noqa: BLE001 - a notice is never worth failing the action for
            if getattr(settings, 'NOTIFY_STRICT', False):
                raise
            log.exception('Notification for %s not saved: %s', user, title)


def _user(user_id):
    return User.objects.filter(pk=user_id, is_active=True).first() if user_id else None


# ---- Change requests ----------------------------------------------------------------------------------------------

def change_request_submitted(req):
    from .change_requests import action_label, handler_for
    if req.status != 'PENDING':
        return
    handler = handler_for(req.kind)
    send(users_with(handler.approvers, exclude=req.requested_by_id),
         f"{action_label(req)} {req.get_kind_display().lower()}: {req.target_label}",
         f"Dimohon oleh {req.requested_by_name}" + (f": {req.note}" if req.note else ''),
         handler.link, 'change_request', f"cr:{req.pk}:pending")


def change_request_decided(req, decided_by):
    from .change_requests import action_label, handler_for
    if not req.requested_by_id or req.requested_by_id == getattr(decided_by, 'pk', None):
        return
    word = 'diluluskan' if req.status == 'APPROVED' else 'ditolak'
    send([_user(req.requested_by_id)], f"Permohonan {word}: {action_label(req).lower()} {req.get_kind_display().lower()} {req.target_label}",
         f"Oleh {req.decided_by}" + (f": {req.decision_comment}" if req.decision_comment else ''),
         handler_for(req.kind).link, 'change_request', f"cr:{req.pk}:decided")


# ---- Registrations ------------------------------------------------------------------------------------------------

def registration_waiting(student, by, again=False):
    send(users_with(APPROVER_ROLES), f"{'Pendaftaran dihantar semula' if again else 'Pendaftaran baharu'}: {student.full_name}",
         f"{student.student_id} · oleh {by}. Menunggu kelulusan.", '#/students?tab=approvals', 'registration',
         '' if again else f"reg:{student.pk}:new")  # each resubmission is news; the first registration only once


def registration_decided(student, approved, decided_by):
    send(users_with((ADMIN,), exclude=decided_by),
         f"Pendaftaran {'diluluskan' if approved else 'ditolak'}: {student.full_name}",
         f"{student.student_id}" + ('' if approved else f" · sebab: {student.registration_comment}"),
         f"#/students/{student.student_id}", 'registration')


# ---- Vouchers -----------------------------------------------------------------------------------------------------

def voucher_waiting(pv):
    from expenses.views import TIER_APPROVERS
    roles = TIER_APPROVERS.get(pv.tier_level, ())
    if not pv.status.startswith('PENDING'):
        return
    send(users_with(roles, exclude=pv.prepared_by_user_id), f"Baucar {pv.pv_number} RM {pv.amount:,.2f} menunggu kelulusan",
         f"{pv.items_description[:120]} · disediakan oleh {pv.prepared_by}", '#/vouchers?tab=pending', 'voucher',
         f"pv:{pv.pk}:{pv.status}:{pv.amount}")


def voucher_decided(pv, decided_by):
    if pv.prepared_by_user_id == getattr(decided_by, 'pk', None):
        return
    word = 'ditolak' if pv.status == 'REJECTED' else 'diluluskan'
    send([_user(pv.prepared_by_user_id)], f"Baucar {pv.pv_number} {word}",
         f"Oleh {pv.approved_by}" + (f": {pv.approval_comment}" if pv.approval_comment else ''), '#/vouchers', 'voucher')


# ---- Staff leave --------------------------------------------------------------------------------------------------

def leave_waiting(leave):
    own = leave.staff.user_id
    # nobody approves their own leave except Management, so an approver's own application goes to Management
    roles = (MANAGEMENT,) if own and get_role(_user(own)) in APPROVER_ROLES else APPROVER_ROLES
    send(users_with(roles, exclude=own), f"Permohonan cuti {leave.staff.name}",
         f"{leave.get_leave_type_display()} · {leave.start_date:%d/%m/%Y} hingga {leave.end_date:%d/%m/%Y} ({leave.days_count} hari)",
         '#/staff?tab=leave', 'leave', f"leave:{leave.pk}:pending")


def leave_decided(leave):
    send([_user(leave.staff.user_id)], f"Permohonan cuti {leave.leave_id} {'diluluskan' if leave.status == 'APPROVED' else 'ditolak'}",
         leave.supervisor_remark, '#/staff?tab=leave', 'leave', f"leave:{leave.pk}:decided")


# ---- Classes and timetable ----------------------------------------------------------------------------------------

def reschedule_waiting(entry):
    if entry.status == 'PENDING':
        send(users_with((SUPERVISOR,)) or users_with((MANAGEMENT,)), f"Rekod batal / ganti kelas menunggu kelulusan: {entry.timetable_class.class_code}",
             f"Direkod oleh {entry.recorded_by}", '#/reschedules?tab=pending', 'reschedule', f"rs:{entry.pk}:pending")
    if entry.status == 'APPROVED' and not entry.verified_by:
        send(users_with((MANAGEMENT,)), f"Kelas ganti / tambahan perlu disahkan: {entry.timetable_class.class_code}",
             f"Diluluskan oleh {entry.decided_by}", '#/reschedules?tab=unverified', 'reschedule', f"rs:{entry.pk}:verify")


def timetable_change_waiting(change):
    send(users_with((MANAGEMENT,)), f"Perubahan jadual induk menunggu kelulusan: {change.class_label or 'kelas baharu'}",
         f"{change.summary} · oleh {change.requested_by}", '#/timetable', 'timetable', f"tt:{change.pk}:pending")


def rate_increment_waiting(inc):
    send(users_with((MANAGEMENT,)), f"Cadangan kenaikan kadar {inc.teacher.full_name}",
         f"RM {inc.previous_rate:,.2f} → RM {inc.proposed_rate:,.2f} · oleh {inc.proposed_by}", '#/teachers', 'teacher_pay', f"inc:{inc.pk}:pending")


def payroll_step(payment):
    """Teacher pay moves Supervisor (verify) → Management (approve) → recorded as paid; a rejection goes back."""
    month = f"{payment.month:%m/%Y}"
    who = {
        'VERIFIED': ((MANAGEMENT,), 'menunggu kelulusan anda'),
        'APPROVED': (APPROVER_ROLES, 'diluluskan, rekod bayaran apabila dibayar'),
        'REJECTED': ((SUPERVISOR,), 'ditolak oleh Pengurusan, semak semula'),
    }.get(payment.status)
    if who:
        send(users_with(who[0]), f"Elaun {payment.teacher.full_name} {month} {who[1]}", payment.decision_comment or '',
             '#/payroll', 'teacher_pay')


# ---- Counter, public forms, fees ------------------------------------------------------------------------------------

def cash_close_closed(close, closer):
    send(users_with(APPROVER_ROLES, exclude=closer), f"Tutup kaunter {close.date:%d/%m/%Y} menunggu semakan",
         f"Oleh {close.closed_by} · tunai dikira RM {close.cash_counted:,.2f}, beza RM {close.difference:,.2f}",
         f"#/counter?date={close.date}", 'cash_close', f"cc:{close.pk}:{close.closed_at:%Y%m%d%H%M%S}")


def cash_close_decided(close):
    word = 'disahkan' if close.status == 'VERIFIED' else 'dikembalikan untuk dikira semula'
    send([_user(close.closed_by_user_id)], f"Tutup kaunter {close.date:%d/%m/%Y} {word}",
         f"Oleh {close.verified_by}" + (f": {close.verify_note}" if close.verify_note else ''),
         f"#/counter?date={close.date}", 'cash_close')


def result_submission(sub):
    # a parent sending again before review replaces the same submission: one notice for it is enough
    send(users_with((ADMIN, SUPERVISOR)), f"Keputusan dari borang ibu bapa: {sub.student.full_name}",
         f"{sub.get_term_display()} {sub.year} · {sub.submitted_by} · menunggu semakan", '#/results?tab=review', 'results', f"rsub:{sub.pk}")


def week5_tasks(count, today):
    if count:
        send(users_with((SUPERVISOR,)) or users_with((MANAGEMENT,)), f"{count} yuran perlu dihubungi (minggu 5)",
             'Yuran bulanan yang masih belum dibayar selepas peringatan minggu 2 hingga 4.', '#/billing?tab=arrears', 'followup',
             f"week5:{today.isoformat()}")


# ---- Two-way reports (Phase H) --------------------------------------------------------------------------------------

def student_report_added(report, by):
    send(users_with(APPROVER_ROLES, exclude=by), f"Laporan guru: {report.student.full_name}",
         f"{report.get_category_display()}{f' · {report.teacher.titled}' if report.teacher else ''} · {report.details[:120]}",
         f"#/students/{report.student.student_id}?tab=reports", 'report')


def teacher_complaint_added(complaint, by):
    send(users_with(APPROVER_ROLES, exclude=by), f"Aduan tentang {complaint.teacher.titled}",
         f"{complaint.get_complainant_type_display()}: {complaint.complained_by} · {complaint.description[:120]}",
         '#/teachers?tab=complaints', 'complaint')

