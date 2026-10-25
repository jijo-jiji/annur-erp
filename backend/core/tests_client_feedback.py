"""Tests for the October 2026 client feedback (CLIENT_FEEDBACK_PLAN.md), one class per phase."""
import json
from datetime import date
from importlib import import_module
from django.apps import apps as django_apps
from django.contrib.auth.models import Group, User
from rest_framework.test import APITestCase
from academic.models import ClassTimetable, TimeSlot
from business_config.models import BusinessSetting, DynamicMasterData, PricingTier, SubjectMaster
from core.permissions import ADMIN, ALL_ROLES, MANAGEMENT, SUPERVISOR
from expenses.models import PaymentVoucher, Vendor
from students.models import ResultSubmission, Student


class FeedbackBase(APITestCase):
    def setUp(self):
        self.users = {}
        for role in ALL_ROLES:
            g, _ = Group.objects.get_or_create(name=role)
            u = User.objects.create_user(username=role.lower(), password='x-pass-123')
            u.groups.add(g)
            self.users[role] = u
        BusinessSetting.objects.create(key='REGISTRATION_FEE', value='30.00')
        PricingTier.objects.create(level_category='SECONDARY', subject_count=1, price_per_subject=60, total_price=60)
        self.slot = TimeSlot.objects.create(day='JUMAAT', start_time='09:00', end_time='10:30', period_label='Pagi')
        self.fizik = SubjectMaster.objects.create(code='FZ', name='Fizik', level_category='UPPER_SEC', stream='SAINS')
        self.fz = ClassTimetable.objects.create(slot=self.slot, form_level='F5', section='A', max_seats=10, subject=self.fizik)

    def as_role(self, role):
        self.client.force_authenticate(self.users[role])

    def register(self, name='Ali', class_ids=None):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/students/students/', {
            'full_name': name, 'ic_number': '090101-03-1234', 'form_level': 'F5', 'school_name': 'SK Telipot',
            'parent1_name': 'Bapa', 'parent1_phone': '012-345 6789', 'class_ids': class_ids if class_ids is not None else [self.fz.id],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data


