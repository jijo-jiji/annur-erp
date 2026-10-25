"""Which classes a dashboard figure counts, and the list it opens (see students/drilldown.py)."""
from rest_framework.exceptions import ValidationError
from .models import ClassTimetable

CAPACITY_STATES = ('over', 'full', 'near')


def capacity_state(cls, near_seats):
    """over: more students than seats; full: no seat left; near: only a few seats left (the limit is a setting)."""
    left = cls.available_seats
    if left < 0:
        return 'over'
    if left == 0:
        return 'full'
    if left <= near_seats:
        return 'near'
    return None


def classes_matching(params, near_seats=None):
    """Classes by seats, subject and tingkatan; returns a list of classes with their enrolment.

    capacity  over | full | near
    subject   subject code
    form      grade code
    id        one class"""
    if near_seats is None:
        from core import thresholds
        near_seats = thresholds.value('nearly_full_seats')
    qs = ClassTimetable.with_enrolment().select_related('slot', 'subject', 'teacher', 'classroom')
    if params.get('id'):
        try:
            qs = qs.filter(pk=int(params['id']))
        except ValueError:
            raise ValidationError({'id': 'Kelas tidak sah.'})
    if params.get('subject'):
        qs = qs.filter(subject__code=params['subject'])
    if params.get('form'):
        qs = qs.filter(form_level=params['form'])
    classes = list(qs)
    capacity = params.get('capacity')
    if capacity:
        if capacity not in CAPACITY_STATES:
            raise ValidationError({'capacity': 'Keadaan kerusi tidak dikenali.'})
        classes = [c for c in classes if capacity_state(c, near_seats) == capacity]
    return classes
