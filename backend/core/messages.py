"""The wording of the WhatsApp messages staff send (payment reminders, absence notices, receipts, ...).

The program only prepares each message and opens WhatsApp; staff press send. Management can edit the
wording here. A template uses {placeholders} that the screen fills in; reset puts the original back.
Parts that depend on the situation (a remark, an adjustment, the bank account) arrive already written
as one placeholder, so the wording around them can change freely."""
import re
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import MessageTemplate, SettingEvent
from .permissions import MANAGEMENT, display_name, require_role

CENTRE = ('centre', 'Nama pusat', 'Pusat Tuisyen An Nur')
BRANCH = ('branch', 'Cawangan', 'Telipot')
PARENT = ('parent', 'Nama ibu bapa / penjaga', 'Puan Aminah')
STUDENT = ('student', 'Nama pelajar', 'Ahmad Daniyal')
BANK = ('bank', 'Ayat akaun bank (kosong jika belum diisi di Tetapan > Pusat)', ' Bayaran boleh dibuat ke Maybank 5140 1234 5678 (a/n Pusat Tuisyen An Nur).')
BILL = [PARENT, CENTRE, STUDENT, ('balance', 'Baki yuran', 'RM 120.00'), ('invoice', 'No. invois', 'INV-2026-0012'),
        ('title', 'Perkara invois', 'Yuran Oktober 2026'), ('due_date', 'Tarikh akhir', '7 Okt 2026'), BANK]


def _t(label, where, placeholders, text, required=(), public=False):
    return {'label': label, 'where': where, 'placeholders': placeholders, 'text': text, 'required': required, 'public': public}


