import django.db.models.deletion
from datetime import date
from django.db import migrations, models

# Frozen here on purpose: a migration must keep doing what it did when it was written
TERMS = [('PENGGAL_1', 'Penggal 1'), ('PERTENGAHAN', 'Pertengahan Tahun'), ('PENGGAL_2', 'Penggal 2'),
         ('PERCUBAAN_SPM', 'Percubaan SPM'), ('AKHIR', 'Akhir Tahun'), ('SPM', 'SPM')]
LABELS = dict(TERMS)
# Exam names used before (master data 10_exam_type and free text) and the term they belong to
BY_NAME = [('percubaan', 'PERCUBAAN_SPM'), ('trial', 'PERCUBAAN_SPM'), ('spm', 'SPM'), ('pertengahan', 'PERTENGAHAN'),
           ('ppt', 'PERTENGAHAN'), ('mid', 'PERTENGAHAN'), ('penggal 2', 'PENGGAL_2'), ('penggal 1', 'PENGGAL_1'),
           ('akhir', 'AKHIR'), ('uasa', 'AKHIR'), ('pat', 'AKHIR'), ('upkk', 'AKHIR'), ('final', 'AKHIR')]


def term_of(result):
    name = (result.exam_name or '').lower()
    for word, term in BY_NAME:
        if word in name:
            return term
    month = (result.exam_date or result.date_recorded or date.today()).month
    return 'PENGGAL_1' if month <= 4 else 'PERTENGAHAN' if month <= 6 else 'PENGGAL_2' if month <= 9 else 'AKHIR'


def to_terms(apps, schema_editor):
    """Each existing result gets the year and school term it belongs to. Where two results now fall on the same
    student, year, term and subject, the later one is kept (it is the one that was showing as the latest)."""
    Result = apps.get_model('students', 'StudentExamResult')
    kept = {}
    for r in Result.objects.order_by('exam_date', 'date_recorded', 'id'):
        r.year = (r.exam_date or r.date_recorded or date.today()).year
        r.term = term_of(r)
        r.exam_name = LABELS[r.term]
        key = (r.student_id, r.year, r.term, r.subject_id)
        if key in kept:
            Result.objects.filter(pk=kept[key]).delete()
        kept[key] = r.pk
        r.save(update_fields=['year', 'term', 'exam_name'])


class Migration(migrations.Migration):

    dependencies = [
        ('business_config', '0009_subject_category_and_supply_types'),
        ('students', '0014_previous_student_id_and_new_codes'),
    ]

    operations = [
        migrations.AddField(
            model_name='studentexamresult',
            name='year',
            field=models.PositiveSmallIntegerField(null=True),
        ),
        migrations.AddField(
            model_name='studentexamresult',
            name='term',
            field=models.CharField(choices=TERMS, default='PENGGAL_1', max_length=20),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='studentexamresult',
            name='source',
            field=models.CharField(choices=[('STAFF', 'Kakitangan'), ('PARENT', 'Borang ibu bapa / pelajar')], default='STAFF', max_length=10),
        ),
        migrations.AddField(
            model_name='studentexamresult',
            name='recorded_by',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AlterField(
            model_name='studentexamresult',
            name='grade',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.RunPython(to_terms, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='studentexamresult',
            name='year',
            field=models.PositiveSmallIntegerField(),
        ),
        migrations.AlterModelOptions(
            name='studentexamresult',
            options={'ordering': ['year', 'exam_date', 'id']},
        ),
        migrations.AddConstraint(
            model_name='studentexamresult',
            constraint=models.UniqueConstraint(fields=('student', 'year', 'term', 'subject'), name='one_result_per_term_and_subject'),
        ),
        migrations.CreateModel(
            name='ResultSubmission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveSmallIntegerField()),
                ('term', models.CharField(choices=TERMS, max_length=20)),
                ('form_level', models.CharField(blank=True, max_length=10)),
                ('rows', models.JSONField(default=list)),
                ('submitted_by', models.CharField(max_length=120)),
                ('relation', models.CharField(blank=True, max_length=30)),
                ('phone', models.CharField(blank=True, max_length=30)),
                ('note', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('PENDING', 'Menunggu semakan'), ('APPROVED', 'Diluluskan'), ('REJECTED', 'Ditolak')], default='PENDING', max_length=10)),
                ('reviewed_by', models.CharField(blank=True, max_length=150)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('review_note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='result_submissions', to='students.student')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
