# Run inside `manage.py shell` by checkin.spec.js, against the throwaway end-to-end database only.
# QR check-in depends on the clock, so the test makes its own class that started a few minutes ago, in its own room,
# with its own teacher and two students, and removes all of it afterwards (ANNUR_E2E_CHECKIN=teardown).
import json
import os
from datetime import timedelta
from django.utils import timezone
from academic.models import Classroom, ClosedDate, ClassTimetable, TimeSlot
from business_config.models import SubjectMaster
from students.models import Student
from teachers import links
from teachers.models import Teacher
from teachers.payroll import WEEKDAY_TO_DAY

TAG = 'E2E QR'

if os.environ.get('ANNUR_E2E_CHECKIN') == 'teardown':
    Student.objects.filter(full_name__endswith=TAG).delete()
    TimeSlot.objects.filter(period_label=TAG).delete()  # and its class
    Classroom.objects.filter(name=f'Bilik {TAG}').delete()
    Teacher.objects.filter(teacher_code='QRE2E').delete()
    print('[e2e-json]', json.dumps({'removed': True}))
else:
    now = timezone.localtime()
    today = now.date()
    start = max(now - timedelta(minutes=5), now.replace(hour=0, minute=0))
    end = min(start + timedelta(minutes=90), now.replace(hour=23, minute=59))
    slot = TimeSlot.objects.create(day=WEEKDAY_TO_DAY[today.weekday()], start_time=f'{start:%H:%M}', end_time=f'{end:%H:%M}', period_label=TAG)
    room = Classroom.objects.create(name=f'Bilik {TAG}', capacity=10)
    teacher = Teacher.objects.create(teacher_code='QRE2E', full_name=f'Guru {TAG}', phone_number='012-345 6789')
    subject = SubjectMaster.objects.order_by('id').first()
    cls = ClassTimetable.objects.create(slot=slot, subject=subject, form_level='F4', section='D', teacher=teacher, classroom=room, max_seats=10)
    students = []
    for name, ic in (('Aisyah Humaira', '100101-03-1234'), ('Badrul Hisham', '100202-03-5678'), ('Chong Wei', '100303-03-9012')):
        s = Student.objects.create(
            student_id=f'QR-{ic[-4:]}', full_name=f'{name} {TAG}', ic_number=ic, form_level='F4', join_date=today, status='ACTIVE',
            parent1_name='Penjaga', parent1_phone='013-345 6789',
        )
        s.enrolled_classes.add(cls)
        students.append({'id': s.pk, 'name': s.full_name, 'short': f"{name.split()[0]} {name.split()[1][0]}.", 'ic4': ic[-4:]})
    _, token = links.make('TEACHER', 'e2e', teacher=teacher)
    print('[e2e-json]', json.dumps({
        'class_id': cls.pk, 'subject': subject.name, 'room': room.name, 'room_id': room.pk, 'teacher_token': token,
        'closed': bool(ClosedDate.objects.filter(date=today).exists()), 'students': students,
    }))