TEMPLATES = {
    'reminder_gentle': _t(
        'Peringatan yuran: mesra', 'Yuran & resit > Susulan, minggu 1 dan 2 sebelum tarikh akhir', BILL,
        'Assalamualaikum {parent}, sekadar peringatan mesra yuran {centre} bagi {student}: baki {balance} (invois {invoice}, {title}), '
        'tarikh akhir {due_date}. Abaikan mesej ini jika sudah membuat bayaran. Terima kasih.{bank}', ('balance',)),
    'reminder_due': _t(
        'Peringatan yuran: sebelum tarikh akhir', 'Yuran & resit > Susulan, minggu seterusnya sebelum tarikh akhir', BILL,
        'Assalamualaikum {parent}, peringatan yuran {centre} bagi {student}: baki {balance} (invois {invoice}, {title}), '
        'tarikh akhir {due_date}. Mohon jelaskan bayaran sebelum tarikh akhir. Terima kasih.{bank}', ('balance',)),
    'reminder_overdue': _t(
        'Peringatan yuran: lepas tarikh akhir', 'Yuran & resit > Susulan, selepas tarikh akhir', BILL,
        'Assalamualaikum {parent}, yuran {centre} bagi {student}: baki {balance} (invois {invoice}, {title}) masih belum dijelaskan '
        'selepas tarikh akhir {due_date}. Mohon jelaskan minggu ini atau hubungi kaunter. Terima kasih.{bank}', ('balance',)),
    'reminder_arrears': _t(
        'Notis tunggakan bulan lepas', 'Yuran & resit > Susulan, baki bulan lepas', BILL,
        'Assalamualaikum {parent}, notis tunggakan yuran {centre} bagi {student}: baki {balance} (invois {invoice}, {title}). '
        'Mohon hubungi kaunter untuk penyelesaian. Terima kasih.{bank}', ('balance',)),
    'arrears_warning': _t(
        'Amaran tunggakan', 'Yuran & resit > Tunggakan', [
            PARENT, STUDENT, ('months', 'Bulan yang tertunggak', 'September dan Oktober 2026'), ('amount', 'Jumlah tertunggak', 'RM 240.00'),
            ('limit', 'Had bulan tertunggak sebelum diberhentikan', '2'), BANK],
        'Assalamualaikum {parent}. Yuran {student} bagi {months} berjumlah {amount} masih belum dijelaskan. Mengikut syarat pendaftaran, '
        'pelajar boleh diberhentikan jika yuran tertunggak {limit} bulan. Sila jelaskan bayaran atau hubungi kaunter.{bank}', ('amount',)),
    'receipt': _t(
        'Resit bayaran', 'Yuran & resit > resit, butang WhatsApp', [
            PARENT, CENTRE, STUDENT, ('receipt_no', 'No. resit', 'REC-2026-0014'), ('date', 'Tarikh bayaran', '5 Okt 2026'),
            ('amount', 'Amaun', 'RM 240.00'), ('type', 'Jenis bayaran', 'Yuran bulanan Oktober 2026'), ('method', 'Kaedah', 'Tunai'),
            ('overpaid_line', 'Baris lebihan bayaran (kosong jika tiada)', '\nLebihan RM 10.00 disimpan sebagai kredit.')],
        'Assalamualaikum {parent}. Terima kasih atas bayaran yuran {centre} bagi {student}.\n\nNo. resit: {receipt_no}\nTarikh: {date}\n'
        'Amaun: {amount} ({type})\nKaedah: {method}{overpaid_line}\n\nSila simpan mesej ini sebagai rekod.', ('receipt_no', 'amount')),
    'absence': _t(
        'Pelajar tidak hadir', 'Kedatangan pelajar, selepas menyimpan kedatangan', [
            PARENT, STUDENT, ('class', 'Kelas', 'Matematik Tingkatan 4 (A)'), ('date', 'Tarikh', 'Sabtu, 5 Oktober 2026'),
            ('time', 'Masa', '9.00–10.30 pg'), CENTRE],
        'Assalamualaikum {parent}. Dimaklumkan {student} tidak hadir ke kelas {class} pada {date}, {time}. '
        'Sila hubungi kami jika ada sebarang pertanyaan.\n— {centre}', ('student',)),
    'class_extra': _t(
        'Kelas tambahan', 'Batal & ganti kelas, makluman kepada ibu bapa', [
            ('class', 'Kelas', 'Matematik Tingkatan 4 (A)'), ('date', 'Tarikh kelas', '12 Okt 2026'), ('time', 'Masa', '9.00–10.30 pg'),
            ('remarks_block', 'Catatan (kosong jika tiada)', '\n\nSila bawa buku latihan.'), CENTRE, BRANCH],
        'Assalamualaikum ibu bapa dan pelajar.\n\nMakluman kelas tambahan {class} pada {date}, {time}.{remarks_block}\n\nTerima kasih.\n— {centre} {branch}',
        ('class',)),
    'class_cancelled': _t(
        'Kelas dibatalkan', 'Batal & ganti kelas, makluman kepada ibu bapa', [
            ('class', 'Kelas', 'Matematik Tingkatan 4 (A)'), ('date', 'Tarikh dibatalkan', '5 Okt 2026'), ('reason', 'Sebab', 'guru tidak hadir'),
            ('replacement_text', 'Ayat kelas ganti', 'Kelas ganti pada 12 Okt 2026, 9.00–10.30 pg.'),
            ('remarks_block', 'Catatan (kosong jika tiada)', ''), CENTRE, BRANCH],
        'Assalamualaikum ibu bapa dan pelajar.\n\nKelas {class} pada {date} dibatalkan ({reason}). {replacement_text}{remarks_block}\n\n'
        'Harap maklum. Terima kasih.\n— {centre} {branch}', ('class',)),
    'lead_followup': _t(
        'Susulan prospek', 'Pertanyaan & prospek, butang WhatsApp', [PARENT, CENTRE, BRANCH],
        'Assalamualaikum {parent}, kami dari {centre} {branch}.'),
    'parent_general': _t(
        'Makluman kepada ibu bapa', 'Profil pelajar dan senarai pelajar, butang WhatsApp', [PARENT, CENTRE, STUDENT],
        'Assalamualaikum {parent}, makluman daripada {centre} berkenaan {student}.'),
    'registered': _t(
        'Pendaftaran melalui borang QR', 'Borang pendaftaran ibu bapa, dihantar kepada pusat', [
            PARENT, STUDENT, ('student_id', 'ID pelajar', 'AN-2026-014')],
        'Assalamualaikum. Saya {parent} telah mendaftar {student} ({student_id}) melalui borang QR.', ('student',), public=True),
    'payslip': _t(
        'Slip gaji guru', 'Gaji guru, slip gaji, butang WhatsApp', [
            ('teacher', 'Nama guru', 'Cikgu Nur Aini'), CENTRE, ('month', 'Bulan', 'Oktober 2026'), ('sessions', 'Bilangan sesi', '20'),
            ('calculated', 'Jumlah dikira', 'RM 1,200.00'), ('adjustment_line', 'Baris pelarasan (kosong jika tiada)', '\nPelarasan: RM 50.00 (Bonus)'),
            ('payable', 'Jumlah bayaran', 'RM 1,250.00'), ('status_line', 'Status bayaran', 'Status: diluluskan, bayaran akan dibuat.'),
            ('details_line', 'Butiran sesi (kosong jika tiada)', '\nButiran: 2026-10-03 F4 MT (A) NAK')],
        'Assalamualaikum {teacher}, slip gaji {centre} bagi {month}:\nSesi mengajar: {sessions}\nJumlah dikira: {calculated}{adjustment_line}\n'
        'Jumlah bayaran: {payable}\n{status_line}{details_line}\nTerima kasih.', ('payable',)),
}

