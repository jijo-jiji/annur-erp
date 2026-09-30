"""Lead funnel actions and figures. Every change writes a LeadActivity entry."""
from collections import Counter
from datetime import date, timedelta
from rest_framework.exceptions import ValidationError
from .models import Lead, LeadActivity

FOLLOW_UP_DAYS = 7
STAGE_LABELS = dict(Lead.STATUS_CHOICES)
# REGISTERED comes from converting the lead to a student, ACTIVE from the Supervisor's approval
MOVABLE_STAGES = Lead.STAGE_ORDER[:Lead.STAGE_ORDER.index('REGISTERED')]


def log_activity(lead, by, action, remark='', outcome='DONE', on=None, next_follow_up=None, from_stage=''):
    on = on or date.today()
    if lead.status in Lead.CLOSED_STAGES:
        follow_up = None
    else:
        follow_up = next_follow_up or on + timedelta(days=FOLLOW_UP_DAYS)
    entry = LeadActivity.objects.create(
        lead=lead, activity_date=on, stage=lead.status, from_stage=from_stage,
        action=action, remark=remark, pic=by, outcome=outcome, next_follow_up=follow_up,
    )
    lead.next_follow_up = follow_up
    lead.save(update_fields=['next_follow_up', 'updated_at'])
    return entry


def _set_stage(lead, stage, on):
    previous = lead.status
    lead.status = stage
    lead.stage_changed_at = on
    lead.save(update_fields=['status', 'stage_changed_at', 'lost_at_stage', 'lost_reason', 'converted_student', 'updated_at'])
    return previous


def move(lead, stage, by, remark='', on=None, next_follow_up=None):
    if stage not in MOVABLE_STAGES:
        raise ValidationError({'stage': 'Peringkat tidak sah. Registered dan Active ditetapkan melalui pendaftaran pelajar.'})
    if lead.status in ('REGISTERED', 'ACTIVE'):
        raise ValidationError({'stage': 'Lead ini sudah didaftarkan sebagai pelajar.'})
    if stage == lead.status:
        raise ValidationError({'stage': 'Lead sudah berada di peringkat ini.'})
    on = on or date.today()
    action = 'Dibuka semula' if lead.status == 'LOST' else 'Tukar peringkat'
    lead.lost_at_stage = ''
    lead.lost_reason = ''
    previous = _set_stage(lead, stage, on)
    return log_activity(lead, by, f"{action}: {STAGE_LABELS[previous]} → {STAGE_LABELS[stage]}",
                        remark, on=on, next_follow_up=next_follow_up, from_stage=previous)


def mark_lost(lead, by, reason, on=None):
    if not reason:
        raise ValidationError({'reason': 'Sila nyatakan sebab lead tidak berminat.'})
    if lead.status in Lead.CLOSED_STAGES:
        raise ValidationError({'detail': 'Lead ini sudah ditutup.'})
    on = on or date.today()
    lead.lost_at_stage = lead.status
    lead.lost_reason = reason
    previous = _set_stage(lead, 'LOST', on)
    return log_activity(lead, by, 'Tidak berminat', reason, on=on, from_stage=previous)


def mark_registered(lead, student, by, on=None):
    on = on or date.today()
    lead.converted_student = student
    previous = _set_stage(lead, 'REGISTERED', on)
    log_activity(lead, by, f"Didaftarkan sebagai pelajar {student.student_id}", on=on, from_stage=previous)


def registration_decided(student, by, approved, comment=''):
    """Keep the lead in step with the Supervisor's decision on its registration."""
    for lead in Lead.objects.filter(converted_student=student, status='REGISTERED'):
        if approved:
            _set_stage(lead, 'ACTIVE', date.today())
            log_activity(lead, by, 'Pendaftaran diluluskan', comment, from_stage='REGISTERED')
        else:
            # Back to Waiting Payment so staff follow up again; the lead can be converted again
            lead.converted_student = None
            _set_stage(lead, 'WAITING_PAYMENT', date.today())
            log_activity(lead, by, 'Pendaftaran ditolak', comment, outcome='WAITING_REPLY', from_stage='REGISTERED')


def stats(leads, today=None):
    today = today or date.today()
    leads = list(leads)
    order = Lead.STAGE_ORDER
    reached_index = [order.index(l.reached_stage) if l.reached_stage in order else 0 for l in leads]

    funnel = []
    previous = None
    for i, code in enumerate(order):
        reached = sum(1 for r in reached_index if r >= i)
        funnel.append({
            'stage': code,
            'label': STAGE_LABELS[code],
            'current': sum(1 for l in leads if l.status == code),
            'reached': reached,
            'rate_from_previous': round(reached / previous * 100, 1) if previous else None,
        })
        previous = reached

    total = len(leads)
    registered = funnel[order.index('REGISTERED')]['reached']
    return {
        'total': total,
        'open': sum(1 for l in leads if l.status not in Lead.CLOSED_STAGES),
        'lost': sum(1 for l in leads if l.status == 'LOST'),
        'registered': registered,
        'conversion_pct': round(registered / total * 100, 1) if total else None,
        'follow_ups_due': sum(1 for l in leads if l.next_follow_up and l.next_follow_up <= today
                              and l.status not in Lead.CLOSED_STAGES),
        'funnel': funnel,
        'by_source': [{'source': k, 'count': v} for k, v in Counter(l.lead_source for l in leads).most_common()],
        'by_campaign': [{'campaign': k or 'Tiada kempen', 'count': v}
                        for k, v in Counter(l.campaign for l in leads).most_common()],
        'lost_reasons': [{'reason': k, 'count': v}
                         for k, v in Counter(l.lost_reason for l in leads if l.status == 'LOST').most_common()],
    }
