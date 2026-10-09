from django.db import migrations

# The centre details were first seeded in a slightly different shape; move the untouched seed values
# to the shape Tetapan > Pusat uses (name and branch apart). Anything the centre edited is left alone.
OLD_TO_NEW = [
    ('CENTER_NAME', 'Pusat Tuisyen An Nur Telipot', 'Pusat Tuisyen An Nur'),
    ('CENTER_PHONE', '013-9838085', '013-983 8085'),
    ('CENTER_ADDRESS', 'Tingkat 1, PT 105, Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan',
     'Tingkat 1 & 2, PT 105, Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan'),
]


def forwards(apps, schema_editor):
    BusinessSetting = apps.get_model('business_config', 'BusinessSetting')
    for key, old, new in OLD_TO_NEW:
        BusinessSetting.objects.filter(key=key, value=old).update(value=new)


class Migration(migrations.Migration):
    dependencies = [('business_config', '0005_free_fee_groups')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
