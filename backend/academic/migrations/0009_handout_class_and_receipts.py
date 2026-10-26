import re
from datetime import date

import django.db.models.deletion
from django.db import migrations, models

# The handout form used to put the class date at the start of the description ("Untuk kelas 26 Okt 2026. ...")
MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
DATED = re.compile(r'^Untuk kelas (\d{1,2}) (\w+) (\d{4})\.?\s*')


def link_to_classes(apps, schema_editor):
    """Older handouts only carry the class's name as text: link those whose name matches a class today, and take the
    class date out of the description where the form put it there."""
    Handout = apps.get_model('academic', 'LessonHandout')
    Class = apps.get_model('academic', 'ClassTimetable')
    by_code = {}
    for c in Class.objects.select_related('subject', 'teacher'):
        by_code.setdefault(f"{c.form_level} {c.subject.code} ({c.section}) {c.teacher.teacher_code if c.teacher else 'TBA'}", c)
    for h in Handout.objects.all():
        h.timetable_class = by_code.get(h.class_code)
        found = DATED.match(h.description or '')
        if found and found.group(2) in MONTHS:
            try:
                h.class_date = date(int(found.group(3)), MONTHS.index(found.group(2)) + 1, int(found.group(1)))
                h.description = h.description[found.end():]
            except ValueError:
                pass
        h.save(update_fields=['timetable_class', 'class_date', 'description'])


class Migration(migrations.Migration):

    dependencies = [
        ("academic", "0008_room_check_in_key"),
        ("students", "0016_qr_check_in"),
    ]

    operations = [
        migrations.AddField(
            model_name="lessonhandout",
            name="class_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="lessonhandout",
            name="timetable_class",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="handouts",
                to="academic.classtimetable",
            ),
        ),
        migrations.CreateModel(
            name="HandoutReceipt",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("given_at", models.DateTimeField(auto_now_add=True)),
                ("given_by", models.CharField(max_length=150)),
                (
                    "handout",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="receipts",
                        to="academic.lessonhandout",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="handout_receipts",
                        to="students.student",
                    ),
                ),
            ],
            options={
                "unique_together": {("handout", "student")},
            },
        ),
        migrations.RunPython(link_to_classes, migrations.RunPython.noop),
    ]
