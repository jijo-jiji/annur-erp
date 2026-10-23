import re
from django.db import migrations

# Frozen here on purpose: a migration must keep doing what it did when it was written
ACTIONS = [
    ('WHATSAPP', 'WhatsApp'), ('CALL', 'Panggilan telefon'), ('CONTENT', 'Hantar content'), ('TRIAL_CLASS', 'Kelas percubaan'),
    ('WALK_IN', 'Walk-in kaunter'), ('EMAIL', 'E-mel'), ('OTHER', 'Lain-lain'),
]
LOST_REASONS = [
    ('PRICE', 'Yuran terlalu tinggi'), ('DISTANCE', 'Jarak terlalu jauh'), ('TIME', 'Masa tidak sesuai'),
    ('OTHER_CENTRE', 'Memilih pusat tuisyen lain'), ('NO_RESPONSE', 'Tiada respons'), ('NOT_READY', 'Belum bersedia / tangguh'),
    ('OTHER', 'Lain-lain'),
]


def add_lead_lists(apps, schema_editor):
    """The lead funnel's own drop-downs. Campaigns are carried over from the leads already entered, so
    nothing already on the board falls outside the list."""
    Item = apps.get_model('business_config', 'DynamicMasterData')
    Lead = apps.get_model('students', 'Lead')

    def add(category, code, label, order=999):
        Item.objects.get_or_create(category=category, code=code, defaults={
            'label': label, 'status': 'APPROVED', 'created_by': 'Sistem', 'approved_by': 'Sistem', 'is_locked': True,
            'meta_info': {'order': order},  # drop-downs show the list in this order, then anything added later
        })

    for order, (code, label) in enumerate(ACTIONS, start=1):
        add('23_lead_action', code, label, order)
    for order, (code, label) in enumerate(LOST_REASONS, start=1):
        add('24_lost_reason', code, label, order)
    # existing free-text values that are not in the lists yet
    used = {a for a in Lead.objects.values_list('lost_reason', flat=True) if a}
    known = {label.lower() for _, label in LOST_REASONS}
    for i, reason in enumerate(sorted(used), start=1):
        if reason.lower() not in known:
            add('24_lost_reason', f'LAMA_{i}', reason[:150])
    for campaign in sorted({c.strip() for c in Lead.objects.values_list('campaign', flat=True) if c and c.strip()}):
        add('22_lead_campaign', re.sub(r'[^A-Z0-9]+', '_', campaign.upper()).strip('_')[:60] or 'KEMPEN', campaign[:150])


class Migration(migrations.Migration):

    dependencies = [
        ('business_config', '0007_exam_grade_scale'),
        ('students', '0012_lead_stages_and_partial_info'),
    ]

    operations = [
        migrations.RunPython(add_lead_lists, migrations.RunPython.noop),
    ]
