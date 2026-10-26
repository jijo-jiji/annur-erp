"""QR self check-in for student attendance (Phase I).

A printed QR in each classroom opens the class running there now (#/hadir/<room>). The student types the 4-digit class
code the teacher writes on the whiteboard, taps their own name, and the first time on that phone gives the last 4 digits
of their IC; the phone is remembered for them after that. They are marked Hadir, or Lewat after the set minutes.

The teacher's private link (teachers/links.py) shows the code and the live list, marks pupils without phones and confirms
the list; staff can do the same on Kedatangan. Students not checked in are marked absent when the list is confirmed, or
when the class has ended (checked whenever the day's attendance is looked at, and by `manage.py close_checkins`).

Safeguards: the code changes every class; a phone used for a second name in the same class marks it with a flag for the
teacher; five wrong IC tries lock that student for an hour; the public calls are rate limited per address; every mark
records who made it (QR, teacher, staff, end of class) and when. Timings are settings (Settings > Had & amaran >
Kedatangan QR): open from 15 minutes before to 30 minutes after the start, late after 10 minutes."""
import hashlib
import secrets
from datetime import datetime, timedelta
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from academic.models import Classroom, ClassTimetable
from core.permissions import display_name
from core.throttles import PublicCheckInThrottle
from .models import ClassAttendanceSession, ClassCheckIn, StudentAttendance, StudentDevice

IC_TRIES = 5
LOCK_SECONDS = 3600
AUTO_BY = 'Automatik (kelas tamat)'  # closed when the class ended: students not checked in were marked absent
UNUSED_BY = 'Ditutup (tiada imbasan)'  # closed when the class ended with nobody checked in: nobody was marked


def _limits():
    from core import thresholds
    v = thresholds.values()
    return v['checkin_open_before'], v['checkin_open_after'], v['checkin_late_minutes']


def _at(on, hhmm):
    hour, minute = (int(x) for x in str(hhmm)[:5].split(':'))
    return timezone.make_aware(datetime(on.year, on.month, on.day, hour, minute))


def window(cls, on):
    """When checking in opens and closes for `cls` on `on`, when it counts as late, and when the class ends."""
    before, after, late = _limits()
    start, end = _at(on, cls.slot.start_time), _at(on, cls.slot.end_time)
    return {'opens': start - timedelta(minutes=before), 'start': start, 'late_after': start + timedelta(minutes=late),
            'closes': start + timedelta(minutes=after), 'ends': end}


def state(cls, on, now=None):
    now = now or timezone.now()
    w = window(cls, on)
    if on != timezone.localdate(now) or now > w['closes']:
        return 'CLOSED'
    return 'OPEN' if now >= w['opens'] else 'SOON'


def held_on(on):
    """The classes held on `on` (the weekly timetable, moved classes, not cancelled ones), as roster rows."""
    from teachers.payroll import roster
    return [r for r in roster(on) if not (r.get('record') and r['record'].get('status') == 'CANCELLED')]


def students_of(cls):
    """Who checks in: the class's active students (students on hold are not expected)."""
    return list(cls.students.filter(status='ACTIVE').order_by('full_name'))


def short_name(full):
    """'Ahmad Daniyal bin Razali' -> 'Ahmad D.': enough for a student to find themselves, little for anyone else."""
    words = [w for w in str(full).split() if w.lower() not in ('bin', 'binti', 'bt', 'bte', 'b.', 'a/l', 'a/p')]
    return f"{words[0]} {words[1][0]}." if len(words) > 1 else (words[0] if words else '')


def checkin_for(cls, on):
    """The class's check-in for the day, made with a new 4-digit code on first use. No two of the day's codes match."""
    found = ClassCheckIn.objects.filter(timetable_class=cls, date=on).first()
    if found:
        return found
    taken = set(ClassCheckIn.objects.filter(date=on).values_list('code', flat=True))
    for _ in range(50):
        code = f"{secrets.randbelow(10000):04d}"
        if code in taken:
            continue
        try:
            with transaction.atomic():
                return ClassCheckIn.objects.create(timetable_class=cls, date=on, code=code)
        except IntegrityError:  # opened at the same moment from another screen
            return ClassCheckIn.objects.get(timetable_class=cls, date=on)
    raise ValidationError('Tidak dapat membuat kod kelas. Cuba lagi.')