class PhaseAQuickFixTests(FeedbackBase):
    def setUp(self):
        super().setUp()
        add = lambda cat, code, label, meta=None: DynamicMasterData.objects.create(
            category=cat, code=code, label=label, meta_info=meta or {}, status='APPROVED')
        add('18_expense_cat', 'UTILITI', 'Utiliti')
        add('18_expense_cat', 'SEWA', 'Sewa')
        add('19_expense_subcat', 'SUB_TNB', 'TNB', {'cat': 'UTILITI'})
        add('19_expense_subcat', 'SUB_AIR', 'Air', {'cat': 'UTILITI'})
        self.vendor = Vendor.objects.create(vendor_id='VND-0007', vendor_name='Kedai')

    def voucher(self, **fields):
        self.as_role(ADMIN)
        return self.client.post('/api/v1/expenses/vouchers/', {
            'vendor': self.vendor.id, 'amount': 100, 'items_description': 'Bil', **fields}, format='json')

    def test_voucher_keeps_the_codes_and_a_subcategory_must_belong_to_its_category(self):
        ok = self.voucher(category_code='UTILITI', subcategory_code='SUB_TNB')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual((ok.data['category'], ok.data['subcategory'], ok.data['category_code'], ok.data['subcategory_code']),
                         ('Utiliti', 'TNB', 'UTILITI', 'SUB_TNB'))
        wrong = self.voucher(category_code='SEWA', subcategory_code='SUB_TNB')
        self.assertEqual(wrong.status_code, 400)
        self.assertIn('bukan di bawah kategori Sewa', str(wrong.data['subcategory']))

    def test_a_category_with_subcategories_needs_one_and_one_without_does_not(self):
        self.assertEqual(self.voucher(category_code='UTILITI').status_code, 400)
        self.assertEqual(self.voucher(category_code='SEWA').status_code, 201)

    def test_labels_alone_still_work_and_are_linked_when_they_match_the_list(self):
        res = self.voucher(category='Utiliti', subcategory='Air')
        self.assertEqual((res.data['category_code'], res.data['subcategory_code']), ('UTILITI', 'SUB_AIR'))
        free = self.voucher(category='Kategori lama')  # not in the list: kept as typed, as older records were
        self.assertEqual(free.status_code, 201, free.data)
        self.assertEqual(free.data['category_code'], '')

    def test_budget_follows_the_code_when_a_category_is_renamed(self):
        self.voucher(category_code='SEWA')
        DynamicMasterData.objects.filter(code='SEWA').update(label='Sewa premis')
        self.as_role(MANAGEMENT)
        listed = self.client.get('/api/v1/expenses/vouchers/matching/', {'category': 'Sewa premis'}).data
        self.assertEqual(listed['count'], 1)

    def test_a_new_supplier_gets_a_company_code_and_a_known_supply_type(self):
        self.as_role(MANAGEMENT)
        res = self.client.post('/api/v1/change-requests/', {
            'kind': 'VENDOR', 'action': 'CREATE', 'note': 'baharu',
            'payload': {'vendor_id': '', 'vendor_name': 'Paip Jaya', 'supply_type': 'PAIP'}}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        made = Vendor.objects.get(vendor_name='Paip Jaya')
        self.assertEqual((made.vendor_id, made.supply_type), ('VND-0008', 'PAIP'))
        bad = self.client.post('/api/v1/change-requests/', {
            'kind': 'VENDOR', 'action': 'CREATE', 'note': 'x', 'payload': {'vendor_name': 'Y', 'supply_type': 'TIADA'}}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_a_new_subject_is_grouped_by_its_stream_unless_given_a_category(self):
        self.as_role(SUPERVISOR)
        for code, extra in (('KIM', {}), ('SEN', {'category': 'ELEKTIF'})):
            res = self.client.post('/api/v1/change-requests/', {
                'kind': 'SUBJECT', 'action': 'CREATE', 'note': 'x',
                'payload': {'code': code, 'name': code, 'level_category': 'UPPER_SEC', 'stream': 'SAINS', **extra}}, format='json')
            self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(SubjectMaster.objects.get(code='KIM').category, 'SAINS')
        self.assertEqual(SubjectMaster.objects.get(code='SEN').category, 'ELEKTIF')
        bad = self.client.post('/api/v1/change-requests/', {
            'kind': 'SUBJECT', 'action': 'CREATE', 'note': 'x',
            'payload': {'code': 'X1', 'name': 'X', 'level_category': 'UPPER_SEC', 'category': 'TIADA'}}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_a_rejected_registration_is_corrected_and_sent_again(self):
        student = self.register()
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/students/students/{student['id']}/reject/", {'comment': 'IC salah'}, format='json')
        self.as_role(ADMIN)
        rejected = self.client.get(f"/api/v1/students/students/{student['id']}/").data
        self.assertEqual((rejected['status'], rejected['enrolled_classes']), ('REJECTED', []))
        self.assertEqual(rejected['resubmit_class_ids'], [self.fz.id])  # the choices are offered again

        fixed = self.client.patch(f"/api/v1/students/students/{student['id']}/", {'ic_number': '090101-03-9999'}, format='json')
        self.assertEqual(fixed.status_code, 200, fixed.data)
        res = self.client.post(f"/api/v1/students/students/{student['id']}/resubmit/",
                               {'class_ids': rejected['resubmit_class_ids'], 'note': 'IC dibetulkan'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data['status'], res.data['enrolled_classes'], res.data['registration_comment']), ('PENDING', [self.fz.id], ''))
        self.assertEqual(res.data['student_id'], student['student_id'])  # same record, same ID
        events = [e.event_type for e in Student.objects.get(pk=student['id']).events.order_by('id')]
        self.assertEqual(events[-3:-1], ['REJECTED', 'RESUBMITTED'])
        again = self.client.post(f"/api/v1/students/students/{student['id']}/resubmit/", {}, format='json')
        self.assertEqual(again.status_code, 400)  # only a rejected registration can be sent again

    def test_the_public_form_lists_the_grade_s_subjects_by_category_without_a_login(self):
        # the categories come from the migration: Teras, Sains, Sastera / Akaun, Elektif in that order
        bm = SubjectMaster.objects.create(code='BM', name='Bahasa Melayu', level_category='UPPER_SEC', stream='TERAS', category='TERAS')
        ClassTimetable.objects.create(slot=self.slot, form_level='F5', section='B', max_seats=10, subject=bm)
        SubjectMaster.objects.create(code='SEN', name='Seni', level_category='UPPER_SEC', category='ELEKTIF')  # no class: not offered
        self.client.credentials(HTTP_AUTHORIZATION='Token stale')  # a stale token must not block the form
        res = self.client.get('/api/v1/public/subjects/', {'form': 'F5'})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([(g['label'], [s['name'] for s in g['subjects']]) for g in res.data],
                         [('Teras', ['Bahasa Melayu']), ('Sains', ['Fizik'])])
        self.assertEqual(self.client.get('/api/v1/public/subjects/', {'form': 'F4'}).data, [])


class PhaseBStudentCodeTests(FeedbackBase):
    def make(self, code, joined):
        return Student.objects.create(student_id=code, full_name=code, ic_number='1', form_level='F5', phone_number='1', join_date=joined, status='ACTIVE')

    def test_a_new_student_gets_hq_year_and_the_next_running_number(self):
        yy = date.today().year % 100
        first = self.register('Ali')['student_id']
        self.assertEqual(first, f'HQ-{yy:02d}0001')
        self.make('HQ-250041', date(2025, 6, 1))  # an earlier year: its number still counts
        self.assertEqual(self.register('Abu')['student_id'], f'HQ-{yy:02d}0042')
        BusinessSetting.objects.create(key='PREFIX_STUDENT', value='TN')  # a new prefix carries on the same count
        self.assertEqual(self.register('Ahmad')['student_id'], f'TN-{yy:02d}0043')

    def test_existing_students_are_renumbered_in_registration_order_and_keep_their_old_code(self):
        migration = import_module('students.migrations.0014_previous_student_id_and_new_codes')
        BusinessSetting.objects.create(key='PREFIX_STUDENT', value='AN')  # the old default becomes HQ
        later = self.make('AN-2026-002', date(2026, 3, 1))
        earliest = self.make('AN-2025-007', date(2025, 11, 5))
        same_day = self.make('AN-2026-001', date(2026, 3, 1))
        migration.renumber(django_apps, None)
        codes = {s.pk: (s.student_id, s.previous_student_id) for s in Student.objects.all()}
        self.assertEqual(codes[earliest.pk], ('HQ-250001', 'AN-2025-007'))
        self.assertEqual(codes[later.pk], ('HQ-260002', 'AN-2026-002'))  # same day: the one registered first
        self.assertEqual(codes[same_day.pk], ('HQ-260003', 'AN-2026-001'))
        self.assertEqual(BusinessSetting.objects.get(key='PREFIX_STUDENT').value, 'HQ')
        self.as_role(ADMIN)
        listed = self.client.get(f'/api/v1/students/students/{later.pk}/').data
        self.assertEqual((listed['student_id'], listed['previous_student_id']), ('HQ-260002', 'AN-2026-002'))
        self.client.patch(f'/api/v1/students/students/{later.pk}/', {'previous_student_id': 'X'}, format='json')
        self.assertEqual(Student.objects.get(pk=later.pk).previous_student_id, 'AN-2026-002')  # not editable

    def test_a_prefix_the_centre_chose_itself_is_kept(self):
        migration = import_module('students.migrations.0014_previous_student_id_and_new_codes')
        BusinessSetting.objects.create(key='PREFIX_STUDENT', value='TN')
        s = self.make('TN-2026-001', date(2026, 1, 5))
        migration.renumber(django_apps, None)
        self.assertEqual(Student.objects.get(pk=s.pk).student_id, 'TN-260001')


class PhaseCSchoolResultsTests(FeedbackBase):
    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()  # the wrong-IC counter of the public form
        self.kimia = SubjectMaster.objects.create(code='KM', name='Kimia', level_category='UPPER_SEC', stream='SAINS')
        self.student = self.register('Ali')
        self.pk = self.student['id']

    def grid(self, term, rows, year=2026, pk=None):
        return self.client.post('/api/v1/students/results/grid/', {'student': pk or self.pk, 'year': year, 'term': term, 'rows': rows}, format='json')

    def results(self):
        return {(r.year, r.term, r.subject.code): (r.mark, r.grade, r.source) for r in Student.objects.get(pk=self.pk).exam_results.all()}

    def test_a_term_is_entered_in_one_grid_and_a_blank_row_removes_a_result(self):
        self.as_role(ADMIN)
        res = self.grid('PENGGAL_1', [{'subject': self.fizik.id, 'mark': 72}, {'subject': self.kimia.id, 'mark': 38}])
        self.assertEqual(res.data, {'saved': 2, 'removed': 0})
        self.grid('PENGGAL_1', [{'subject': self.fizik.id, 'mark': 81}, {'subject': self.kimia.id, 'mark': ''}])
        self.assertEqual(self.results(), {(2026, 'PENGGAL_1', 'FZ'): (81, 'A', 'STAFF')})
        self.grid('PENGGAL_1', [{'subject': self.fizik.id, 'mark': 60}], year=2025)  # another year is another result
        self.assertEqual(len(self.results()), 2)
        self.assertEqual(self.grid('PENGGAL_1', [{'subject': self.fizik.id, 'mark': 101}]).status_code, 400)
        self.assertIn('Fizik', str(self.grid('PENGGAL_1', [{'subject': self.fizik.id, 'mark': 'x'}]).data))

    def test_spm_takes_a_grade_only_and_only_for_tingkatan_5(self):
        self.as_role(ADMIN)
        self.grid('SPM', [{'subject': self.fizik.id, 'mark': 95, 'grade': 'a+'}])
        self.assertEqual(self.results()[(2026, 'SPM', 'FZ')], (None, 'A+', 'STAFF'))
        self.assertEqual(self.grid('SPM', [{'subject': self.fizik.id, 'grade': 'Z'}]).status_code, 400)
        f4 = Student.objects.create(student_id='HQ-269999', full_name='Abu', ic_number='1', form_level='F4', join_date=date(2026, 1, 1), status='ACTIVE')
        res = self.grid('PERCUBAAN_SPM', [{'subject': self.fizik.id, 'mark': 50}], pk=f4.pk)
        self.assertEqual(res.status_code, 400)
        self.assertIn('Tingkatan 5', str(res.data))

    def test_saving_the_same_exam_and_subject_again_updates_it(self):
        self.as_role(ADMIN)
        body = {'student': self.pk, 'year': 2026, 'term': 'PERTENGAHAN', 'subject': self.fizik.id, 'mark': 55}
        self.assertEqual(self.client.post('/api/v1/students/results/', body, format='json').status_code, 201)
        again = self.client.post('/api/v1/students/results/', {**body, 'mark': 66}, format='json')
        self.assertEqual((again.status_code, again.data['grade']), (201, 'B+'))
        self.assertEqual(self.results(), {(2026, 'PERTENGAHAN', 'FZ'): (66, 'B+', 'STAFF')})

    def test_a_whole_class_is_entered_for_a_term(self):
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/students/students/{self.pk}/approve/")
        res = self.client.post('/api/v1/students/results/bulk/', {
            'class_id': self.fz.id, 'year': 2026, 'term': 'AKHIR', 'marks': {self.student['student_id']: 47}}, format='json')
        self.assertEqual(res.data, {'saved': 1})
        self.assertEqual(self.results(), {(2026, 'AKHIR', 'FZ'): (47, 'D', 'STAFF')})

    def check(self, code=None, ic='1234'):
        self.client.force_authenticate(None)
        return self.client.post('/api/v1/public/results/check/', {'student_code': code or self.student['student_id'], 'ic_last4': ic}, format='json')

    def test_the_public_form_checks_the_student_code_and_ic_and_locks_after_wrong_tries(self):
        ok = self.check()
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data['name'], 'Ali')
        self.assertIn('SPM', [t['code'] for t in ok.data['terms']])  # Tingkatan 5
        self.assertEqual(ok.data['subjects'][0], {'id': self.fizik.id, 'name': 'Fizik', 'tuition': True})  # tuition subjects first
        self.assertEqual(self.check(code=self.student['student_id'].lower()).status_code, 200)
        for _ in range(5):
            self.assertEqual(self.check(ic='0000').status_code, 400)
        locked = self.check()
        self.assertEqual(locked.status_code, 400)
        self.assertIn('Terlalu banyak cubaan', str(locked.data))

    def submit(self, rows, **extra):
        self.client.force_authenticate(None)
        return self.client.post('/api/v1/public/results/', {
            'student_code': self.student['student_id'], 'ic_last4': '1234', 'year': 2026, 'term': 'PENGGAL_2',
            'rows': json.dumps(rows), 'submitted_by': 'Bapa Ali', 'relation': 'Bapa', **extra}, format='multipart')

    def test_results_from_the_public_form_wait_for_review_and_approval_copies_them(self):
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image
        buf = BytesIO()
        Image.new('RGB', (4, 4)).save(buf, 'PNG')
        sent = self.submit([{'subject': self.fizik.id, 'mark': 64}, {'subject': self.kimia.id, 'mark': ''}],
                           slip=SimpleUploadedFile('slip.png', buf.getvalue(), content_type='image/png'))
        self.assertEqual(sent.status_code, 201, sent.data)
        self.assertEqual((sent.data['count'], sent.data['replaced']), (1, False))
        self.assertEqual(self.results(), {})  # nothing saved before review
        again = self.submit([{'subject': self.fizik.id, 'mark': 68}])
        self.assertTrue(again.data['replaced'])  # one pending submission per exam

        self.as_role(ADMIN)
        queue = self.client.get('/api/v1/students/result-submissions/', {'status': 'PENDING'}).data
        self.assertEqual(len(queue), 1)
        self.assertEqual(queue[0]['rows_detail'][0]['subject_name'], 'Fizik')
        self.assertEqual(queue[0]['slip']['name'], 'slip.png')
        self.assertEqual(self.client.get(queue[0]['slip']['url']).status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/students/result-submissions/{queue[0]['id']}/reject/", {}, format='json').status_code, 400)
        done = self.client.post(f"/api/v1/students/result-submissions/{queue[0]['id']}/approve/", {}, format='json')
        self.assertEqual(done.data['status'], 'APPROVED', done.data)
        self.assertEqual(self.results(), {(2026, 'PENGGAL_2', 'FZ'): (68, 'B+', 'PARENT')})
        self.assertEqual(self.client.post(f"/api/v1/students/result-submissions/{queue[0]['id']}/approve/", {}, format='json').status_code, 400)

    def test_the_public_form_refuses_subjects_outside_the_student_s_level_and_empty_sends(self):
        primary = SubjectMaster.objects.create(code='BM_P', name='BM Rendah', level_category='PRIMARY')
        self.assertEqual(self.submit([{'subject': primary.id, 'mark': 50}]).status_code, 400)
        self.assertEqual(self.submit([{'subject': self.fizik.id, 'mark': ''}]).status_code, 400)
        self.assertEqual(self.submit([{'subject': self.fizik.id, 'mark': 50}], submitted_by='').status_code, 400)

    def test_the_sender_s_phone_is_kept_in_the_one_stored_form(self):
        self.assertEqual(self.submit([{'subject': self.fizik.id, 'mark': 50}], phone='012').status_code, 400)
        self.assertEqual(self.submit([{'subject': self.fizik.id, 'mark': 50}], phone='013-347 4009').status_code, 201)
        self.assertEqual(ResultSubmission.objects.get().phone, '60133474009')
