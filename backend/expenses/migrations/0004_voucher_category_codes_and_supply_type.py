from django.db import migrations, models


def link_codes(apps, schema_editor):
    """Existing vouchers were saved with category labels only: give them the codes of the master-data
    entries with the same label, so renaming a category later keeps them linked."""
    Item = apps.get_model('business_config', 'DynamicMasterData')
    Voucher = apps.get_model('expenses', 'PaymentVoucher')
    cats = {i.label: i.code for i in Item.objects.filter(category='18_expense_cat')}
    subs = {i.label: i.code for i in Item.objects.filter(category='19_expense_subcat')}
    for pv in Voucher.objects.all():
        pv.category_code = cats.get(pv.category, '')
        pv.subcategory_code = subs.get(pv.subcategory, '') if pv.subcategory else ''
        pv.save(update_fields=['category_code', 'subcategory_code'])


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0003_tier_labels'),
        ('business_config', '0009_subject_category_and_supply_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentvoucher',
            name='category_code',
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.AddField(
            model_name='paymentvoucher',
            name='subcategory_code',
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.AddField(
            model_name='vendor',
            name='supply_type',
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.RunPython(link_codes, migrations.RunPython.noop),
    ]