def _session(cls, on, by):
    session, _ = ClassAttendanceSession.objects.get_or_create(timetable_class=cls, date=on, defaults={'recorded_by': by})
    return session


def mark(cls, on, student, status, source, by, device_hash='', now=None, flag=''):
    """Record one student's mark. A student marked present is not changed back by a later QR scan."""
    now = now or timezone.now()
    present, late = status in ('PRESENT', 'LATE'), status == 'LATE'
    session = _session(cls, on, by)
    existing = StudentAttendance.objects.filter(session=session, student=student).first()
    if existing and source == 'QR' and existing.present:
        return existing, False
    values = {'present': present, 'late': late, 'source': source, 'marked_at': now}
    if source == 'QR':
        values.update(device_hash=device_hash, flag=flag)
    elif existing and existing.flag and source in ('TEACHER', 'STAFF'):
        values['flag'] = ''  # the teacher or staff have looked at it
    obj, _ = StudentAttendance.objects.update_or_create(session=session, student=student, defaults=values)
    return obj, True


def confirm(checkin, by, now=None):
    """Close the day's list: every active student not checked in is marked absent."""
    now = now or timezone.now()
    cls, on = checkin.timetable_class, checkin.date
    with transaction.atomic():
        session = _session(cls, on, by)
        marked = set(session.marks.values_list('student_id', flat=True))
        for student in students_of(cls):
            if student.pk not in marked:
                StudentAttendance.objects.create(session=session, student=student, present=False, late=False, source='AUTO', marked_at=now)
        checkin.confirmed_at, checkin.confirmed_by = now, by
        checkin.save(update_fields=['confirmed_at', 'confirmed_by'])
    return checkin


def close_due(now=None):
    """Confirm every open check-in whose class has ended. Returns how many were closed.
    A check-in nobody used (no student checked in, no mark at all) is closed without marking anyone absent: that class
    took its attendance some other way, or not yet, and staff should not find a whole class marked absent."""
    now = now or timezone.now()
    done = 0
    for checkin in ClassCheckIn.objects.select_related('timetable_class__slot').filter(confirmed_at=None, date__lte=timezone.localdate(now)):
        if now >= window(checkin.timetable_class, checkin.date)['ends']:
            used = StudentAttendance.objects.filter(session__timetable_class=checkin.timetable_class, session__date=checkin.date).exists()
            if used:
                confirm(checkin, AUTO_BY, now)
            else:
                checkin.confirmed_at, checkin.confirmed_by = now, UNUSED_BY
                checkin.save(update_fields=['confirmed_at', 'confirmed_by'])
            done += 1
    return done


def live_list(cls, on):
    """The class list with each student's mark today: for the teacher's link and the staff screen."""
    session = ClassAttendanceSession.objects.filter(timetable_class=cls, date=on).first()
    marks = {m.student_id: m for m in session.marks.all()} if session else {}
    rows = []
    for s in students_of(cls):
        m = marks.get(s.pk)
        status = None if m is None else ('LATE' if m.late else 'PRESENT') if m.present else 'ABSENT'
        rows.append({'student': s.pk, 'code': s.student_id, 'name': s.full_name, 'status': status,
                     'source': m.source if m else None, 'source_label': m.get_source_display() if m else None,
                     'marked_at': timezone.localtime(m.marked_at) if m and m.marked_at else None, 'flag': m.flag if m else ''})
    return rows


