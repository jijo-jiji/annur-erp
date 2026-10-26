"""Tests for the October 2026 client feedback (CLIENT_FEEDBACK_PLAN.md), one class per phase."""
import json
from datetime import date
from importlib import import_module
from django.apps import apps as django_apps
from django.contrib.auth.models import Group, User
from django.core.cache import cache
from rest_framework.test import APITestCase
from academic.models import ClassTimetable, TimeSlot
from business_config.models import BusinessSetting, DynamicMasterData, PricingTier, SubjectMaster
from core.permissions import ADMIN, ALL_ROLES, MANAGEMENT, SUPERVISOR
from expenses.models import PaymentVoucher, Vendor
from students.models import ResultSubmission, Student, StudentExamResult


class FeedbackBase(APITestCase):
    def setUp(self):
        cache.clear()  # the public pages' rate limits count every test's posts from the same address
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


class PhaseDFeesAndCounterTests(FeedbackBase):
    def setUp(self):
        super().setUp()
        from billing.models import Invoice
        self.student = Student.objects.create(student_id='HQ-260001', full_name='Ali', ic_number='090101-03-1234', form_level='F5',
                                              join_date=date(2026, 1, 1), status='ACTIVE', parent1_name='Bapa', parent1_phone='60123456789')
        self.invoice = self.new_invoice(240)
        self.today = date.today()

    def new_invoice(self, fee, number=None):
        from billing.models import Invoice
        number = number or f'INV-2026-{Invoice.objects.count() + 1:04d}'
        return Invoice.objects.create(invoice_number=number, student=self.student, billing_month=date(2026, 10, 1), invoice_type='MONTHLY',
                                      registration_fee=0, monthly_fee=fee, total_payable=fee, balance_due=fee, due_date=date(2099, 1, 7))

    def pay(self, amount, method='CASH', invoice=None, role=ADMIN, **extra):
        self.as_role(role)
        res = self.client.post('/api/v1/billing/receipts/', {
            'invoice': (invoice or self.invoice).id, 'amount_paid': amount, 'payment_method': method, 'payment_type': 'MONTHLY', **extra,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def correct(self, receipt, action='UPDATE', payload=None, note='Amaun salah ditaip', role=ADMIN):
        self.as_role(role)
        return self.client.post('/api/v1/change-requests/', {
            'kind': 'RECEIPT', 'action': action, 'target_id': receipt['id'], 'payload': payload or {}, 'note': note}, format='json')

    def refresh(self):
        self.invoice.refresh_from_db()
        self.student.refresh_from_db()

    def test_a_receipt_is_never_deleted_and_the_proof_locks_once_it_is_cancelled(self):
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image
        receipt = self.pay(100)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.delete(f"/api/v1/billing/receipts/{receipt['id']}/").status_code, 405)

        def proof():
            buf = BytesIO()
            Image.new('RGB', (4, 4)).save(buf, 'PNG')
            return SimpleUploadedFile('slip.png', buf.getvalue(), content_type='image/png')
        self.as_role(ADMIN)
        sent = self.client.post('/api/v1/files/', {'kind': 'PAYMENT_PROOF', 'object_id': receipt['id'], 'file': proof()}, format='multipart')
        self.assertEqual(sent.status_code, 201, sent.data)
        self.assertEqual(self.correct(receipt, 'DELETE', role=SUPERVISOR).status_code, 201)
        locked = self.client.post('/api/v1/files/', {'kind': 'PAYMENT_PROOF', 'object_id': receipt['id'], 'file': proof()}, format='multipart')
        self.assertEqual(locked.status_code, 403)
        self.assertEqual(self.client.get('/api/v1/files/', {'kind': 'PAYMENT_PROOF', 'object_id': receipt['id']}).status_code, 200)

    def test_admin_asks_to_correct_a_receipt_and_it_is_cancelled_and_reissued_only_on_approval(self):
        receipt = self.pay(100)
        self.assertEqual(self.correct(receipt, payload={'amount_paid': '120.00'}, note='').status_code, 400)  # a reason is required
        asked = self.correct(receipt, payload={'amount_paid': '120.00'})
        self.assertEqual((asked.status_code, asked.data['status'], asked.data['action_label']), (201, 'PENDING', 'Betulkan'), asked.data)
        self.assertEqual(self.correct(receipt, payload={'notes': 'x'}).status_code, 400)  # one request per receipt at a time
        self.refresh()
        self.assertEqual(self.invoice.balance_due, 140)  # nothing changes before approval

        self.as_role(SUPERVISOR)
        done = self.client.post(f"/api/v1/change-requests/{asked.data['id']}/approve/", {}, format='json')
        self.assertEqual(done.data['status'], 'APPROVED', done.data)
        rows = {r['receipt_number']: r for r in self.client.get('/api/v1/billing/receipts/').data}
        old = rows[receipt['receipt_number']]
        self.assertEqual((old['status'], old['cancel_reason'], old['cancelled_by']), ('CANCELLED', 'Amaun salah ditaip', 'supervisor'))
        new = rows[old['replaced_by_number']]
        self.assertEqual((new['status'], new['amount_paid'], new['replaces_number'], new['received_by']),
                         ('VALID', '120.00', receipt['receipt_number'], 'admin'))
        self.assertNotEqual(new['receipt_number'], receipt['receipt_number'])
        self.refresh()
        self.assertEqual((self.invoice.total_paid, self.invoice.balance_due), (120, 120))
        # cancelled money is not collected money: the dashboard figure and the list it opens agree
        self.assertEqual(self.client.get('/api/v1/dashboard/summary/').data['finance']['collected_today'], 120.0)
        matching = self.client.get('/api/v1/billing/receipts/matching/', {'from': self.today.isoformat(), 'to': self.today.isoformat()}).data
        self.assertEqual((matching['count'], matching['total']), (1, 120.0))
        self.assertEqual(self.client.get('/api/v1/billing/invoices/').data[0]['latest_receipt'], new['receipt_number'])
        for pk in (old['id'], new['id']):  # the cancelled one prints marked DIBATALKAN, the new one names the one it replaces
            pdf = self.client.get(f'/api/v1/billing/receipts/{pk}/pdf/')
            self.assertEqual((pdf.status_code, pdf['Content-Type']), (200, 'application/pdf'))

    def test_an_approver_s_own_correction_applies_at_once_but_still_needs_a_reason(self):
        receipt = self.pay(100)
        self.assertEqual(self.correct(receipt, 'DELETE', note='', role=SUPERVISOR).status_code, 400)
        done = self.correct(receipt, 'DELETE', note='Bayaran berganda', role=SUPERVISOR)
        self.assertEqual((done.data['status'], done.data['action_label']), ('APPROVED', 'Batalkan'))
        self.refresh()
        self.assertEqual((self.invoice.total_paid, self.invoice.balance_due, self.invoice.status), (0, 240, 'UNPAID'))
        self.assertEqual(self.correct(receipt, 'DELETE', note='lagi', role=SUPERVISOR).status_code, 400)  # already cancelled
        # the cancelled number is never given out again
        nxt = self.pay(50)
        self.assertGreater(nxt['receipt_number'], receipt['receipt_number'])

    def test_cancelling_takes_back_the_overpayment_credit_and_is_refused_once_that_credit_is_spent(self):
        receipt = self.pay(300)  # 60 above the invoice becomes credit
        self.refresh()
        self.assertEqual(self.student.credit_balance, 60)
        self.correct(receipt, 'DELETE', note='Salah pelajar', role=SUPERVISOR)
        self.refresh()
        self.assertEqual((self.student.credit_balance, self.invoice.balance_due), (0, 240))

        again = self.pay(300)
        second = self.new_invoice(100)
        self.as_role(ADMIN)
        self.client.post(f'/api/v1/billing/invoices/{second.id}/apply_credit/', {}, format='json')
        refused = self.correct(again, 'DELETE', note='Salah pelajar', role=SUPERVISOR)
        self.assertEqual(refused.status_code, 400)
        self.assertIn('kredit', str(refused.data))

    def test_an_unpaid_invoice_is_changed_with_a_reason_and_approval_and_its_discount_follows_the_fee(self):
        from billing.models import Discount
        self.invoice.discount = Discount.objects.create(name='Adik-beradik', code='SIB10', mode='PERCENT', value=10)
        self.invoice.discount_amount, self.invoice.total_payable, self.invoice.balance_due = 24, 216, 216
        self.invoice.save()
        self.as_role(ADMIN)
        asked = self.client.post('/api/v1/change-requests/', {'kind': 'INVOICE', 'action': 'UPDATE', 'target_id': self.invoice.id,
                                                              'payload': {'monthly_fee': '200'}, 'note': 'Pakej salah'}, format='json')
        self.assertEqual(asked.data['status'], 'PENDING', asked.data)
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/change-requests/{asked.data['id']}/approve/", {}, format='json')
        self.refresh()
        self.assertEqual((self.invoice.monthly_fee, self.invoice.discount_amount, self.invoice.total_payable, self.invoice.balance_due), (200, 20, 180, 180))
        history = self.client.get('/api/v1/change-requests/', {'kind': 'INVOICE', 'target': self.invoice.id}).data
        self.assertEqual(history[0]['changes'][0], {'field': 'monthly_fee', 'label': 'Yuran', 'before': 'RM 240.00', 'after': 'RM 200.00'})

        self.pay(50)
        paid = self.client.post('/api/v1/change-requests/', {'kind': 'INVOICE', 'action': 'UPDATE', 'target_id': self.invoice.id,
                                                             'payload': {'monthly_fee': '150'}, 'note': 'x'}, format='json')
        self.assertEqual(paid.status_code, 400)  # money has been taken against it

    def test_a_student_with_a_corrected_receipt_can_still_be_removed_with_their_records(self):
        from billing import services
        from billing.models import PaymentReceipt
        first = services.record_payment(self.invoice, {'amount_paid': 50}, 'admin')
        services.cancel_receipt(first, 'Salah', 'supervisor')
        services.record_payment(self.invoice, {'amount_paid': 60}, 'admin', replaces=first)
        self.student.delete()
        self.assertEqual(PaymentReceipt.objects.count(), 0)

    def close(self, role=ADMIN, **data):
        self.as_role(role)
        return self.client.post('/api/v1/billing/cash-close/', data, format='json')

    def test_the_counter_is_closed_with_the_cash_counted_and_checked_by_someone_else(self):
        self.pay(100, 'CASH')
        self.pay(50, 'DUITNOW_QR', reference_number='QR123')
        short = self.close(opening_float='20', cash_counted='115')
        self.assertEqual(short.status_code, 400)  # a difference needs an explanation
        closed = self.close(opening_float='20', cash_counted='115', note='Kurang RM5, baki duit kecil')
        c = closed.data['close']
        self.assertEqual((c['status'], c['cash_expected'], c['difference'], c['receipts_total'], c['receipt_count']),
                         ('CLOSED', 120, -5, 150, 2), c)
        self.assertEqual(c['by_method']['DUITNOW_QR'], {'label': 'DuitNow QR', 'count': 1, 'amount': '50.00'})

        self.as_role(ADMIN)
        self.assertEqual(self.client.post('/api/v1/billing/cash-close/verify/', {}, format='json').status_code, 403)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post('/api/v1/billing/cash-close/return/', {}, format='json').status_code, 400)  # say what to recount
        returned = self.client.post('/api/v1/billing/cash-close/return/', {'note': 'Kira semula syiling'}, format='json')
        self.assertEqual(returned.data['close']['status'], 'RETURNED')
        self.assertEqual(self.close(opening_float='20', cash_counted='120').data['close']['status'], 'CLOSED')
        self.as_role(SUPERVISOR)
        verified = self.client.post('/api/v1/billing/cash-close/verify/', {}, format='json')
        self.assertEqual(verified.data['close']['status'], 'VERIFIED')
        self.assertEqual(self.close(opening_float='20', cash_counted='120').status_code, 400)  # a verified day is final

        self.pay(30, 'CASH')  # recorded for the same day after closing
        day = self.client.get('/api/v1/billing/cash-close/').data
        self.assertTrue(day['close']['changed_after_close'])
        self.assertEqual(day['live']['receipts_total'], 180)
        history = self.client.get('/api/v1/billing/cash-close/history/').data['days']
        self.assertEqual(history[0]['close']['status'], 'VERIFIED')

    def test_nobody_but_management_verifies_their_own_close_and_unclosed_days_show_on_the_dashboard(self):
        from datetime import timedelta
        from billing.models import PaymentReceipt
        receipt = self.pay(100, 'CASH')
        yesterday = self.today - timedelta(days=1)
        PaymentReceipt.objects.filter(pk=receipt['id']).update(payment_date=yesterday)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.get('/api/v1/dashboard/summary/').data['counter']['unclosed_days'], [yesterday])
        self.close(role=SUPERVISOR, cash_counted='0')
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post('/api/v1/billing/cash-close/verify/', {}, format='json').status_code, 403)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.get('/api/v1/dashboard/summary/').data['counter']['to_verify'], 1)
        self.assertEqual(self.client.post('/api/v1/billing/cash-close/verify/', {}, format='json').data['close']['status'], 'VERIFIED')

    def test_the_daily_checklist_is_ticked_by_staff_and_checked_once_by_the_supervisor(self):
        add = lambda code, label, order, auto='': DynamicMasterData.objects.create(category='27_daily_checklist', code=code, label=label,
                                                                                 meta_info={'order': order, 'auto': auto})
        DynamicMasterData.objects.filter(category='27_daily_checklist').delete()  # the defaults loaded by the migration
        add('TUTUP', 'Tutup kaunter', 1, 'cash_close')
        add('MESEJ', 'Mesej dibalas', 2)
        self.as_role(ADMIN)
        day = self.client.get('/api/v1/checklist/').data
        self.assertEqual([(i['code'], i['done'], i['hint']) for i in day['items']], [('TUTUP', False, 'Kaunter belum ditutup'), ('MESEJ', False, '')])
        self.assertEqual(self.client.post('/api/v1/checklist/tick/', {'code': 'NOPE'}, format='json').status_code, 400)
        ticked = self.client.post('/api/v1/checklist/tick/', {'code': 'MESEJ', 'note': '3 mesej'}, format='json').data
        self.assertEqual((ticked['done'], ticked['items'][1]['by'], ticked['can_check']), (1, 'admin', False))

        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post('/api/v1/checklist/check/', {}, format='json').status_code, 400)  # an item is not ticked
        checked = self.client.post('/api/v1/checklist/check/', {'note': 'Kaunter ditutup lewat'}, format='json').data
        self.assertEqual((checked['checked_by'], checked['can_tick']), ('supervisor', False))
        self.as_role(ADMIN)
        self.assertEqual(self.client.post('/api/v1/checklist/tick/', {'code': 'TUTUP'}, format='json').status_code, 400)
        DynamicMasterData.objects.filter(code='MESEJ').delete()  # a later change to the list leaves a checked day as it was
        self.assertEqual(len(self.client.get('/api/v1/checklist/').data['items']), 2)


