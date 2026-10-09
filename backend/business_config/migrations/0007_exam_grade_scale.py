from django.db import migrations

SCALE = [(90, 'A+'), (80, 'A'), (70, 'A-'), (65, 'B+'), (60, 'B'), (55, 'C+'), (50, 'C'), (45, 'D'), (40, 'E'), (0, 'G')]


def forwards(apps, schema_editor):
    """The list "Gred & jalur markah" held five broad bands that nothing read. It now is the exam grade scale
    (code = grade, meta.min = lowest mark), starting with the scale the system already used."""
    Item = apps.get_model('business_config', 'DynamicMasterData')
    seeded = Item.objects.filter(category='13_mark_band', code__startswith='BAND_')
    if seeded.count() != 5 or Item.objects.filter(category='13_mark_band').exclude(code__startswith='BAND_').exists():
        return  # the centre already changed this list; leave it alone
    seeded.delete()
    for floor, grade in SCALE:
        Item.objects.get_or_create(category='13_mark_band', code=grade, defaults={
            'label': f'{grade}: {floor}% ke atas', 'meta_info': {'min': floor}, 'status': 'APPROVED',
            'created_by': 'Sistem', 'approved_by': 'Sistem', 'is_locked': True,
        })


class Migration(migrations.Migration):
    dependencies = [('business_config', '0006_centre_profile_defaults')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