def class_info(cls, on, now=None):
    w = window(cls, on)
    return {'class_id': cls.pk, 'class_code': cls.class_code, 'subject': cls.subject.name if cls.subject else '',
            'form_level': cls.form_level, 'room': cls.classroom.name if cls.classroom else None,
            'start': cls.slot.start_time, 'end': cls.slot.end_time, 'state': state(cls, on, now),
            'opens': timezone.localtime(w['opens']).strftime('%H:%M'), 'closes': timezone.localtime(w['closes']).strftime('%H:%M'),
            'late_after': timezone.localtime(w['late_after']).strftime('%H:%M')}


# ---- Public: the student's phone -----------------------------------------------------------------------------------

def _device_hash(device_id, student=None):
    raw = str(device_id or '')
    if not 16 <= len(raw) <= 100:
        raise ValidationError({'device': 'Peranti tidak dikenali. Muat semula halaman.'})
    return hashlib.sha256(f"{raw}:{student.pk}".encode() if student else raw.encode()).hexdigest()


def _open_checkin(code, room=None):
    """The open check-in a class code belongs to, today."""
    code = str(code or '').strip()
    if len(code) != 4 or not code.isdigit():
        raise ValidationError({'code': 'Kod kelas ialah 4 digit di papan putih.'})
    today = timezone.localdate()
    checkin = ClassCheckIn.objects.select_related('timetable_class__slot', 'timetable_class__subject', 'timetable_class__classroom').filter(
        date=today, code=code).first()
    if checkin is None or (room is not None and checkin.timetable_class.classroom_id != room.pk):
        raise ValidationError({'code': 'Kod kelas tidak sah. Semak kod di papan putih.'})
    cls = checkin.timetable_class
    if checkin.confirmed_at or state(cls, today) != 'OPEN':
        raise ValidationError({'code': f"Imbasan untuk kelas ini dibuka {class_info(cls, today)['opens']} hingga {class_info(cls, today)['closes']}."})
    return checkin


def _room(key):
    room = Classroom.objects.filter(checkin_key=key, is_active=True).first() if key else None
    if key and room is None:
        raise NotFound('Kod QR bilik ini tidak lagi digunakan. Minta kod kelas daripada guru.')
    return room


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicCheckInThrottle])
def public_room(request, key):
    """The classes held in this room today, and which one is open for check-in now (the code itself is not shown)."""
    room = _room(key)
    today = timezone.localdate()
    held = [r for r in held_on(today) if r.get('room') == room.name]
    classes = {c.pk: c for c in ClassTimetable.objects.select_related('slot', 'subject', 'classroom').filter(pk__in=[r['class_id'] for r in held])}
    rows = sorted((class_info(classes[r['class_id']], today) for r in held if r['class_id'] in classes), key=lambda c: c['start'])
    return Response({'room': room.name, 'classes': rows})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicCheckInThrottle])
def public_code(request):
    """{code, room}: the class the code opens and its list of short names."""
    checkin = _open_checkin(request.data.get('code'), _room(request.data.get('room')))
    cls = checkin.timetable_class
    return Response({**class_info(cls, checkin.date), 'students': [{'id': s.pk, 'name': short_name(s.full_name)} for s in students_of(cls)]})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicCheckInThrottle])
