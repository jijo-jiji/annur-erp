"""A class over its seat limit is allowed on purpose; Ringkasan says how far over it is and how many are waiting (core/analytics.py)."""
from datetime import date
from academic.models import ClassTimetable
from core.permissions import MANAGEMENT
from students.models import ClassWaitlist, Student
from students.tests import Phase2Base


class CrowdedClassTests(Phase2Base):
    def setUp(self):
        super().setUp()
        base = dict(ic_number='1', form_level='F5', status='ACTIVE', join_date=date.today(), parent1_name='P', parent1_phone='60123456001')
        self.people = [Student.objects.create(student_id=f'AN-9{i}', full_name=f'Pelajar {i}', **base) for i in range(1, 7)]
        # Fizik: 1 seat, 3 in (2 over), 2 waiting. Kimia: 5 seats, 5 in (full), 1 waiting. A third class: 1 seat, 2 in (1 over), nobody waiting.
        self.third = ClassTimetable.objects.create(slot=self.fz.slot, form_level='F4', section='A', max_seats=1, subject=self.kim.subject)
        for s in self.people[:3]:
            s.enrolled_classes.add(self.fz)
        for s in self.people[:5]:
            s.enrolled_classes.add(self.kim)
        self.people[0].enrolled_classes.add(self.third)
        self.people[1].enrolled_classes.add(self.third)
        ClassWaitlist.objects.create(student=self.people[4], timetable_class=self.fz, status='WAITING')
        ClassWaitlist.objects.create(student=self.people[5], timetable_class=self.fz, status='WAITING')
        ClassWaitlist.objects.create(student=self.people[3], timetable_class=self.fz, status='ENROLLED')   # already placed: not waiting
        ClassWaitlist.objects.create(student=self.people[5], timetable_class=self.kim, status='WAITING')
        ClassWaitlist.objects.create(student=self.people[2], timetable_class=self.kim, status='CANCELLED')  # gave up: not waiting

    def classes(self):
        self.as_role(MANAGEMENT)
        return self.client.get('/api/v1/dashboard/summary/').data['classes']

    def test_the_most_crowded_class_comes_first_with_how_far_over_it_is_and_who_waits(self):
        over = self.classes()['over']
        self.assertEqual([(c['id'], c['available_seats'], c['waiting']) for c in over], [(self.fz.id, -2, 2), (self.third.id, -1, 0)])
        self.assertEqual((over[0]['enrolled'], over[0]['max_seats']), (3, 1))

    def test_a_full_class_says_how_many_wait_for_it(self):
        full = self.classes()['full']
        self.assertEqual([(c['id'], c['waiting']) for c in full], [(self.kim.id, 1)])

    def test_the_rows_are_the_classes_the_list_opens(self):
        classes = self.classes()
        listed = self.client.get('/api/v1/academic/timetable/matching/', {'capacity': 'over'}).data
        self.assertEqual(sorted(listed['ids']), sorted(c['id'] for c in classes['over']))
