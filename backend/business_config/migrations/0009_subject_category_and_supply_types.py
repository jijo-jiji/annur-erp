from django.db import migrations, models

# Frozen here on purpose: a migration must keep doing what it did when it was written
SUPPLY_TYPES = [
    ('ALAT_TULIS', 'Alat tulis', 'ALAT_TULIS'),
    ('PERCETAKAN', 'Percetakan', 'ALAT_TULIS'),
    ('PAIP', 'Paip / plumbing', 'SELENGGARA'),
    ('ELEKTRIK', 'Elektrik & pendawaian', 'SELENGGARA'),
    ('PENYELENGGARAAN', 'Penyelenggaraan & aircond', 'SELENGGARA'),
    ('UTILITI', 'Utiliti', 'UTILITI'),
    ('MAKANAN', 'Makanan & jamuan', 'JAMUAN'),
    ('LAIN', 'Lain-lain', ''),
]
SUBJECT_CATEGORIES = [('TERAS', 'Teras'), ('SAINS', 'Sains'), ('SASTERA', 'Sastera / Akaun'), ('ELEKTIF', 'Elektif')]


def add_lists(apps, schema_editor):
    """Supply types (with the expense category each suggests) and subject categories; existing subjects
    start in the category of their stream."""
    Item = apps.get_model('business_config', 'DynamicMasterData')
    Subject = apps.get_model('business_config', 'SubjectMaster')

    def add(category, code, label, meta):
        Item.objects.get_or_create(category=category, code=code, defaults={
            'label': label, 'status': 'APPROVED', 'created_by': 'Sistem', 'approved_by': 'Sistem', 'is_locked': True, 'meta_info': meta,
        })

    for order, (code, label, cat) in enumerate(SUPPLY_TYPES, start=1):
        add('25_supply_type', code, label, {'order': order, 'cat': cat})
    for order, (code, label) in enumerate(SUBJECT_CATEGORIES, start=1):
        add('26_subject_category', code, label, {'order': order})
    for stream in ('TERAS', 'SAINS', 'SASTERA'):
        Subject.objects.filter(stream=stream).update(category=stream)


class Migration(migrations.Migration):

    dependencies = [
        ('business_config', '0008_lead_lists'),
    ]

    operations = [
        migrations.AddField(
            model_name='subjectmaster',
            name='category',
            field=models.CharField(blank=True, default='', max_length=60),
        ),
        migrations.RunPython(add_lists, migrations.RunPython.noop),
    ]
