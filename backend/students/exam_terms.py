"""School exams a result belongs to.

Results are the student's school exam results (not tuition-class tests), one per student, year, term and subject.
The terms are fixed. Percubaan SPM and SPM are only for the final secondary grade (Tingkatan 5); SPM gives a grade
only, the others a mark from which the grade is worked out."""
from datetime import date

from rest_framework.exceptions import ValidationError

# (code, label, nominal date of the exam (month, day), final-year only, grade only); in the order they are sat
TERMS = [
    ('PENGGAL_1', 'Penggal 1', (3, 31), False, False),
    ('PERTENGAHAN', 'Pertengahan Tahun', (6, 15), False, False),
    ('PENGGAL_2', 'Penggal 2', (8, 31), False, False),
    ('PERCUBAAN_SPM', 'Percubaan SPM', (9, 15), True, False),
    ('AKHIR', 'Akhir Tahun', (10, 31), False, False),
    ('SPM', 'SPM', (12, 15), True, True),
]
CHOICES = [(code, label) for code, label, *_ in TERMS]
_BY_CODE = {t[0]: t for t in TERMS}
# SPM grades, best first; a grade typed for any term must be one of these
GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'G', 'TH']  # TH: tidak hadir


def label(term):
    return _BY_CODE[term][1] if term in _BY_CODE else term


def order(term):
    return next((i for i, t in enumerate(TERMS) if t[0] == term), len(TERMS))


def nominal_date(year, term):
    """A date for reports that sort by time when the exam's own date was not given."""
    month, day = _BY_CODE[term][2]
    return date(year, month, day)


def grade_only(term):
    return _BY_CODE[term][4]


def is_final_year(form_level):
    from core import grades
    g = grades.by_code().get(form_level)
    return bool(g) and g['level'] == 'UPPER' and not g['next']


def terms_for(form_level):
    final = is_final_year(form_level)
    return [{'code': c, 'label': l, 'grade_only': g} for c, l, _, only_final, g in TERMS if final or not only_final]


def check(term, form_level, year):
    """Raise unless `term` can be recorded for a student in `form_level` in `year`."""
    if term not in _BY_CODE:
        raise ValidationError({'term': 'Pilih peperiksaan: Penggal 1, Pertengahan Tahun, Penggal 2, Akhir Tahun, Percubaan SPM atau SPM.'})
    if _BY_CODE[term][3] and not is_final_year(form_level):
        raise ValidationError({'term': f'{label(term)} hanya untuk pelajar Tingkatan 5.'})
    this_year = date.today().year
    if not isinstance(year, int) or not 2000 <= year <= this_year + 1:
        raise ValidationError({'year': f'Tahun mesti antara 2000 dan {this_year + 1}.'})


def clean_row(term, mark, grade):
    """(mark, grade) for one subject: a mark 0-100 gives the grade; without a mark the grade is kept as given
    (a report slip with grades only, or TH for absent); SPM takes the grade only.
    Both empty means 'no result' and returns (None, '')."""
    from core.gradescale import grade_for
    grade = str(grade or '').strip().upper()
    if mark in (None, ''):
        mark = None
    else:
        try:
            mark = int(mark)
        except (TypeError, ValueError):
            raise ValidationError({'mark': 'Markah mesti nombor 0 hingga 100.'})
        if not 0 <= mark <= 100:
            raise ValidationError({'mark': 'Markah mesti antara 0 dan 100.'})
    if grade and grade not in GRADES:
        raise ValidationError({'grade': f"Gred '{grade}' tidak sah."})
    if grade_only(term) or mark is None:
        return None, grade
    return mark, grade_for(mark)
