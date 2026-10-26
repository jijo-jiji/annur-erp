"""Handouts belong to a real class (Phase G).

A handout is recorded for one class and the date of the class it is handed out in. The copies needed start from the
class's active students. Who has a copy comes from that class's attendance: a student present that day got it in class;
anyone else is still waiting until a copy is given to them later (at the counter or in a later class), which staff record
as a HandoutReceipt. Without a class date (older records), the class's latest attendance on or before today is used.

The same answers show on the handout list (a tally), on the handout's received list, on a student's profile (the
handouts of their classes they still need) and on the office's daily checklist (tomorrow's handouts not yet printed)."""
from datetime import date, timedelta
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from students.models import ClassAttendanceSession, Student
from .models import HandoutReceipt, LessonHandout


def class_students(cls):
    """The students who need a copy: the class's active students (those on hold are not attending)."""
    return list(cls.students.filter(status='ACTIVE').order_by('full_name')) if cls else []


def attendance_for(handout):
    """The attendance that decides who got the handout in class, or None while there is none."""
    if handout.timetable_class_id is None:
        return None
    sessions = ClassAttendanceSession.objects.filter(timetable_class_id=handout.timetable_class_id)
    if handout.class_date:
        return sessions.filter(date=handout.class_date).first()
    return sessions.filter(date__lte=date.today()).order_by('-date').first()


def _why_waiting(handout, session, mark):
    if mark is not None:
        return 'Tidak hadir'
    if session is not None:
        return 'Kedatangan belum direkod'
    if handout.class_date and handout.class_date > date.today():
        return 'Kelas belum berlangsung'
    return 'Kedatangan belum diambil'


def recipients(handout):
    """Every student of the class: IN_CLASS (present that day), GIVEN (a copy given later), WAITING (absent, or not
    marked, and no copy yet) or PENDING (the class has not been held or its attendance not taken yet), with why."""
    session = attendance_for(handout)
    marks = {m.student_id: m for m in session.marks.all()} if session else {}
    given = {r.student_id: r for r in handout.receipts.all()}
    rows = []
    for s in class_students(handout.timetable_class):
        mark, receipt = marks.get(s.pk), given.get(s.pk)
        if mark is not None and mark.present:
            state, why = 'IN_CLASS', ''
        elif receipt is not None:
            state, why = 'GIVEN', ''
        else:
            state, why = 'WAITING' if session is not None else 'PENDING', _why_waiting(handout, session, mark)
        rows.append({'student': s.pk, 'code': s.student_id, 'name': s.full_name, 'state': state, 'why': why,
                     # local time: the screens show the date part as it is
                     'given_at': timezone.localtime(receipt.given_at) if receipt else None, 'given_by': receipt.given_by if receipt else ''})
    return {'session_date': session.date if session else None, 'students': rows}


def tally(handout):
    """How many of the class's students have a copy, how many missed it and still need one, and how many are not known
    yet (no attendance for that class yet), for the handout list."""
    if handout.timetable_class_id is None:
        return None
    rows = recipients(handout)['students']
    count = lambda state: sum(1 for r in rows if r['state'] == state)
    return {'students': len(rows), 'received': count('IN_CLASS') + count('GIVEN'), 'waiting': count('WAITING'), 'pending': count('PENDING')}


def give(handout, student_id, given, by):
    """Record (or take back) a copy given to a student of the class outside the class it was handed out in."""
    student = next((s for s in class_students(handout.timetable_class) if str(s.pk) == str(student_id)), None)
    if student is None:
        raise ValidationError({'student': 'Pelajar ini tiada dalam kelas handout ini.'})
    if given:
        HandoutReceipt.objects.get_or_create(handout=handout, student=student, defaults={'given_by': by})
    else:
        HandoutReceipt.objects.filter(handout=handout, student=student).delete()
    return recipients(handout)


def for_student(student):
    """The handouts of a student's classes, newest first, each with whether this student has a copy."""
    if not isinstance(student, Student):
        student = Student.objects.get(pk=student)
    out = []
    handouts = LessonHandout.objects.select_related('timetable_class__subject').filter(
        timetable_class__in=student.enrolled_classes.all()).exclude(status='ARCHIVED').order_by('-class_date', '-upload_date')
    for h in handouts:
        row = next((r for r in recipients(h)['students'] if r['student'] == student.pk), None)
        if row is None:
            continue  # not an active student of that class (on hold)
        out.append({'id': h.pk, 'handout_id': h.handout_id, 'title': h.title, 'class_code': h.class_code, 'class_date': h.class_date,
                    'state': row['state'], 'why': row['why'], 'given_at': row['given_at'], 'given_by': row['given_by']})
    return out


def tomorrow_hint(on):
    """For the daily checklist: tomorrow's classes' handouts and how many are not yet printed."""
    from teachers.payroll import roster
    nxt = on + timedelta(days=1)
    held = [r['class_id'] for r in roster(nxt) if not (r.get('record') and r['record'].get('status') == 'CANCELLED')]
    handouts = LessonHandout.objects.filter(class_date=nxt, timetable_class_id__in=held).exclude(status='ARCHIVED')
    if not handouts:
        return 'Tiada handout direkod untuk kelas esok'
    unprinted = sum(1 for h in handouts if h.status == 'NEEDS_PRINTING')
    return f"{len(handouts)} handout untuk esok, {unprinted} belum dicetak" if unprinted else f"{len(handouts)} handout untuk esok, semua sudah dicetak"