class PhaseENotificationsAndWeek5Tests(FeedbackBase):
    def setUp(self):
        super().setUp()
        self.student = Student.objects.create(student_id='HQ-260001', full_name='Ali', ic_number='090101-03-1234', form_level='F5',
                                              join_date=date(2026, 1, 1), status='ACTIVE', parent1_name='Bapa', parent1_phone='60123456789')

    def bell(self, role):
        self.as_role(role)
        return self.client.get('/api/v1/notifications/').data

    def titles(self, role):
        return [n['title'] for n in self.bell(role)['items']]

    def test_a_change_request_reaches_whoever_decides_it_and_the_decision_reaches_the_person_who_asked(self):
        self.as_role(ADMIN)
        asked = self.client.post('/api/v1/change-requests/', {'kind': 'SUBJECT', 'action': 'CREATE', 'note': 'Kelas baharu',
                                                              'payload': {'code': 'EKO', 'name': 'Ekonomi', 'level_category': 'UPPER_SEC', 'stream': 'SASTERA', 'category': ''}}, format='json')
        self.assertEqual(asked.status_code, 201, asked.data)
        for role in (SUPERVISOR, MANAGEMENT):
            bell = self.bell(role)
            self.assertEqual(bell['unread'], 1)
            self.assertEqual((bell['items'][0]['title'], bell['items'][0]['link']), ('Tambah subjek: EKO Ekonomi', '#/settings'))
        self.assertEqual(self.bell(ADMIN)['unread'], 0)  # not told about their own request

        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/change-requests/{asked.data['id']}/approve/", {}, format='json')
        self.assertEqual(self.titles(ADMIN), ['Permohonan diluluskan: tambah subjek EKO Ekonomi'])

        # marking read: one at a time, or all; only one's own
        mine = self.bell(MANAGEMENT)['items'][0]['id']
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post('/api/v1/notifications/read/', {'ids': [mine]}, format='json').data['marked'], 0)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post('/api/v1/notifications/read/', {'ids': [mine]}, format='json').data['unread'], 0)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post('/api/v1/notifications/read/', {'all': True}, format='json').data['unread'], 0)

    def test_vouchers_reach_the_approvers_of_their_tier_and_the_decision_reaches_the_preparer(self):
        vendor = Vendor.objects.create(vendor_name='Kedai A', vendor_id='VND-0001')
        self.as_role(ADMIN)
        small = self.client.post('/api/v1/expenses/vouchers/', {'vendor': vendor.id, 'category': 'Utiliti', 'amount': 100,
                                                                'items_description': 'Bil air', 'payment_method': 'CASH'}, format='json')
        self.assertEqual(small.status_code, 201, small.data)
        self.assertEqual(self.bell(SUPERVISOR)['unread'], 0)  # below the counter limit: nobody has to approve it
        self.as_role(ADMIN)
        big = self.client.post('/api/v1/expenses/vouchers/', {'vendor': vendor.id, 'category': 'Utiliti', 'amount': 4000,
                                                              'items_description': 'Penghawa dingin', 'payment_method': 'CASH'}, format='json').data
        self.assertEqual(self.bell(SUPERVISOR)['unread'], 0)  # above RM3,000: Management only
        self.assertIn('RM 4,000.00 menunggu kelulusan', self.titles(MANAGEMENT)[0])
        self.as_role(MANAGEMENT)
        self.client.post(f"/api/v1/expenses/vouchers/{big['id']}/reject/", {'comment': 'Dapatkan sebut harga lain'}, format='json')
        self.assertEqual(self.titles(ADMIN), [f"Baucar {big['pv_number']} ditolak"])

    def test_registrations_reach_the_approvers_and_the_decision_reaches_the_counter(self):
        self.register('Siti')
        self.assertEqual(self.titles(SUPERVISOR), ['Pendaftaran baharu: Siti'])
        self.client.post('/api/v1/public/results/check/', {}, format='json')  # (unrelated public call does nothing)
        student = Student.objects.get(full_name='Siti')
        self.as_role(SUPERVISOR)
        self.client.post(f'/api/v1/students/students/{student.id}/reject/', {'comment': 'IC tidak jelas'}, format='json')
        self.assertEqual(self.titles(ADMIN)[0], 'Pendaftaran ditolak: Siti')

    def test_a_supervisor_s_own_leave_goes_to_management_only(self):
        from teachers.models import StaffMember
        staff = StaffMember.objects.create(name='Sup', user=self.users[SUPERVISOR], staff_id='ST-001', phone='60123456789')
        self.as_role(SUPERVISOR)
        res = self.client.post('/api/v1/teachers/leave-requests/', {'staff': staff.id, 'leave_type': 'AL', 'start_date': '2026-11-02',
                                                                   'end_date': '2026-11-02', 'reason': 'Urusan keluarga'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.bell(MANAGEMENT)['unread'], 1)
        self.assertEqual(self.bell(SUPERVISOR)['unread'], 0)

    def test_the_counter_close_reaches_the_checkers_and_their_decision_reaches_the_closer(self):
        self.as_role(ADMIN)
        self.client.post('/api/v1/billing/cash-close/', {'cash_counted': '0'}, format='json')
        self.assertIn('menunggu semakan', self.titles(SUPERVISOR)[0])
        self.as_role(SUPERVISOR)
        self.client.post('/api/v1/billing/cash-close/return/', {'note': 'Kira semula'}, format='json')
        self.assertIn('dikembalikan untuk dikira semula', self.titles(ADMIN)[0])

    def test_a_notice_that_cannot_be_saved_never_stops_the_action(self):
        from unittest import mock
        # in use a failed notice is only logged; tests normally make it fail loudly (NOTIFY_STRICT), so turn that off here
        with self.settings(NOTIFY_STRICT=False), \
                mock.patch('core.notify.Notification.objects.get_or_create', side_effect=RuntimeError('db down')), \
                self.assertLogs('core.notify', level='ERROR'):  # logged instead
            self.as_role(ADMIN)
            res = self.client.post('/api/v1/change-requests/', {'kind': 'SUBJECT', 'action': 'CREATE', 'note': 'x',
                                                                'payload': {'code': 'EKX', 'name': 'Eko', 'level_category': 'UPPER_SEC', 'stream': 'SASTERA', 'category': ''}}, format='json')
        self.assertEqual(res.status_code, 201, res.data)

    def test_class_changes_timetable_rates_teacher_pay_and_parent_results_each_reach_the_next_person(self):
        from teachers.models import Teacher, TeacherPayment
        teacher = Teacher.objects.create(teacher_code='NAK', full_name='Cikgu Nik', phone_number='60123456789')
        self.as_role(ADMIN)
        logged = self.client.post('/api/v1/academic/reschedule-logs/', {'timetable_class': self.fz.id, 'month_label': "OKT '26",
                                                                        'tarikh_batal': '2026-10-30', 'reason_type': 'OTHER', 'remarks': 'Guru sakit'}, format='json')
        self.assertEqual(logged.status_code, 201, logged.data)
        self.assertIn('menunggu kelulusan', self.titles(SUPERVISOR)[0])
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/academic/reschedule-logs/{logged.data['id']}/approve/", {}, format='json')
        self.assertIn('perlu disahkan', self.titles(MANAGEMENT)[0])

        self.as_role(SUPERVISOR)
        moved = self.client.patch(f'/api/v1/academic/timetable/{self.fz.id}/', {'max_seats': 12}, format='json')
        self.assertEqual(moved.status_code, 202, moved.data)
        self.client.post('/api/v1/teachers/rate-increments/', {'teacher': teacher.id, 'proposed_rate': '70.00', 'effective_date': '2026-11-01',
                                                              'reason': 'Setahun mengajar'}, format='json')
        pay = TeacherPayment.objects.create(teacher=teacher, month=date(2026, 10, 1), sessions=4, calculated_amount=240, amount_payable=240)
        self.client.post(f'/api/v1/teachers/payments/{pay.id}/verify/', {}, format='json')
        titles = self.titles(MANAGEMENT)
        for expected in ('Perubahan jadual induk menunggu kelulusan', 'Cadangan kenaikan kadar Cikgu Nik', 'Elaun Cikgu Nik 10/2026 menunggu kelulusan anda'):
            self.assertTrue(any(expected in t for t in titles), (expected, titles))
        self.as_role(MANAGEMENT)
        self.client.post(f'/api/v1/teachers/payments/{pay.id}/reject/', {'comment': 'Sesi 3 Okt tiada'}, format='json')
        self.assertIn('ditolak oleh Pengurusan', self.titles(SUPERVISOR)[0])

        self.student.ic_number, self.student.form_level = '090101-03-1234', 'F5'
        self.student.save()
        self.client.force_authenticate(None)
        sent = self.client.post('/api/v1/public/results/', {
            'student_code': 'HQ-260001', 'ic_last4': '1234', 'year': 2026, 'term': 'PENGGAL_2',
            'rows': json.dumps([{'subject': self.fizik.id, 'mark': 70}]), 'submitted_by': 'Bapa Ali', 'relation': 'Bapa'}, format='multipart')
        self.assertEqual(sent.status_code, 201, sent.data)
        self.assertEqual(self.titles(ADMIN)[0], 'Keputusan dari borang ibu bapa: Ali')

    def invoice(self, month, due, number, paid=False):
        from billing.models import Invoice
        return Invoice.objects.create(invoice_number=number, student=self.student, billing_month=month, invoice_type='MONTHLY',
                                      registration_fee=0, monthly_fee=240, total_payable=240, balance_due=0 if paid else 240,
                                      total_paid=240 if paid else 0, status='PAID' if paid else 'OVERDUE', due_date=due)

    def test_monthly_fees_unpaid_in_week_5_become_supervisor_tasks_once(self):
        from billing import followups
        from billing.models import PaymentFollowUp
        unpaid = self.invoice(date(2026, 10, 1), date(2026, 10, 7), 'INV-1')
        self.invoice(date(2026, 10, 1), date(2026, 10, 30), 'INV-2')  # raised too late to be due before week 5
        self.invoice(date(2026, 10, 1), date(2026, 10, 7), 'INV-3', paid=True)
        self.assertEqual(followups.generate(date(2026, 10, 28)), 0)  # week 5 starts on the 29th
        self.assertEqual(followups.generate(date(2026, 10, 29)), 1)
        self.assertEqual(followups.generate(date(2026, 10, 29)), 0)  # one task per invoice
        self.assertEqual(PaymentFollowUp.objects.get().invoice, unpaid)
        self.assertEqual(self.titles(SUPERVISOR), ['1 yuran perlu dihubungi (minggu 5)'])
        self.assertEqual(self.bell(ADMIN)['unread'], 0)
        # a month the system was not opened in week 5 is caught up the next month; February's week 5 is its last day
        self.invoice(date(2026, 10, 1), date(2026, 10, 7), 'INV-4')
        self.assertEqual(followups.generate(date(2026, 11, 2)), 1)
        self.invoice(date(2026, 9, 1), date(2026, 9, 7), 'INV-5')  # two months back belongs to the arrears rule
        self.assertEqual(followups.generate(date(2026, 11, 2)), 0)
        self.assertEqual(followups.week5_start(date(2027, 2, 1)), date(2027, 2, 28))

    def test_supervisor_records_the_outcome_and_a_paid_invoice_closes_the_task(self):
        from billing import followups
        invoice = self.invoice(date(2026, 10, 1), date(2026, 10, 7), 'INV-1')
        followups.generate(date(2026, 10, 30))
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.get('/api/v1/dashboard/summary/').data['approvals']['fee_followups_open'], 1)
        task = self.client.get('/api/v1/billing/follow-ups/').data[0]
        self.assertEqual((task['state'], task['student_name'], task['balance']), ('OPEN', 'Ali', '240.00'))
        url = f"/api/v1/billing/follow-ups/{task['id']}/record/"
        self.as_role(ADMIN)
        self.assertEqual(self.client.post(url, {'outcome': 'WILL_PAY', 'channel': 'CALL'}, format='json').status_code, 403)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(url, {'outcome': 'PROMISED', 'channel': 'WHATSAPP'}, format='json').status_code, 400)
        done = self.client.post(url, {'outcome': 'PROMISED', 'channel': 'WHATSAPP', 'promised_date': '2099-01-05', 'note': 'Selepas gaji'}, format='json').data
        self.assertEqual((done['state'], done['outcome_label'], done['contacted_by']), ('DONE', 'Berjanji bayar pada tarikh', 'supervisor'))
        invoice.status, invoice.balance_due = 'PAID', 0
        invoice.save()
        self.assertEqual(self.client.get('/api/v1/billing/follow-ups/').data[0]['state'], 'PAID')
        self.assertEqual(self.client.post(url, {'outcome': 'WILL_PAY', 'channel': 'CALL'}, format='json').status_code, 400)