PLACEHOLDER = re.compile(r'\{(\w+)\}')


def current_text(key):
    row = MessageTemplate.objects.filter(key=key).first()
    return row.text if row else TEMPLATES[key]['text']


def _entry(key, saved):
    spec = TEMPLATES[key]
    return {
        'key': key, 'label': spec['label'], 'where': spec['where'], 'text': saved.get(key, spec['text']), 'default': spec['text'],
        'customised': key in saved, 'required': list(spec['required']),
        'placeholders': [{'name': n, 'description': d, 'sample': s} for n, d, s in spec['placeholders']],
    }


def _short(text):
    text = str(text)
    return text if len(text) <= 297 else text[:297] + '…'


@api_view(['GET'])
def messages_list(request):
    saved = dict(MessageTemplate.objects.values_list('key', 'text'))
    return Response([_entry(key, saved) for key in TEMPLATES])


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def messages_public(request):
    """The few messages the parents' registration page builds (no login there)."""
    saved = dict(MessageTemplate.objects.values_list('key', 'text'))
    return Response({key: saved.get(key, spec['text']) for key, spec in TEMPLATES.items() if spec['public']})


@api_view(['PUT', 'DELETE'])
def message_detail(request, key):
    """Management edits one message's wording (PUT) or puts the original back (DELETE)."""
    require_role(request, MANAGEMENT)
    if key not in TEMPLATES:
        raise NotFound('Mesej tidak dijumpai.')
    spec = TEMPLATES[key]
    old = current_text(key)
    with transaction.atomic():
        if request.method == 'DELETE':
            MessageTemplate.objects.filter(key=key).delete()
        else:
            text = str(request.data.get('text') or '').replace('\r\n', '\n').strip()
            allowed = {n for n, _, _ in spec['placeholders']}
            if not text or len(text) > 1500:
                raise ValidationError({'text': 'Teks mesej diperlukan (paling panjang 1,500 aksara).'})
            unknown = sorted(set(PLACEHOLDER.findall(text)) - allowed)
            if unknown:
                raise ValidationError({'text': 'Penanda tidak dikenali: ' + ', '.join('{' + u + '}' for u in unknown) + '.'})
            missing = [r for r in spec['required'] if '{' + r + '}' not in text]
            if missing:
                raise ValidationError({'text': 'Mesej mesti mengandungi: ' + ', '.join('{' + m + '}' for m in missing) + '.'})
            MessageTemplate.objects.update_or_create(key=key, defaults={'text': text})
        new = current_text(key)
        if new != old:
            SettingEvent.objects.create(key=f'MSG_{key}', label=f"Mesej: {spec['label']}", old_value=_short(old), new_value=_short(new),
                                        by_name=display_name(request.user))
    saved = dict(MessageTemplate.objects.values_list('key', 'text'))
    return Response(_entry(key, saved))
