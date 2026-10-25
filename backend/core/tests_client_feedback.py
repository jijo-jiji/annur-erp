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
