"""Existing grade entries: fill in the next grade from their order and store the level as a code."""
from django.db import migrations

LEVELS = {'primary': 'PRIMARY', 'lower sec': 'LOWER', 'upper sec': 'UPPER'}


def fill_next(apps, schema_editor):
    DynamicMasterData = apps.get_model('business_config', 'DynamicMasterData')
    rows = list(DynamicMasterData.objects.filter(category='1_form'))

    def order(item):
        try:
            return int((item.meta_info or {}).get('order', 999))
        except (TypeError, ValueError):
            return 999

    rows.sort(key=lambda r: (order(r), r.code))
    for i, item in enumerate(rows):
        meta = dict(item.meta_info or {})
        if 'next' not in meta:
            meta['next'] = rows[i + 1].code if i + 1 < len(rows) else ''
        level = str(meta.get('level', ''))
        meta['level'] = LEVELS.get(level.lower(), level or 'UPPER')
        meta.setdefault('description', '')
        item.meta_info = meta
        item.save(update_fields=['meta_info'])


class Migration(migrations.Migration):

    dependencies = [
        ('business_config', '0003_configurable_grades'),
    ]

    operations = [
        migrations.RunPython(fill_next, migrations.RunPython.noop),
    ]
