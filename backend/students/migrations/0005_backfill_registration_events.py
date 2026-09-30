from django.db import migrations


def backfill(apps, schema_editor):
    """Give students created before history existed a starting point in their history."""
    Student = apps.get_model('students', 'Student')
    StudentEvent = apps.get_model('students', 'StudentEvent')
    for s in Student.objects.all():
        if not StudentEvent.objects.filter(student=s).exists():
            StudentEvent.objects.create(
                student=s, event_type='REGISTERED', event_date=s.join_date,
                description='Rekod sedia ada sebelum sejarah pelajar dijejak.', recorded_by='Sistem',
            )


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0004_phase2_history_attendance'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
