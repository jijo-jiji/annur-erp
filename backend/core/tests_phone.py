"""The telephone number rule (core/phone.py): what is stored, what is accepted, how it reads, and the settings behind that."""
import json
from datetime import date
from io import StringIO
from pathlib import Path
from django.core.management import call_command
from django.test import SimpleTestCase
from business_config.models import BusinessSetting
from core import phone
from core.permissions import ADMIN, MANAGEMENT
from expenses.serializers import VendorSerializer
from students.models import Lead, Student
from students.tests import Phase2Base
from teachers.models import StaffMember, Teacher
from teachers.serializers import StaffMemberSerializer, TeacherSerializer

CASES = json.loads((Path(__file__).parent / 'phone_cases.json').read_text(encoding='utf-8'))


class PhoneRuleTests(SimpleTestCase):
    """The same table of cases the browser is tested with (frontend/src/lib/phone.test.js)."""

    def test_what_is_stored_for_what_was_typed(self):
        for typed, stored in CASES['normalize']:
            self.assertEqual(phone.normalize(typed), stored, repr(typed))

    def test_how_a_number_reads(self):
        for value, prefix, separator, shown in CASES['display']:
            self.assertEqual(phone.display(value, prefix, separator), shown, (value, prefix, separator))

    def test_what_the_box_shows(self):
        for value, style, shown in CASES['input']:
            self.assertEqual(phone.to_input(value, style), shown, (value, style))

    def test_a_cleaned_number_is_cleaned_again_to_itself(self):
        for typed, stored in CASES['normalize']:
            if stored:
                self.assertEqual(phone.normalize(stored), stored)