class PhaseFTeacherLinkTests(FeedbackBase):
    def setUp(self):
        super().setUp()
        from teachers.models import Teacher
        self.teacher = Teacher.objects.create(teacher_code='NAK', full_name='Nik Ahmad', phone_number='60123456789', rate_per_session=60)

    def png(self, name='x.png'):
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image
        buf = BytesIO()
        Image.new('RGB', (4, 4)).save(buf, 'PNG')
        return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')

    def link(self, kind='TEACHER', **extra):
        self.as_role(MANAGEMENT)
        res = self.client.post('/api/v1/teachers/links/', {'kind': kind, 'teacher': self.teacher.id, **extra}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data['token']

    def send(self, token, **fields):
        self.client.force_authenticate(None)
        return self.client.post(f'/api/v1/public/teacher-link/{token}/', fields, format='multipart')

    def test_only_management_makes_links_and_the_teacher_s_form_waits_for_approval(self):
        from core.models import Attachment, ChangeRequest, Notification
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post('/api/v1/teachers/links/', {'kind': 'TEACHER', 'teacher': self.teacher.id}, format='json').status_code, 403)
        token = self.link()
        self.client.force_authenticate(None)
        form = self.client.get(f'/api/v1/public/teacher-link/{token}/').data
        self.assertEqual((form['kind'], form['teacher']['full_name'], form['teacher']['phone_number']), ('TEACHER', 'Nik Ahmad', '60123456789'))

        sent = self.send(token, full_name='Nik Ahmad Khan', phone_number='013-347 4009', bank_name='Maybank', bank_account='5140 1234',
                         subjects_qualified=[self.fizik.id], teaching_since='2015-01-01', photo=self.png('me.png'), ic=self.png('ic.png'))
        self.assertEqual(sent.status_code, 201, sent.data)
        req = ChangeRequest.objects.get(kind='TEACHER')
        self.assertEqual((req.status, req.action, req.requested_by, req.requested_by_name), ('PENDING', 'UPDATE', None, 'Nik Ahmad Khan (pautan guru)'))
        self.assertEqual(req.payload['phone_number'], '60133474009')  # the one stored phone form
        self.assertEqual(req.payload['documents'], ['IC', 'PHOTO'])
        self.assertTrue(Notification.objects.filter(user=self.users[MANAGEMENT], title__contains='NAK').exists())
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.full_name, 'Nik Ahmad')  # nothing changes before approval
        self.as_role(ADMIN)  # the IC copy is for approvers only
        self.assertEqual(self.client.get('/api/v1/files/', {'kind': 'TEACHER_FORM', 'object_id': req.id}).status_code, 403)

        # sending again before the decision replaces the waiting form and the file sent again
        again = self.send(token, full_name='Nik Ahmad Khan', phone_number='013-347 4009', bank_name='CIMB', ic=self.png('ic2.png'))
        self.assertTrue(again.data['replaced'])
        self.assertEqual(ChangeRequest.objects.filter(kind='TEACHER').count(), 1)
        names = sorted(Attachment.objects.filter(kind='TEACHER_FORM', object_id=req.id).values_list('original_name', flat=True))
        self.assertEqual(names, ['ic2.png', 'me.png'])

        self.as_role(MANAGEMENT)
        listed = self.client.get('/api/v1/change-requests/', {'kind': 'TEACHER'}).data[0]
        self.assertIn({'field': 'documents', 'label': 'Dokumen', 'before': None, 'after': 'Gambar, Salinan IC'}, listed['changes'])
        self.client.post(f'/api/v1/change-requests/{req.id}/approve/', {}, format='json')
        self.teacher.refresh_from_db()
        self.assertEqual((self.teacher.full_name, self.teacher.bank_name, self.teacher.phone_number), ('Nik Ahmad Khan', 'CIMB', '60133474009'))
        self.assertEqual(list(Attachment.objects.filter(kind='TEACHER_PHOTO', object_id=self.teacher.id).values_list('original_name', flat=True)), ['me.png'])
        self.assertEqual(list(Attachment.objects.filter(kind='TEACHER_DOC', object_id=self.teacher.id).values_list('doc_type', flat=True)), ['IC'])

    def test_a_link_stops_working_when_replaced_cancelled_expired_or_the_teacher_leaves(self):
        from teachers.models import TeacherLink
        old = self.link()
        new = self.link()  # one working personal link per teacher
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/v1/public/teacher-link/{old}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/public/teacher-link/{new}/').status_code, 200)
        link = TeacherLink.objects.get(revoked_at=None)
        self.as_role(MANAGEMENT)
        self.client.post(f'/api/v1/teachers/links/{link.id}/revoke/', {}, format='json')
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/v1/public/teacher-link/{new}/').status_code, 404)
        third = self.link()
        TeacherLink.objects.filter(revoked_at=None).update(expires_on=date(2020, 1, 1))
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/v1/public/teacher-link/{third}/').status_code, 404)
        fourth = self.link()
        self.teacher.is_active = False
        self.teacher.save()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/v1/public/teacher-link/{fourth}/').status_code, 404)
        self.assertEqual(self.client.get('/api/v1/public/teacher-link/not-a-real-link/').status_code, 404)

    def test_an_applicant_is_added_only_when_management_gives_the_code_and_rate(self):
        from core.models import Attachment, ChangeRequest
        from teachers.models import Teacher
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post('/api/v1/teachers/links/', {'kind': 'APPLICANT'}, format='json').status_code, 400)  # needs a name
        token = self.link('APPLICANT', label='Pengambilan 2027')
        self.assertEqual(self.send(token, full_name='Aina').status_code, 400)  # a phone number is needed
        sent = self.send(token, full_name='Aina Sofea', phone_number='0129998888', remarks='5 tahun di SMK Kota', permit=self.png('permit.png'))
        self.assertEqual(sent.status_code, 201, sent.data)
        req = ChangeRequest.objects.get(kind='TEACHER', action='CREATE')
        self.assertEqual(req.target_label, 'Pemohon: Aina Sofea')
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(f'/api/v1/change-requests/{req.id}/approve/', {}, format='json').status_code, 400)  # no code yet
        done = self.client.post(f'/api/v1/change-requests/{req.id}/approve/', {'changes': {
            'teacher_code': 'AS', 'rate_per_session': '55', 'teacher_type': 'REPLACEMENT', 'full_name': 'Changed'}}, format='json')
        self.assertEqual(done.data['status'], 'APPROVED', done.data)
        new = Teacher.objects.get(teacher_code='AS')
        self.assertEqual((new.full_name, new.rate_per_session, new.teacher_type, new.remarks), ('Aina Sofea', 55, 'REPLACEMENT', '5 tahun di SMK Kota'))
        self.assertEqual(list(Attachment.objects.filter(kind='TEACHER_DOC', object_id=new.id).values_list('doc_type', flat=True)), ['PERMIT'])

    def test_a_rejected_applicant_s_documents_are_not_kept_and_staff_requests_come_first(self):
        from core.models import Attachment, ChangeRequest
        token = self.link('APPLICANT', label='Pengambilan 2027')
        self.send(token, full_name='Ali', phone_number='0129998888', ic=self.png('ic.png'))
        req = ChangeRequest.objects.get(kind='TEACHER')
        self.as_role(MANAGEMENT)
        self.client.post(f'/api/v1/change-requests/{req.id}/reject/', {'comment': 'Tiada kekosongan'}, format='json')
        self.assertFalse(Attachment.objects.filter(kind='TEACHER_FORM').exists())

        personal = self.link()
        self.as_role(SUPERVISOR)  # a change the centre itself asked for is decided first
        self.client.post('/api/v1/change-requests/', {'kind': 'TEACHER', 'action': 'UPDATE', 'target_id': self.teacher.id,
                                                      'payload': {'email': 'nik@example.com'}, 'note': 'E-mel baharu'}, format='json')
        blocked = self.send(personal, full_name='Nik Ahmad', phone_number='0123456789', bank_name='RHB')
        self.assertEqual(blocked.status_code, 400)
        self.assertIn('sedang dikemas kini', str(blocked.data))
        self.assertEqual(self.send(personal).status_code, 400)  # nothing to send

    def test_the_public_pages_are_rate_limited_per_visitor(self):
        codes = [self.client.post('/api/v1/students/parent-self-register/', {}, format='json').status_code for _ in range(21)]
        self.assertEqual(codes[-1], 429)  # 20 an hour
        self.assertNotIn(429, codes[:20])


