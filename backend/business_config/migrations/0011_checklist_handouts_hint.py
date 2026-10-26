from django.db import migrations


def handouts_hint(apps, schema_editor):
    """'Nota / modul kelas esok disediakan' now shows tomorrow's handouts beside it (Phase G), unless the centre has
    already given the item something else to show."""
    Item = apps.get_model('business_config', 'DynamicMasterData')
    for item in Item.objects.filter(category='27_daily_checklist', code='NOTA_ESOK'):
        meta = item.meta_info or {}
        if not meta.get('auto'):
            item.meta_info = {**meta, 'auto': 'handouts'}
            item.save(update_fields=['meta_info'])


class Migration(migrations.Migration):

    dependencies = [
        ('business_config', '0010_daily_checklist_list'),
    ]

    operations = [
        migrations.RunPython(handouts_hint, migrations.RunPython.noop),
    ]