class SavedInTheStoredFormTests(Phase2Base):
    def register(self, **fields):
        self.as_role(ADMIN)
        payload = {'full_name': 'Aina', 'ic_number': '0', 'form_level': 'F5', 'school_name': 'SK Telipot', 'parent1_name': 'Ibu', 'parent1_phone': '012-345 6789',
                   'class_ids': [], **fields}
        return self.client.post('/api/v1/students/students/', payload, format='json')

    def test_a_student_and_both_parents_are_saved_in_the_stored_form(self):
        res = self.register(phone_number='0133474009', parent1_phone='012-345 6789', parent2_phone='+6013-347-4009')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data['phone_number'], res.data['parent1_phone'], res.data['parent2_phone']), ('60133474009', '60123456789', '60133474009'))

    def test_a_number_that_is_not_one_number_is_refused_with_the_field_named(self):
        for bad in ('1-300-88-5454', '012-3456789 / 013-1112222', 'tiada', '12345'):
            res = self.register(parent1_phone=bad)
            self.assertEqual(res.status_code, 400, bad)
            self.assertIn('parent1_phone', res.data)
            self.assertIn('Nombor telefon tidak sah', str(res.data['parent1_phone']))
        self.assertEqual(self.register(parent1_phone='').status_code, 400)  # the first parent's number is still required

    def test_an_old_number_nobody_can_convert_does_not_block_saving_the_rest(self):
        student = Student.objects.create(student_id='AN-7001', full_name='Lama', ic_number='1', form_level='F5', join_date=date.today(), status='ACTIVE',
                                         parent1_name='P', parent1_phone='1-300-88-5454')
        self.as_role(ADMIN)
        url = f'/api/v1/students/students/{student.id}/'
        self.assertEqual(self.client.patch(url, {'full_name': 'Lama Baru'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(url, {'parent1_phone': '1-300-88-5454'}, format='json').status_code, 200)  # unchanged
        self.assertEqual(self.client.patch(url, {'parent1_phone': '1-300-99-9999'}, format='json').status_code, 400)  # a new one must be a number
        self.assertEqual(self.client.patch(url, {'parent1_phone': '013-347 4009'}, format='json').data['parent1_phone'], '60133474009')

    def test_prospects_teachers_staff_and_vendors_are_saved_the_same_way(self):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/students/leads/', {'phone': '019-988 1122', 'lead_source': 'TIKTOK'}, format='json')
        self.assertEqual((res.status_code, res.data['phone']), (201, '60199881122'), res.data)
        self.assertEqual(self.client.post('/api/v1/students/leads/', {'phone': 'hubungi esok', 'lead_source': 'TIKTOK'}, format='json').status_code, 400)

        teacher = Teacher.objects.create(teacher_code='TT', full_name='Cikgu', phone_number='x')
        ser = TeacherSerializer(teacher, data={'phone_number': '019-911 0001'}, partial=True)
        self.assertTrue(ser.is_valid(), ser.errors)
        self.assertEqual(ser.validated_data['phone_number'], '60199110001')

        staff = StaffMember.objects.create(staff_id='ST-7001', name='Staf', phone='x', role='Kerani', join_date=date.today())
        ser = StaffMemberSerializer(staff, data={'phone': '013-9123456', 'emergency_phone': '09-7441234'}, partial=True)
        self.assertTrue(ser.is_valid(), ser.errors)
        self.assertEqual((ser.validated_data['phone'], ser.validated_data['emergency_phone']), ('60139123456', '6097441234'))

        ser = VendorSerializer(data={'vendor_id': 'V1', 'vendor_name': 'Kedai', 'phone_number': '09-7437777'})
        self.assertTrue(ser.is_valid(), ser.errors)
        self.assertEqual(ser.validated_data['phone_number'], '6097437777')

    def test_the_centres_own_numbers_follow_the_same_rule(self):
        self.as_role(MANAGEMENT)
        res = self.client.put('/api/v1/centre/profile/', {'phone': '09-7441234', 'whatsapp': '013-983 8085'}, format='json')
        self.assertEqual((res.status_code, res.data['phone'], res.data['whatsapp']), (200, '6097441234', '60139838085'), res.data)
        self.assertEqual(self.client.put('/api/v1/centre/profile/', {'phone': '12'}, format='json').status_code, 400)


class FormatSettingsTests(Phase2Base):
    def test_management_chooses_how_numbers_read_and_are_typed(self):
        self.assertEqual(phone.shown('60133474009'), '+6013-347-4009')  # the default
        self.as_role(MANAGEMENT)
        res = self.client.put('/api/v1/thresholds/', {'phone_prefix': '0', 'phone_separator': 'space', 'phone_input': '0'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(phone.shown('60133474009'), '013 347 4009')
        listed = {row['name']: row for row in res.data}
        self.assertEqual(listed['phone_input']['value'], '0')
        self.assertEqual([o['value'] for o in listed['phone_prefix']['options']], ['plus60', '60', '0'])
        # nothing saved was rewritten
        Student.objects.create(student_id='AN-7002', full_name='A', ic_number='1', form_level='F5', join_date=date.today(), parent1_name='P', parent1_phone='60133474009')
        self.assertEqual(Student.objects.get(student_id='AN-7002').parent1_phone, '60133474009')

    def test_only_the_listed_choices_are_accepted_and_only_management_may_change_them(self):
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.put('/api/v1/thresholds/', {'phone_prefix': '+66'}, format='json').status_code, 400)
        self.assertEqual(self.client.put('/api/v1/thresholds/', {'phone_separator': ''}, format='json').status_code, 400)
        self.as_role(ADMIN)
        self.assertEqual(self.client.put('/api/v1/thresholds/', {'phone_prefix': '0'}, format='json').status_code, 403)

    def test_a_damaged_saved_setting_falls_back_to_the_default(self):
        BusinessSetting.objects.create(key='PHONE_PREFIX', value='banyak')
        self.assertEqual(phone.shown('60133474009'), '+6013-347-4009')


class NormalizePhonesCommandTests(Phase2Base):
    def setUp(self):
        super().setUp()
        base = dict(ic_number='1', form_level='F5', join_date=date.today(), status='ACTIVE', parent1_name='P')
        self.clean = Student.objects.create(student_id='AN-7101', full_name='Betul', parent1_phone='60133474009', **base)
        self.old = Student.objects.create(student_id='AN-7102', full_name='Lama', parent1_phone='012-345 6789', parent2_phone='1-300-88-5454', **base)
        self.lead = Lead.objects.create(lead_id='LD-7101', phone='019-988 1122')
        BusinessSetting.objects.update_or_create(key='CENTER_PHONE', defaults={'value': '013-983 8085'})

    def run_command(self, *args):
        out = StringIO()
        call_command('normalize_phones', *args, stdout=out)
        return out.getvalue()

    def test_without_apply_it_only_reports(self):
        report = self.run_command()
        self.assertIn('akan ditukar', report)
        self.assertIn('012-345 6789  ->  60123456789', report)
        self.assertIn('1-300-88-5454', report)  # listed as not understood
        self.old.refresh_from_db()
        self.assertEqual(self.old.parent1_phone, '012-345 6789')

    def test_apply_rewrites_what_it_understands_and_leaves_the_rest_alone(self):
        self.run_command('--apply', '--skip-backup')
        self.old.refresh_from_db()
        self.assertEqual((self.old.parent1_phone, self.old.parent2_phone), ('60123456789', '1-300-88-5454'))
        self.assertEqual(Student.objects.get(pk=self.clean.pk).parent1_phone, '60133474009')
        self.assertEqual(Lead.objects.get(pk=self.lead.pk).phone, '60199881122')
        self.assertEqual(BusinessSetting.objects.get(key='CENTER_PHONE').value, '60139838085')
        self.assertIn('0 akan ditukar', self.run_command())  # a second run finds nothing to do
