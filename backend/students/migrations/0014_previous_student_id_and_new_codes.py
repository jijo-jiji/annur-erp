from django.db import migrations, models

OLD_DEFAULT_PREFIX = 'AN'
NEW_PREFIX = 'HQ'


def renumber(apps, schema_editor):
    """Every student gets a code in the HQ-YY0000 form, numbered 1, 2, 3… in registration order with YY the year
    they registered. The code they had before is kept in previous_student_id so it can still be searched."""
    Setting = apps.get_model('business_config', 'BusinessSetting')
    Student = apps.get_model('students', 'Student')

    saved = Setting.objects.filter(key='PREFIX_STUDENT').first()
    if saved and saved.value == OLD_DEFAULT_PREFIX:
        saved.value = NEW_PREFIX  # the old default; a prefix the centre chose itself is kept
        saved.save(update_fields=['value'])
    prefix = saved.value if saved else NEW_PREFIX

    students = list(Student.objects.order_by('join_date', 'created_at', 'id'))
    for s in students:  # step aside first so a new code never meets an old one
        Student.objects.filter(pk=s.pk).update(student_id=f'TMP-{s.pk}')
    for serial, s in enumerate(students, start=1):
        code = f"{prefix}-{s.join_date.year % 100:02d}{serial:04d}"
        Student.objects.filter(pk=s.pk).update(
            student_id=code, previous_student_id=s.student_id if s.student_id != code else s.previous_student_id)


def restore(apps, schema_editor):
    Student = apps.get_model('students', 'Student')
    for s in Student.objects.exclude(previous_student_id=''):
        Student.objects.filter(pk=s.pk).update(student_id=f'TMP-{s.pk}')
    for s in Student.objects.exclude(previous_student_id=''):
        Student.objects.filter(pk=s.pk).update(student_id=s.previous_student_id, previous_student_id='')


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0013_resubmitted_event'),
        ('business_config', '0009_subject_category_and_supply_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='previous_student_id',
            field=models.CharField(blank=True, db_index=True, max_length=30),
        ),
        migrations.RunPython(renumber, restore),
    ]
