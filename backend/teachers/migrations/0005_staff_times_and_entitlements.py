"""Staff clock times become real times (late / early leave can then be calculated), and stored
leave balances become yearly entitlements; the balance is now worked out from approved leave."""
from datetime import date, datetime
from django.db import migrations, models


def parse_time(text):
    for fmt in ('%I:%M %p', '%H:%M', '%H:%M:%S', '%I:%M:%S %p'):
        try:
            return datetime.strptime((text or '').strip(), fmt).time()
        except ValueError:
            continue
    return None


def convert_times(apps, schema_editor):
    StaffAttendance = apps.get_model('teachers', 'StaffAttendance')
    for row in StaffAttendance.objects.all():
        row.clock_in_t = parse_time(row.clock_in)
        row.clock_out_t = parse_time(row.clock_out)
        row.save(update_fields=['clock_in_t', 'clock_out_t'])


def balances_to_entitlements(apps, schema_editor):
    StaffMember = apps.get_model('teachers', 'StaffMember')
    LeaveRequest = apps.get_model('teachers', 'LeaveRequest')
    year = date.today().year
    for staff in StaffMember.objects.all():
        for kind in ('al', 'mc', 'el'):
            used = sum(LeaveRequest.objects.filter(staff=staff, leave_type=kind.upper(), status='APPROVED',
                                                   start_date__year=year).values_list('days_count', flat=True))
            setattr(staff, f'{kind}_entitlement', getattr(staff, f'{kind}_balance') + used)
        staff.save(update_fields=['al_entitlement', 'mc_entitlement', 'el_entitlement'])


class Migration(migrations.Migration):

    dependencies = [
        ('teachers', '0004_teacher_payroll'),
    ]

    operations = [
        migrations.AddField('staffattendance', 'clock_in_t', models.TimeField(null=True, blank=True)),
        migrations.AddField('staffattendance', 'clock_out_t', models.TimeField(null=True, blank=True)),
        migrations.RunPython(convert_times, migrations.RunPython.noop),
        migrations.RemoveField('staffattendance', 'clock_in'),
        migrations.RemoveField('staffattendance', 'clock_out'),
        migrations.RemoveField('staffattendance', 'total_hours'),
        migrations.RenameField('staffattendance', 'clock_in_t', 'clock_in'),
        migrations.RenameField('staffattendance', 'clock_out_t', 'clock_out'),

        migrations.AddField('staffmember', 'al_entitlement', models.PositiveIntegerField(default=12)),
        migrations.AddField('staffmember', 'mc_entitlement', models.PositiveIntegerField(default=14)),
        migrations.AddField('staffmember', 'el_entitlement', models.PositiveIntegerField(default=3)),
        migrations.RunPython(balances_to_entitlements, migrations.RunPython.noop),
        migrations.RemoveField('staffmember', 'al_balance'),
        migrations.RemoveField('staffmember', 'mc_balance'),
        migrations.RemoveField('staffmember', 'el_balance'),
        migrations.RemoveField('staffmember', 'ul_balance'),
    ]