def public_mark(request):
    """{code, room, student, device, ic_last4}: check in. The IC digits are needed only the first time on a phone."""
    checkin = _open_checkin(request.data.get('code'), _room(request.data.get('room')))
    cls, today = checkin.timetable_class, checkin.date
    student = next((s for s in students_of(cls) if str(s.pk) == str(request.data.get('student'))), None)
    if student is None:
        raise ValidationError({'student': 'Pilih nama anda dalam senarai.'})
    device = _device_hash(request.data.get('device'))
    remembered = _device_hash(request.data.get('device'), student)
    known = StudentDevice.objects.filter(student=student, token_hash=remembered).first()
    lock_key = f"checkin-ic:{student.pk}"
    if known is None:
        tries = cache.get(lock_key, 0)
        if tries >= IC_TRIES:
            raise ValidationError({'ic_last4': 'Terlalu banyak cubaan. Minta guru menanda kehadiran anda.'})
        ic = str(request.data.get('ic_last4') or '').strip()
        if not ic:
            return Response({'needs_ic': True, 'name': short_name(student.full_name)}, status=400)
        digits = ''.join(ch for ch in student.ic_number if ch.isdigit())
        if len(ic) != 4 or not digits.endswith(ic):
            cache.set(lock_key, tries + 1, LOCK_SECONDS)
            raise ValidationError({'ic_last4': '4 digit akhir No. K/P tidak sepadan.'})
        cache.delete(lock_key)
        known, _ = StudentDevice.objects.get_or_create(token_hash=remembered, defaults={'student': student})
    known.last_used_at = timezone.now()
    known.save(update_fields=['last_used_at'])

    now = timezone.now()
    session = ClassAttendanceSession.objects.filter(timetable_class=cls, date=today).first()
    other = session and session.marks.filter(device_hash=device, source='QR').exclude(student=student).select_related('student').first()
    flag = f"Telefon yang sama dengan {short_name(other.student.full_name)}" if other else ''
    status = 'LATE' if now > window(cls, today)['late_after'] else 'PRESENT'
    obj, changed = mark(cls, today, student, status, 'QR', 'Kedatangan QR', device_hash=device, now=now, flag=flag)
    return Response({'name': short_name(student.full_name), 'status': ('LATE' if obj.late else 'PRESENT') if obj.present else 'ABSENT',
                     'already': not changed, 'class': class_info(cls, today), 'time': timezone.localtime(obj.marked_at or now).strftime('%H:%M')})


# ---- Staff: Kedatangan ---------------------------------------------------------------------------------------------

@api_view(['GET', 'POST'])
def staff_checkin(request):
    """GET ?class_id=&date=: the class's check-in (code, timing, live list). POST {class_id, action: open | confirm}."""
    from .views import get_class, get_date
    source = request.query_params if request.method == 'GET' else request.data
    cls = get_class(source.get('class_id'))
    on = get_date(source.get('date'), 'date', timezone.localdate())
    close_due()
    checkin = ClassCheckIn.objects.filter(timetable_class=cls, date=on).first()
    if request.method == 'POST':
        if on != timezone.localdate():
            raise ValidationError('Kod kelas hanya untuk hari ini.')
        checkin = checkin or checkin_for(cls, on)
        if request.data.get('action') == 'confirm' and not checkin.confirmed_at:
            confirm(checkin, display_name(request.user))
    return Response(checkin_data(cls, on, checkin))


def closed_note(checkin):
    """How the day's list was closed, as a sentence for the teacher's and staff screens."""
    if not checkin or not checkin.confirmed_at:
        return ''
    at = timezone.localtime(checkin.confirmed_at).strftime('%H:%M')
    if checkin.confirmed_by == AUTO_BY:
        return f"Senarai ditutup apabila kelas tamat ({at}). Pelajar yang tidak mengimbas ditanda tidak hadir."
    if checkin.confirmed_by == UNUSED_BY:
        return f"Imbasan ditutup apabila kelas tamat ({at}). Tiada pelajar mengimbas, jadi tiada yang ditanda tidak hadir."
    return f"Senarai disahkan oleh {checkin.confirmed_by} pada {at}."


def checkin_data(cls, on, checkin):
    return {**class_info(cls, on), 'date': on, 'code': checkin.code if checkin else None,
            'confirmed_at': timezone.localtime(checkin.confirmed_at) if checkin and checkin.confirmed_at else None,
            'confirmed_by': checkin.confirmed_by if checkin else '', 'closed_note': closed_note(checkin), 'students': live_list(cls, on)}


def room_key(room, renew=False):
    """The key behind a room's printed QR, made the first time it is needed; renewing stops the old QR."""
    if room.checkin_key and not renew:
        return room.checkin_key
    room.checkin_key = secrets.token_urlsafe(12)
    room.save(update_fields=['checkin_key'])
    return room.checkin_key
