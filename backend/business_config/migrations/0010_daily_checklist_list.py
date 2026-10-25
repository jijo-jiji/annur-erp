from django.db import migrations

# Frozen here on purpose: a migration must keep doing what it did when it was written
ITEMS = [
    ('TUTUP_KAUNTER', 'Tutup kaunter & kira tunai', 'cash_close'),
    ('KEDATANGAN', 'Kedatangan semua kelas diambil', 'attendance'),
    ('PERINGATAN_YURAN', 'Peringatan yuran dihantar', 'reminders'),
    ('NOTA_ESOK', 'Nota / modul kelas esok disediakan', ''),
    ('MESEJ_IBU_BAPA', 'Mesej ibu bapa dibalas', ''),
]


def add_items(apps, schema_editor):
    """The default items of the office's daily checklist; the centre edits the list in Data induk afterwards."""
    Item = apps.get_model('business_config', 'DynamicMasterData')
    for order, (code, label, auto) in enumerate(ITEMS, start=1):
        Item.objects.get_or_create(category='27_daily_checklist', code=code, defaults={
            'label': label, 'status': 'APPROVED', 'created_by': 'Sistem', 'approved_by': 'Sistem',
            'meta_info': {'order': order, 'auto': auto},
        })


class Migration(migrations.Migration):

    dependencies = [
        ('business_config', '0009_subject_category_and_supply_types'),
    ]

    operations = [
        migrations.RunPython(add_items, migrations.RunPython.noop),
    ]
