"""Bring every telephone number already saved into the one stored form (60133474009, see core/phone.py).

Run it once after the phone rule is installed, then never again: from then on every number is cleaned as it is saved.

    python manage.py normalize_phones            report only: what would change and what cannot be understood
    python manage.py normalize_phones --apply    take a backup, then rewrite the numbers

A number that cannot be understood (a toll-free 1-300 number, two numbers in one box, a note) is never guessed at. It stays
exactly as it was and is listed, so someone can fix it by hand."""
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from business_config.models import BusinessSetting
from core import phone
from expenses.models import Vendor
from students.models import Lead, Student
from teachers.models import StaffMember, Teacher

# (model, name shown in the report, the phone fields, a field that says which record it is)
TARGETS = [
    (Student, 'Pelajar', ('phone_number', 'home_phone', 'parent1_phone', 'parent2_phone'), 'student_id'),
    (Lead, 'Prospek', ('phone',), 'lead_id'),
    (Teacher, 'Guru', ('phone_number',), 'teacher_code'),
    (StaffMember, 'Staf', ('phone', 'emergency_phone'), 'staff_id'),
    (Vendor, 'Pembekal', ('phone_number',), 'vendor_id'),
]
CENTRE_KEYS = ('CENTER_PHONE', 'CENTER_WHATSAPP')


class Command(BaseCommand):
    help = 'Rewrite saved telephone numbers to the stored form. Without --apply it only reports.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Make the changes (after a backup) instead of only reporting')
        parser.add_argument('--skip-backup', action='store_true', help='Do not take a backup first (only for a throwaway database)')

    def collect(self):
        """-> (changes, stuck): changes are (model name, record, field, old, new, pk, model); stuck are the numbers not understood"""
        changes, stuck, total, already = [], [], 0, 0
        for model, name, fields, label_field in TARGETS:
            for row in model.objects.all().values('pk', label_field, *fields):
                for field in fields:
                    old = row[field]
                    if not old:
                        continue
                    total += 1
                    new = phone.normalize(old)
                    if new is None:
                        stuck.append((name, row[label_field], field, old))
                    elif new == old:
                        already += 1
                    else:
                        changes.append((name, row[label_field], field, old, new, row['pk'], model))
        for setting in BusinessSetting.objects.filter(key__in=CENTRE_KEYS):
            total += 1
            new = phone.normalize(setting.value)
            if new is None:
                stuck.append(('Pusat', setting.key, 'value', setting.value))
            elif new == setting.value:
                already += 1
            else:
                changes.append(('Pusat', setting.key, 'value', setting.value, new, setting.pk, BusinessSetting))
        return changes, stuck, total, already

    def handle(self, *args, **options):
        changes, stuck, total, already = self.collect()
        out = self.stdout.write
        out(f'{total} nombor ditemui: {already} sudah betul, {len(changes)} akan ditukar, {len(stuck)} tidak dapat difahami.')
        for name, record, field, old, new, *_ in changes[:15]:
            out(f'  {name} {record} {field}: {old}  ->  {new}')
        if len(changes) > 15:
            out(f'  ... dan {len(changes) - 15} lagi')
        if stuck:
            out('Tidak dapat difahami (dibiarkan seperti asal, sila betulkan sendiri):')
            for name, record, field, old in stuck:
                out(f'  {name} {record} {field}: {old}')

        if not options['apply']:
            out('Laporan sahaja; tiada apa yang diubah. Jalankan dengan --apply untuk menukar.')
            return
        if not changes:
            out('Tiada apa yang perlu ditukar.')
            return
        if not options['skip_backup']:
            call_command('backup_data', stdout=self.stdout)
        with transaction.atomic():
            for _, _, field, _, new, pk, model in changes:
                model.objects.filter(pk=pk).update(**{field: new})  # update(), so no record gets a new "last changed" time
        self.stdout.write(self.style.SUCCESS(f'{len(changes)} nombor telah ditukar.'))
