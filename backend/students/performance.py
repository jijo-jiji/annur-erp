"""Prestasi pelajar (Phase H): students failing or falling in a school exam, with what might explain it.

For each active student's latest result in each subject (or their result in a chosen exam, a year and term), the result
is checked against two settings (Settings > Had & amaran > Prestasi pelajar):
- failing: a mark below the pass mark, or a failing grade (G, TH) when only the grade is known;
- falling: a mark this many marks or more below the same subject in the student's previous exam.

Each row carries the student's tuition class for that subject (and so its teacher), the student's attendance in that
class between the previous exam and this one, the subject's marks over time, the teacher reports about the student that
are still open, and likely reasons worked out from those facts. The screen groups the rows by teacher and class."""
from collections import defaultdict
from datetime import date
from . import exam_terms
from .models import StudentAttendance, StudentExamResult, StudentReport

FAIL_GRADES = ('G', 'TH')


def _settings():
    from core import thresholds
    v = thresholds.values()
    return v['results_pass_mark'], v['results_drop_marks'], v['low_attendance_pct']


def _key(r):
    return (r.year, exam_terms.order(r.term))


def exams():
    """The exams (year, term) that have results, newest first."""
    seen = sorted({(r['year'], r['term']) for r in StudentExamResult.objects.values('year', 'term')},
                  key=lambda e: (e[0], exam_terms.order(e[1])), reverse=True)
    return [{'year': y, 'term': t, 'label': f"{exam_terms.label(t)} {y}"} for y, t in seen]


def is_failing(result, pass_mark):
    return result.mark < pass_mark if result.mark is not None else result.grade.upper() in FAIL_GRADES


def _attendance(student, cls, start, end):
    """(present, sessions) for the student in the class between two dates."""
    if cls is None:
        return None
    marks = StudentAttendance.objects.filter(student=student, session__timetable_class=cls, session__date__gt=start, session__date__lte=end)
    total = marks.count()
    return {'present': marks.filter(present=True).count(), 'total': total} if total else {'present': 0, 'total': 0}


LATEST = {'year': None, 'term': None, 'label': 'Peperiksaan terakhir setiap pelajar'}


def concerns(year=None, term=None, today=None):
    """With no exam chosen, each student's latest result in each subject: Tingkatan 5 sit Percubaan SPM, which others do
    not, so one exam for everyone would leave the rest out."""
    today = today or date.today()
    pass_mark, drop_marks, low_pct = _settings()
    available = exams()
    chosen = next((e for e in available if str(e['year']) == str(year) and e['term'] == term), None)
    exam_key = (chosen['year'], exam_terms.order(chosen['term'])) if chosen else None

    results = StudentExamResult.objects.select_related('student', 'subject').filter(student__status='ACTIVE')
    by_subject = defaultdict(list)  # (student, subject) -> results up to the chosen exam, oldest first
    for r in sorted(results, key=_key):
        if exam_key is None or _key(r) <= exam_key:
            by_subject[(r.student_id, r.subject_id)].append(r)

    open_reports = defaultdict(list)
    for rep in StudentReport.objects.exclude(status='RESOLVED').select_related('teacher').order_by('-date', '-id'):
        open_reports[rep.student_id].append(rep)

    rows = []
    falling_subjects = defaultdict(int)
    candidates = []
    for (student_id, subject_id), history in by_subject.items():
        latest = history[-1]
        if exam_key is not None and _key(latest) != exam_key:
            continue  # no result in the chosen exam for this subject
        previous = history[-2] if len(history) > 1 else None
        change = latest.mark - previous.mark if previous and latest.mark is not None and previous.mark is not None else None
        failing = is_failing(latest, pass_mark)
        falling = change is not None and -change >= drop_marks
        if failing or falling:
            candidates.append((latest, previous, history, change, failing, falling))
            if falling:
                falling_subjects[student_id] += 1

    for latest, previous, history, change, failing, falling in candidates:
        student, subject = latest.student, latest.subject
        cls = next((c for c in student.enrolled_classes.select_related('teacher', 'subject') if c.subject_id == subject.pk), None)
        start = previous.exam_date if previous else date(latest.year, 1, 1)
        end = min(latest.exam_date or today, today)
        att = _attendance(student, cls, start, end)
        rate = round(att['present'] * 100 / att['total']) if att and att['total'] else None

        reasons = []
        if cls is None:
            reasons.append('Tidak mengambil subjek ini di pusat')
        elif rate is not None and rate < low_pct:
            reasons.append(f"Kehadiran rendah dalam kelas ini ({rate}%)")
        if student.join_date and student.join_date > start:
            reasons.append('Baru menyertai pusat sebelum peperiksaan ini')
        if falling_subjects[student.pk] >= 3:
            reasons.append(f"Merosot dalam {falling_subjects[student.pk]} subjek sekali gus")
        reports = open_reports.get(student.pk, [])
        for rep in reports[:3]:
            reasons.append(f"Laporan guru: {rep.get_category_display()}")

        rows.append({
            'student': student.pk, 'code': student.student_id, 'name': student.full_name, 'form': student.form_level,
            'subject': subject.name, 'subject_id': subject.pk, 'exam': f"{exam_terms.label(latest.term)} {latest.year}",
            'mark': latest.mark, 'grade': latest.grade, 'failing': failing, 'falling': falling,
            'previous': {'mark': previous.mark, 'grade': previous.grade, 'exam': f"{previous.exam_name} {previous.year}"} if previous else None,
            'change': change,
            'trend': [{'exam': f"{exam_terms.label(r.term)} {r.year}", 'mark': r.mark, 'grade': r.grade} for r in history[-5:]],
            'class_id': cls.pk if cls else None, 'class_code': cls.class_code if cls else None,
            'teacher_id': cls.teacher_id if cls else None, 'teacher': cls.teacher.full_name if cls and cls.teacher else None,
            'attendance': att, 'attendance_rate': rate,
            'reports': [{'id': r.pk, 'date': r.date, 'category': r.get_category_display(), 'details': r.details,
                         'teacher': r.teacher.full_name if r.teacher else '', 'status': r.get_status_display()} for r in reports[:3]],
            'reasons': reasons,
        })
    rows.sort(key=lambda r: (r['teacher'] or '~', r['class_code'] or '~', r['mark'] if r['mark'] is not None else -1, r['name']))
    return {'exam': chosen or LATEST, 'exams': available, 'pass_mark': pass_mark, 'drop_marks': drop_marks, 'low_attendance_pct': low_pct, 'rows': rows}