class PhaseIQRCheckInTests(FeedbackBase):
    """The class is Fizik T5 on Fridays 09:00-10:30 in Bilik 1; 30 Oct 2026 is a Friday."""
    DAY = date(2026, 10, 30)

    def setUp(self):
        super().setUp()
        from academic.models import Classroom
        from teachers.models import Teacher
        self.teacher = Teacher.objects.create(teacher_code='NAK', full_name='Nik Ahmad', phone_number='60123456789')
        self.other = Teacher.objects.create(teacher_code='ZZ', full_name='Zakir', phone_number='60123456780')
        self.room = Classroom.objects.create(name='Bilik 1', capacity=20)
        self.fz.classroom, self.fz.teacher = self.room, self.teacher
        self.fz.save()
        self.kids = []
        for i, (name, ic) in enumerate([('Ahmad Daniyal bin Razali', '090514-03-5511'), ('Nur Aisyah binti Zaki', '090822-03-6622'),
                                         ('Muhammad Haziq bin Imran', '100311-03-7733')]):
            s = Student.objects.create(student_id=f'HQ-26000{i + 1}', full_name=name, ic_number=ic, form_level='F5', join_date=date(2026, 1, 1),
                                       status='ACTIVE', parent1_name='P', parent1_phone='60123456789')
            s.enrolled_classes.add(self.fz)
            self.kids.append(s)

    def at(self, hhmm):
        from datetime import datetime
        from unittest import mock
        from django.utils import timezone
        h, m = map(int, hhmm.split(':'))
        moment = timezone.make_aware(datetime(2026, 10, 30, h, m))
        patcher = mock.patch('django.utils.timezone.now', return_value=moment)
        patcher.start()
        self.addCleanup(patcher.stop)
        return patcher

    def open_code(self):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/attendance/checkin/', {'class_id': self.fz.id, 'date': self.DAY.isoformat(), 'action': 'open'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        return res.data['code']

    def scan(self, code, student, device='phone-of-ahmad-0001', ic=None, room=None):
        self.client.force_authenticate(None)
        body = {'code': code, 'student': student.id, 'device': device, **({'ic_last4': ic} if ic else {}), **({'room': room} if room else {})}
        return self.client.post('/api/v1/public/checkin/mark/', body, format='json')

    def test_a_student_checks_in_with_the_code_on_the_board_and_is_late_after_ten_minutes(self):
        p = self.at('08:40')
        code = self.open_code()
        self.assertEqual(self.scan(code, self.kids[0], ic='5511').status_code, 400)  # opens at 08:45
        p.stop()
        p = self.at('08:50')
        self.as_role(SUPERVISOR)
        key = self.client.post(f'/api/v1/academic/classrooms/{self.room.id}/checkin_key/', {}, format='json').data['key']
        self.client.force_authenticate(None)
        room = self.client.get(f'/api/v1/public/checkin/room/{key}/').data
        self.assertEqual((room['room'], room['classes'][0]['state'], 'code' in room['classes'][0]), ('Bilik 1', 'OPEN', False))
        self.assertEqual(self.client.post('/api/v1/public/checkin/code/', {'code': '0000' if code != '0000' else '1111', 'room': key}, format='json').status_code, 400)
        listed = self.client.post('/api/v1/public/checkin/code/', {'code': code, 'room': key}, format='json').data
        self.assertEqual([s['name'] for s in listed['students']], ['Ahmad D.', 'Muhammad H.', 'Nur A.'])

        first = self.scan(code, self.kids[0], room=key)
        self.assertEqual((first.status_code, first.data['needs_ic']), (400, True))  # the first time on this phone
        self.assertEqual(self.scan(code, self.kids[0], ic='0000').status_code, 400)
        ok = self.scan(code, self.kids[0], ic='5511')
        self.assertEqual((ok.data['status'], ok.data['already']), ('PRESENT', False))
        self.assertTrue(self.scan(code, self.kids[0]).data['already'])  # this phone is remembered for Ahmad
        # a second name from the same phone is recorded, with a flag for the teacher
        self.assertEqual(self.scan(code, self.kids[1], ic='6622').data['status'], 'PRESENT')
        from students.models import StudentAttendance
        self.assertEqual(StudentAttendance.objects.get(student=self.kids[1]).flag, 'Telefon yang sama dengan Ahmad D.')
        p.stop()
        p = self.at('09:15')
        self.assertEqual(self.scan(code, self.kids[2], device='phone-of-haziq-0002', ic='7733').data['status'], 'LATE')
        p.stop()
        self.at('09:31')
        self.assertEqual(self.scan(code, self.kids[2], device='phone-of-haziq-0002').status_code, 400)  # closed 30 minutes after the start

    def test_five_wrong_ic_tries_lock_the_student(self):
        self.at('08:55')
        code = self.open_code()
        for _ in range(5):
            self.assertEqual(self.scan(code, self.kids[0], ic='0000').status_code, 400)
        locked = self.scan(code, self.kids[0], ic='5511')
        self.assertIn('Terlalu banyak cubaan', str(locked.data))

    def test_the_teacher_s_link_shows_the_code_marks_pupils_without_phones_and_confirms_the_list(self):
        from students.models import StudentAttendance
        self.at('08:50')
        self.as_role(MANAGEMENT)
        token = self.client.post('/api/v1/teachers/links/', {'kind': 'TEACHER', 'teacher': self.teacher.id}, format='json').data['token']
        other = self.client.post('/api/v1/teachers/links/', {'kind': 'TEACHER', 'teacher': self.other.id}, format='json').data['token']
        self.client.force_authenticate(None)
        page = self.client.get(f'/api/v1/public/teacher-link/{token}/classes/').data
        cls = page['classes'][0]
        self.assertEqual((cls['class_id'], len(cls['code']), cls['state']), (self.fz.id, 4, 'OPEN'))
        self.assertEqual(self.client.get(f'/api/v1/public/teacher-link/{other}/classes/').data['classes'], [])  # not their class
        self.assertEqual(self.client.post(f'/api/v1/public/teacher-link/{other}/classes/{self.fz.id}/', {'action': 'confirm'}, format='json').status_code, 400)

        self.scan(cls['code'], self.kids[0], ic='5511')
        url = f'/api/v1/public/teacher-link/{token}/classes/{self.fz.id}/'
        self.client.post(url, {'action': 'mark', 'student': self.kids[2].id, 'status': 'LATE'}, format='json')  # no phone
        done = self.client.post(url, {'action': 'confirm'}, format='json').data
        self.assertEqual({s['code']: (s['status'], s['source']) for s in done['students']},
                         {'HQ-260001': ('PRESENT', 'QR'), 'HQ-260002': ('ABSENT', 'AUTO'), 'HQ-260003': ('LATE', 'TEACHER')})
        self.assertEqual(self.scan(cls['code'], self.kids[1], device='phone-of-aisyah-003', ic='6622').status_code, 400)  # list confirmed
        self.assertEqual(StudentAttendance.objects.count(), 3)

    def test_a_class_that_ended_closes_by_itself_and_staff_saving_the_list_keeps_who_checked_in(self):
        from students.models import StudentAttendance
        p = self.at('08:50')
        code = self.open_code()
        self.scan(code, self.kids[0], ic='5511')
        p.stop()
        self.at('10:31')
        self.as_role(ADMIN)
        rows = {r['student_id']: r for r in self.client.get('/api/v1/attendance/roster/', {'class_id': self.fz.id, 'date': self.DAY.isoformat()}).data['students']}
        self.assertEqual((rows['HQ-260001']['source'], rows['HQ-260002']['present'], rows['HQ-260002']['source']), ('QR', False, 'AUTO'))
        self.assertEqual(str(rows['HQ-260001']['marked_at'])[:16], '2026-10-30 08:50')
        self.client.post('/api/v1/attendance/roster/', {'class_id': self.fz.id, 'date': self.DAY.isoformat(), 'marks': [
            {'student': self.kids[0].id, 'present': True}, {'student': self.kids[1].id, 'present': True, 'late': True},
            {'student': self.kids[2].id, 'present': False}]}, format='json')
        sources = dict(StudentAttendance.objects.values_list('student__student_id', 'source'))
        self.assertEqual(sources, {'HQ-260001': 'QR', 'HQ-260002': 'STAFF', 'HQ-260003': 'AUTO'})

    def test_opening_the_teacher_s_link_early_starts_nothing_and_an_unused_check_in_marks_nobody_absent(self):
        from students.models import ClassCheckIn, StudentAttendance
        p = self.at('07:30')
        self.as_role(MANAGEMENT)
        token = self.client.post('/api/v1/teachers/links/', {'kind': 'TEACHER', 'teacher': self.teacher.id}, format='json').data['token']
        self.client.force_authenticate(None)
        cls = self.client.get(f'/api/v1/public/teacher-link/{token}/classes/').data['classes'][0]
        self.assertEqual((cls['state'], cls['code']), ('SOON', None))  # no code before scanning opens at 08:45
        self.assertFalse(ClassCheckIn.objects.exists())
        p.stop()
        p = self.at('08:50')
        self.assertEqual(len(self.client.get(f'/api/v1/public/teacher-link/{token}/classes/').data['classes'][0]['code']), 4)
        p.stop()
        self.at('10:31')  # nobody scanned and nobody was marked: the class took attendance some other way
        self.as_role(ADMIN)
        rows = self.client.get('/api/v1/attendance/roster/', {'class_id': self.fz.id, 'date': self.DAY.isoformat()}).data['students']
        self.assertEqual({r['present'] for r in rows}, {None})
        self.assertFalse(StudentAttendance.objects.exists())
        self.assertEqual(ClassCheckIn.objects.get().confirmed_by, 'Ditutup (tiada imbasan)')
        self.assertIn('tiada yang ditanda tidak hadir', self.client.get('/api/v1/attendance/checkin/', {'class_id': self.fz.id, 'date': self.DAY.isoformat()}).data['closed_note'])

    def test_the_timings_are_settings_and_a_room_s_qr_can_be_replaced(self):
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.put('/api/v1/thresholds/', {'checkin_late_minutes': 45}, format='json').status_code, 400)  # after closing
        self.assertEqual(self.client.put('/api/v1/thresholds/', {'checkin_late_minutes': 5}, format='json').status_code, 200)
        self.as_role(ADMIN)
        self.assertEqual(self.client.post(f'/api/v1/academic/classrooms/{self.room.id}/checkin_key/', {}, format='json').status_code, 403)
        self.as_role(SUPERVISOR)
        old = self.client.post(f'/api/v1/academic/classrooms/{self.room.id}/checkin_key/', {}, format='json').data['key']
        self.assertEqual(self.client.post(f'/api/v1/academic/classrooms/{self.room.id}/checkin_key/', {}, format='json').data['key'], old)
        new = self.client.post(f'/api/v1/academic/classrooms/{self.room.id}/checkin_key/', {'renew': True}, format='json').data['key']
        self.assertNotEqual(new, old)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/v1/public/checkin/room/{old}/').status_code, 404)


class PhaseGHandoutTests(FeedbackBase):
    """A handout belongs to a real class: Fizik T5 on Fridays; 30 Oct 2026 is a Friday."""
    DAY = date(2026, 10, 30)

    def setUp(self):
        super().setUp()
        from teachers.models import Teacher
        self.fz.teacher = Teacher.objects.create(teacher_code='NAK', full_name='Nik Ahmad', phone_number='60123456789')
        self.fz.save()
        self.kids = []
        for i, (name, status) in enumerate([('Ahmad', 'ACTIVE'), ('Aisyah', 'ACTIVE'), ('Haziq', 'ACTIVE'), ('Iman', 'ON_HOLD')]):
            s = Student.objects.create(student_id=f'HQ-26000{i + 1}', full_name=name, ic_number='0', form_level='F5', join_date=date(2026, 1, 1),
                                       status=status, parent1_name='P', parent1_phone='60123456789')
            s.enrolled_classes.add(self.fz)
            self.kids.append(s)

    def add(self, **fields):
        self.as_role(ADMIN)
        return self.client.post('/api/v1/academic/handouts/', {'title': 'Bab 3', 'timetable_class': self.fz.id, 'class_date': self.DAY.isoformat(), **fields}, format='json')

    def take_attendance(self, marks):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/attendance/roster/', {'class_id': self.fz.id, 'date': self.DAY.isoformat(), 'marks': [
            {'student': self.kids[i].id, 'present': present} for i, present in marks]}, format='json')
        self.assertEqual(res.status_code, 200, res.data)

    def test_a_handout_needs_a_class_and_a_date_and_copies_come_from_the_class(self):
        self.assertIn('timetable_class', self.add(timetable_class=None).data)
        self.assertIn('class_date', self.add(class_date=None).data)
        made = self.add(class_code='palsu', form_level='F1').data
        # the class's own details, and one copy for each active student (Iman is on hold)
        self.assertEqual((made['class_code'], made['form_level'], made['subject_name'], made['teacher_name'], made['copies_needed']),
                         ('F5 FZ (A) NAK', 'F5', 'Fizik', 'Nik Ahmad', 3))
        self.assertEqual(self.add(copies_needed=5).data['copies_needed'], 5)  # spare copies
        self.assertEqual(made['tally'], {'students': 3, 'received': 0, 'waiting': 0, 'pending': 3})  # the class is not held yet
        self.assertEqual(self.client.post(f"/api/v1/academic/handouts/{made['id']}/record_print/", {'copies': 'x'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f"/api/v1/academic/handouts/{made['id']}/record_print/", {}, format='json').data['copies_printed'], 3)

    def test_who_has_a_copy_comes_from_the_class_s_attendance_and_copies_given_later(self):
        hid = self.add().data['id']
        url = f'/api/v1/academic/handouts/{hid}/'
        before = self.client.get(url + 'recipients/').data
        self.assertEqual({(r['state'], r['why']) for r in before['students']}, {('PENDING', 'Kelas belum berlangsung')})
        self.take_attendance([(0, True), (1, False), (2, True)])
        got = self.client.get(url + 'recipients/').data
        self.assertEqual(got['session_date'], self.DAY)
        self.assertEqual([(r['name'], r['state'], r['why']) for r in got['students']],
                         [('Ahmad', 'IN_CLASS', ''), ('Aisyah', 'WAITING', 'Tidak hadir'), ('Haziq', 'IN_CLASS', '')])

        # Aisyah's mother collects a copy at the counter
        given = self.client.post(url + 'give/', {'student': self.kids[1].id}, format='json').data
        aisyah = next(r for r in given['students'] if r['name'] == 'Aisyah')
        self.assertEqual((aisyah['state'], aisyah['given_by']), ('GIVEN', 'admin'))
        self.assertEqual(self.client.get(url).data['tally'], {'students': 3, 'received': 3, 'waiting': 0, 'pending': 0})
        self.assertEqual(self.client.post(url + 'give/', {'student': self.kids[3].id}, format='json').status_code, 400)  # on hold
        self.client.post(url + 'give/', {'student': self.kids[1].id, 'given': False}, format='json')  # recorded by mistake
        self.assertEqual(self.client.get(url).data['tally']['waiting'], 1)

        # the student's profile lists the handouts of their classes
        mine = self.client.get('/api/v1/academic/handouts/for_student/', {'student': self.kids[1].id}).data
        self.assertEqual([(h['title'], h['state'], h['why']) for h in mine], [('Bab 3', 'WAITING', 'Tidak hadir')])
        self.assertEqual(self.client.get('/api/v1/academic/handouts/for_student/', {'student': self.kids[3].id}).data, [])
        self.assertEqual(self.client.get('/api/v1/academic/handouts/for_student/', {'student': 'HQ-260001'}).status_code, 400)

    def test_the_office_checklist_shows_tomorrow_s_handouts_not_yet_printed(self):
        from core.checklist import hint
        self.assertEqual(hint('handouts', date(2026, 10, 29)), 'Tiada handout direkod untuk kelas esok')
        hid = self.add(status='NEEDS_PRINTING').data['id']
        self.assertEqual(hint('handouts', date(2026, 10, 29)), '1 handout untuk esok, 1 belum dicetak')
        self.client.post(f'/api/v1/academic/handouts/{hid}/record_print/', {}, format='json')
        self.assertEqual(hint('handouts', date(2026, 10, 29)), '1 handout untuk esok, semua sudah dicetak')
        self.assertEqual(hint('handouts', date(2026, 10, 28)), 'Tiada handout direkod untuk kelas esok')  # Thursday's classes

    def test_older_handouts_are_linked_to_their_class_and_date_by_the_migration(self):
        from academic.models import LessonHandout
        old = LessonHandout.objects.create(handout_id='HND-001', title='Lama', form_level='F5', subject_name='Fizik', class_code='F5 FZ (A) NAK',
                                           teacher_name='Nik Ahmad', description='Untuk kelas 30 Okt 2026. Topik daya')
        gone = LessonHandout.objects.create(handout_id='HND-002', title='Kelas lama', form_level='F4', subject_name='Kimia', class_code='F4 KIM (B) SF',
                                            teacher_name='Saiful', description='Nota ringkas')
        import_module('academic.migrations.0009_handout_class_and_receipts').link_to_classes(django_apps, None)
        old.refresh_from_db()
        gone.refresh_from_db()
        self.assertEqual((old.timetable_class_id, old.class_date, old.description), (self.fz.id, self.DAY, 'Topik daya'))
        self.assertEqual((gone.timetable_class_id, gone.class_date, gone.description), (None, None, 'Nota ringkas'))


class PhaseHPerformanceAndReportsTests(FeedbackBase):
    """Fizik T5 (class `fz`, Fridays). Results for Penggal 1 (31 Mar) and Pertengahan Tahun (15 Jun) 2026."""

    def setUp(self):
        super().setUp()
        from teachers.models import Teacher
        self.teacher = Teacher.objects.create(teacher_code='NAK', full_name='Nik Ahmad', phone_number='60123456789')
        self.fz.teacher = self.teacher
        self.fz.save()
        self.kimia = SubjectMaster.objects.create(code='KM', name='Kimia', level_category='UPPER_SEC', stream='SAINS')
        self.kids = {}
        for name, joined in [('Ahmad', date(2026, 1, 1)), ('Aisyah', date(2026, 1, 1)), ('Haziq', date(2026, 5, 1)), ('Iman', date(2026, 1, 1))]:
            s = Student.objects.create(student_id=f'HQ-2600{len(self.kids) + 10}', full_name=name, ic_number='0', form_level='F5', join_date=joined,
                                       status='ACTIVE', parent1_name='P', parent1_phone='60123456789')
            s.enrolled_classes.add(self.fz)
            self.kids[name] = s
        marks = {'Ahmad': (70, 55), 'Aisyah': (45, 35), 'Haziq': (None, 38), 'Iman': (80, 78)}
        for name, (p1, ppt) in marks.items():
            for term, mark in (('PENGGAL_1', p1), ('PERTENGAHAN', ppt)):
                if mark is not None:
                    StudentExamResult.objects.create(student=self.kids[name], year=2026, term=term, subject=self.fizik, mark=mark, grade='C')
        StudentExamResult.objects.create(student=self.kids['Iman'], year=2026, term='PERTENGAHAN', subject=self.kimia, mark=30, grade='G')
        # Fizik classes between the two exams: Aisyah came once in four, Ahmad every time
        from students.models import ClassAttendanceSession, StudentAttendance
        for i, day in enumerate([date(2026, 4, 3), date(2026, 4, 10), date(2026, 4, 17), date(2026, 4, 24)]):
            session = ClassAttendanceSession.objects.create(timetable_class=self.fz, date=day, recorded_by='x')
            StudentAttendance.objects.create(session=session, student=self.kids['Ahmad'], present=True)
            StudentAttendance.objects.create(session=session, student=self.kids['Aisyah'], present=i == 0)

    def rows(self, **params):
        self.as_role(SUPERVISOR)
        res = self.client.get('/api/v1/students/performance/', params)
        self.assertEqual(res.status_code, 200, res.data)
        return res.data, {(r['name'], r['subject']): r for r in res.data['rows']}

    def test_failing_and_falling_students_with_their_class_attendance_and_likely_reasons(self):
        from students.models import StudentReport
        StudentReport.objects.create(student=self.kids['Aisyah'], teacher=self.teacher, category='BEHAVIOUR', details='Selalu lewat dan tidak siap kerja')
        StudentReport.objects.create(student=self.kids['Aisyah'], category='HOMEWORK', details='Sudah selesai', status='RESOLVED')
        data, rows = self.rows()
        self.assertEqual(data['exam']['label'], 'Peperiksaan terakhir setiap pelajar')  # each student's latest result by default
        self.assertEqual({r['exam'] for r in data['rows']}, {'Pertengahan Tahun 2026'})
        self.assertEqual(set(rows), {('Ahmad', 'Fizik'), ('Aisyah', 'Fizik'), ('Haziq', 'Fizik'), ('Iman', 'Kimia')})  # Iman's Fizik is fine

        ahmad = rows[('Ahmad', 'Fizik')]
        self.assertEqual((ahmad['failing'], ahmad['falling'], ahmad['change'], ahmad['teacher'], ahmad['class_code']), (False, True, -15, 'Nik Ahmad', self.fz.class_code))
        self.assertEqual((ahmad['attendance'], ahmad['attendance_rate'], ahmad['reasons']), ({'present': 4, 'total': 4}, 100, []))
        self.assertEqual([t['mark'] for t in ahmad['trend']], [70, 55])

        aisyah = rows[('Aisyah', 'Fizik')]
        self.assertEqual((aisyah['failing'], aisyah['falling'], aisyah['attendance_rate']), (True, True, 25))
        self.assertEqual(aisyah['reasons'], ['Kehadiran rendah dalam kelas ini (25%)', 'Laporan guru: Disiplin / tingkah laku'])
        self.assertEqual([r['details'] for r in aisyah['reports']], ['Selalu lewat dan tidak siap kerja'])  # open reports only

        haziq = rows[('Haziq', 'Fizik')]  # no earlier result: failing, not falling; joined after the start of the year
        self.assertEqual((haziq['failing'], haziq['falling'], haziq['previous']), (True, False, None))
        self.assertIn('Baru menyertai pusat sebelum peperiksaan ini', haziq['reasons'])
        self.assertEqual(rows[('Iman', 'Kimia')]['reasons'][0], 'Tidak mengambil subjek ini di pusat')

        # one exam for everyone, an earlier exam, and the two settings
        self.assertEqual(set(self.rows(year=2026, term='PERTENGAHAN')[1]), set(rows))
        self.assertEqual(set(self.rows(year=2026, term='PENGGAL_1')[1]), set())
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.put('/api/v1/thresholds/', {'results_pass_mark': 36, 'results_drop_marks': 20}, format='json').status_code, 200)
        self.assertEqual(set(self.rows()[1]), {('Aisyah', 'Fizik'), ('Iman', 'Kimia')})  # Ahmad's -15 is not a fall now, Haziq's 38 a pass
        self.as_role(ADMIN)
        self.assertEqual(self.client.get('/api/v1/students/performance/').status_code, 403)

    def test_a_teacher_s_report_about_a_student_with_comments_and_follow_up(self):
        from core.models import Notification
        self.as_role(ADMIN)
        other = ClassTimetable.objects.create(slot=self.slot, form_level='F5', section='B', max_seats=10, subject=self.kimia)
        bad = self.client.post('/api/v1/students/reports/', {'student': self.kids['Aisyah'].id, 'timetable_class': other.id,
                                                              'category': 'ACADEMIC', 'details': 'x'}, format='json')
        self.assertIn('timetable_class', bad.data)  # not her class
        made = self.client.post('/api/v1/students/reports/', {'student': self.kids['Aisyah'].id, 'timetable_class': self.fz.id,
                                                               'category': 'BEHAVIOUR', 'details': 'Tidur dalam kelas'}, format='json').data
        self.assertEqual((made['teacher_name'], made['recorded_by'], made['status']), ('Nik Ahmad', 'admin', 'OPEN'))  # the class's teacher
        told = set(Notification.objects.filter(title='Laporan guru: Aisyah').values_list('user__username', flat=True))
        self.assertEqual(told, {'supervisor', 'management'})
        url = f"/api/v1/students/reports/{made['id']}/"
        self.assertEqual(self.client.post(url + 'comment/', {'text': '  '}, format='json').status_code, 400)
        self.as_role(SUPERVISOR)
        done = self.client.post(url + 'comment/', {'text': 'Ibu bapa sudah dihubungi'}, format='json').data
        self.assertEqual([(c['by'], c['text']) for c in done['comments']], [('supervisor', 'Ibu bapa sudah dihubungi')])
        self.assertEqual(self.client.patch(url, {'comments': []}, format='json').data['comments'][0]['text'], 'Ibu bapa sudah dihubungi')  # never edited
        self.client.patch(url, {'status': 'RESOLVED', 'action_taken': 'Berjumpa ibu bapa', 'action_date': '2026-10-26'}, format='json')
        listed = self.client.get('/api/v1/students/reports/', {'student': self.kids['Aisyah'].id}).data
        self.assertEqual([(r['status'], r['action_taken']) for r in listed], [('RESOLVED', 'Berjumpa ibu bapa')])
        self.assertEqual(self.client.get('/api/v1/students/reports/', {'student': self.kids['Ahmad'].id}).data, [])

    def test_a_parent_s_report_about_a_teacher_is_a_complaint_linked_to_the_student(self):
        from core.models import Notification
        self.as_role(SUPERVISOR)
        made = self.client.post('/api/v1/teachers/complaints/', {
            'teacher': self.teacher.id, 'date_reported': '2026-10-26', 'complained_by': 'Puan Rohani', 'complainant_type': 'PARENT',
            'student': self.kids['Ahmad'].id, 'description': 'Kerja rumah tidak disemak', 'severity': 'MEDIUM'}, format='json').data
        self.assertEqual((made['complainant_label'], made['student_name']), ('Ibu bapa', 'Ahmad'))
        self.assertEqual(set(Notification.objects.filter(title='Aduan tentang Cikgu Nik Ahmad').values_list('user__username', flat=True)), {'management'})
        from teachers.models import Teacher
        self.assertEqual(Teacher(full_name='Cikgu Zakir').titled, 'Cikgu Zakir')  # a name stored with the title gets it once
        self.client.post('/api/v1/teachers/complaints/', {'teacher': self.teacher.id, 'date_reported': '2026-10-20', 'complained_by': 'Staf',
                                                           'description': 'Lewat'}, format='json')
        mine = self.client.get('/api/v1/teachers/complaints/', {'student': self.kids['Ahmad'].id}).data
        self.assertEqual([c['description'] for c in mine], ['Kerja rumah tidak disemak'])
        commented = self.client.post(f"/api/v1/teachers/complaints/{made['id']}/comment/", {'text': 'Guru sudah diberi teguran'}, format='json').data
        self.assertEqual(commented['comments'][0]['by'], 'supervisor')
        self.as_role(ADMIN)  # complaints stay with Supervisor and Management
        self.assertEqual(self.client.get('/api/v1/teachers/complaints/', {'student': self.kids['Ahmad'].id}).status_code, 403)

    def test_older_complaints_are_sorted_by_who_made_them(self):
        from teachers.models import TeacherComplaint
        made = {who: TeacherComplaint.objects.create(teacher=self.teacher, date_reported=date(2026, 1, 5), complained_by=who, description='x')
                for who in ('Ibu bapa pelajar', 'Pelajar T5', 'Staf kaunter', 'Jiran')}
        import_module('teachers.migrations.0010_complaints_from_students').guess_complainant(django_apps, None)
        self.assertEqual({who: TeacherComplaint.objects.get(pk=c.pk).complainant_type for who, c in made.items()},
                         {'Ibu bapa pelajar': 'PARENT', 'Pelajar T5': 'STUDENT', 'Staf kaunter': 'STAFF', 'Jiran': 'OTHER'})
