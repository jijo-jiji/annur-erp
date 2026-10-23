from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth.models import Group, User
from rest_framework.test import APITestCase
from academic.models import TimeSlot, ClassTimetable
from billing.models import Invoice, PaymentReceipt
from business_config.models import SubjectMaster, PricingTier, BusinessSetting
from core.permissions import ADMIN, SUPERVISOR, MANAGEMENT, ALL_ROLES
from expenses.models import Vendor
from students.models import Lead, Student, StudentEvent


class Phase2Base(APITestCase):
    def setUp(self):
        self.users = {}
        for role in ALL_ROLES:
            g, _ = Group.objects.get_or_create(name=role)
            u = User.objects.create_user(username=role.lower(), password='x-pass-123')
            u.groups.add(g)
            self.users[role] = u
        BusinessSetting.objects.create(key='REGISTRATION_FEE', value='30.00')
        PricingTier.objects.create(level_category='SECONDARY', subject_count=2, price_per_subject=60, total_price=120)
        slot = TimeSlot.objects.create(day='JUMAAT', start_time='09:00', end_time='10:30', period_label='Pagi')
        self.fz = ClassTimetable.objects.create(
            slot=slot, form_level='F5', section='A', max_seats=1,
            subject=SubjectMaster.objects.create(code='FZ', name='Fizik', level_category='UPPER_SEC'))
        self.kim = ClassTimetable.objects.create(
            slot=slot, form_level='F5', section='A', max_seats=5,
            subject=SubjectMaster.objects.create(code='KIM', name='Kimia', level_category='UPPER_SEC'))

    def as_role(self, role):
        self.client.force_authenticate(self.users[role])

    def register(self, name='Ali', class_ids=None):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/students/students/', {
            'full_name': name, 'ic_number': '0', 'form_level': 'F5', 'school_name': 'SK Telipot', 'phone_number': '011',
            'parent1_name': 'Bapa', 'parent1_phone': '012', 'parent1_age': 'AGE_36_45',
            'class_ids': class_ids or [], 'status': 'ACTIVE',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data


class RegistrationTests(Phase2Base):
    def test_registration_waits_for_approval_then_invoices_from_pricing(self):
        data = self.register(class_ids=[self.fz.id, self.kim.id])
        self.assertEqual(data['status'], 'PENDING')  # client cannot set status
        self.assertTrue(data['student_id'].startswith(f'AN-{date.today().year}-'))
        self.assertEqual(Invoice.objects.count(), 0)

        self.assertEqual(self.client.post(f"/api/v1/students/students/{data['id']}/approve/").status_code, 403)
        self.as_role(SUPERVISOR)
        res = self.client.post(f"/api/v1/students/students/{data['id']}/approve/")
        self.assertEqual(res.data['status'], 'ACTIVE')
        # 2 subjects = RM120 package + RM30 registration fee
        self.assertEqual(Decimal(res.data['invoice']['total_payable']), Decimal('150.00'))
        self.assertGreaterEqual(res.data['invoice']['due_date'], date.today().isoformat())  # never already overdue
        types = list(StudentEvent.objects.filter(student_id=data['id']).values_list('event_type', flat=True))
        self.assertIn('REGISTERED', types)
        self.assertIn('APPROVED', types)

    def test_a_student_without_their_own_phone_can_be_registered(self):
        """The form marks the student's own number as optional ("if any"); a young child has none."""
        self.as_role(ADMIN)
        for extra in ({'phone_number': ''}, {}):
            payload = {'full_name': 'Adik Kecil', 'ic_number': '150101-03-1111', 'form_level': 'F5', 'parent1_name': 'Bapa',
                       'parent1_phone': '012-3456789', 'class_ids': [self.kim.id], **extra}
            res = self.client.post('/api/v1/students/students/', payload, format='json')
            self.assertEqual(res.status_code, 201, res.data)
            self.assertEqual(res.data['phone_number'], '')

    def test_reject_needs_comment_and_frees_seats(self):
        data = self.register(class_ids=[self.fz.id])
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"/api/v1/students/students/{data['id']}/reject/").status_code, 400)
        res = self.client.post(f"/api/v1/students/students/{data['id']}/reject/", {'comment': 'Tiada kelas sesuai'})
        self.assertEqual(res.data['status'], 'REJECTED')
        self.assertEqual(ClassTimetable.with_enrolment().get(pk=self.fz.pk).enrolled_count, 0)

    def test_full_class_goes_to_waiting_list(self):
        self.register('Ali', [self.fz.id])  # takes the only seat
        second = self.register('Abu', [self.fz.id])
        self.assertEqual(second['enrolment'][self.fz.id], 'WAITLISTED')
        self.assertEqual(second['waiting_for'][0]['class_id'], self.fz.id)
        # Supervisor moves them in over capacity: F5 FZ becomes -1
        self.as_role(ADMIN)
        entry = self.client.get('/api/v1/students/waitlist/').data[0]
        self.assertEqual(self.client.post(f"/api/v1/students/waitlist/{entry['id']}/enroll/").status_code, 403)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"/api/v1/students/waitlist/{entry['id']}/enroll/").data['status'], 'ENROLLED')
        self.assertEqual(ClassTimetable.with_enrolment().get(pk=self.fz.pk).available_seats, -1)

    def test_parent_qr_registration_is_pending_without_classes(self):
        res = self.client.post('/api/v1/students/parent-self-register/', {
            'full_name': 'Siti', 'ic_number': '0', 'form_level': 'F4', 'phone_number': '011',
            'parent1_name': 'Ibu', 'parent1_phone': '012', 'status': 'ACTIVE', 'credit_balance': '999',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        s = Student.objects.get(student_id=res.data['student_id'])
        self.assertEqual(s.status, 'PENDING')
        self.assertEqual(s.credit_balance, 0)


class LifecycleTests(Phase2Base):
    def setUp(self):
        super().setUp()
        data = self.register(class_ids=[self.kim.id])
        self.sid = data['id']
        self.as_role(SUPERVISOR)
        self.client.post(f'/api/v1/students/students/{self.sid}/approve/')
        self.as_role(ADMIN)

    def url(self, act):
        return f'/api/v1/students/students/{self.sid}/{act}/'

    def test_drop_requires_reason_and_is_logged(self):
        self.assertEqual(self.client.post(self.url('drop'), {'class_id': self.kim.id}).status_code, 400)
        res = self.client.post(self.url('drop'), {'class_id': self.kim.id, 'reason_code': 'MASA'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['enrolled_classes'], [])
        ev = StudentEvent.objects.get(student_id=self.sid, event_type='DROP_SUBJECT')
        self.assertEqual(ev.reason_code, 'MASA')
        self.assertEqual(ev.recorded_by, 'admin')

    def test_change_class(self):
        res = self.client.post(self.url('change_class'), {'from_class': self.kim.id, 'to_class': self.fz.id})
        self.assertEqual(res.data['enrolled_classes'], [self.fz.id])

    def test_hold_resume_terminate(self):
        res = self.client.post(self.url('hold'), {'start': '2026-10-01', 'until': '2026-10-31', 'reason_text': 'Sakit'})
        self.assertEqual(res.data['status'], 'ON_HOLD')
        self.assertEqual(res.data['on_hold_until'], '2026-10-31')
        self.assertEqual(self.client.post(self.url('resume')).data['status'], 'ACTIVE')
        self.assertEqual(self.client.post(self.url('terminate')).status_code, 400)  # reason required
        res = self.client.post(self.url('terminate'), {'reason_code': 'PINDAH', 'date': '2026-11-15'})
        self.assertEqual(res.data['status'], 'TERMINATED')
        self.assertEqual(res.data['left_date'], '2026-11-15')
        self.assertEqual(ClassTimetable.with_enrolment().get(pk=self.kim.pk).enrolled_count, 0)

    def test_history_filters_by_type_and_date(self):
        self.client.post(self.url('note'), {'description': 'Ibu minta laporan', 'action': 'Hubungi Jumaat'})
        rows = self.client.get(f'/api/v1/students/history/?student={self.sid}&type=NOTE').data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['action'], 'Hubungi Jumaat')
        today = date.today().isoformat()
        self.assertTrue(self.client.get(f'/api/v1/students/history/?start={today}&end={today}').data)

    def test_special_fee_only_by_approver(self):
        res = self.client.patch(f'/api/v1/students/students/{self.sid}/', {'special_monthly_fee': '50.00'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_attendance_roster_and_rate(self):
        roster = self.client.get(f'/api/v1/attendance/roster/?class_id={self.kim.id}&date=2026-10-02').data
        self.assertEqual(roster['total'], 1)
        self.assertFalse(roster['saved'])
        res = self.client.post('/api/v1/attendance/roster/', {
            'class_id': self.kim.id, 'date': '2026-10-02', 'note': 'Kelas biasa',
            'marks': [{'student': self.sid, 'present': False, 'note': 'Demam'}],
        }, format='json')
        self.assertTrue(res.data['saved'])
        self.assertEqual(res.data['students'][0]['note'], 'Demam')
        summary = self.client.get('/api/v1/attendance/summary/?start=2026-10-01&end=2026-10-31').data
        self.assertEqual(summary['classes'][0]['rate'], 0.0)
        self.assertEqual((summary['present'], summary['total']), (0, 1))

    def test_results_entry(self):
        res = self.client.post('/api/v1/students/results/', {
            'student': self.sid, 'exam_name': 'Percubaan SPM', 'subject': self.kim.subject_id,
            'grade': 'D', 'mark': 45, 'exam_date': '2026-03-01',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['form_level'], 'F5')


class BillingNumberTests(Phase2Base):
    def test_overpayment_becomes_credit_and_receipt_numbers_per_year(self):
        data = self.register(class_ids=[self.kim.id])
        self.as_role(SUPERVISOR)
        invoice = self.client.post(f"/api/v1/students/students/{data['id']}/approve/").data['invoice']
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/billing/receipts/', {
            'invoice': invoice['id'], 'amount_paid': '200.00', 'payment_method': 'CASH',
            'payment_type': 'MONTHLY', 'notes': 'Bayar lebih',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['receipt_number'], f'REC-{date.today().year}-0001')
        # 1 subject is below the smallest package: RM60 per-subject rate + RM30 registration = RM90
        self.assertEqual(Decimal(invoice['total_payable']), Decimal('90.00'))
        self.assertEqual(Decimal(res.data['overpaid_amount']), Decimal('110.00'))
        self.assertEqual(Student.objects.get(pk=data['id']).credit_balance, Decimal('110.00'))
        self.assertEqual(Invoice.objects.get(pk=invoice['id']).status, 'PAID')

    def test_issued_receipt_cannot_be_edited(self):
        data = self.register(class_ids=[self.kim.id])
        self.as_role(SUPERVISOR)
        invoice = self.client.post(f"/api/v1/students/students/{data['id']}/approve/").data['invoice']
        self.as_role(ADMIN)
        receipt = self.client.post('/api/v1/billing/receipts/', {
            'invoice': invoice['id'], 'amount_paid': '90.00', 'payment_method': 'CASH', 'payment_type': 'MONTHLY',
        }, format='json').data
        for role in (ADMIN, SUPERVISOR, MANAGEMENT):
            self.as_role(role)
            for method in (self.client.patch, self.client.put):
                self.assertEqual(method(f"/api/v1/billing/receipts/{receipt['id']}/", {'amount_paid': '1.00'}, format='json').status_code, 405)
        self.assertEqual(PaymentReceipt.objects.get(pk=receipt['id']).amount_paid, Decimal('90.00'))

    def test_voucher_number_format(self):
        vendor = Vendor.objects.create(vendor_id='V1', vendor_name='Kedai')
        self.as_role(ADMIN)
        for expected in ('PV26-0901', 'PV26-0902'):
            res = self.client.post('/api/v1/expenses/vouchers/', {
                'vendor': vendor.id, 'category': 'X', 'amount': 10, 'items_description': 'a', 'date': '2026-09-05',
            }, format='json')
            self.assertEqual(res.data['pv_number'], expected)
        res = self.client.post('/api/v1/expenses/vouchers/', {
            'vendor': vendor.id, 'category': 'X', 'amount': 10, 'items_description': 'a', 'date': '2026-10-01',
        }, format='json')
        self.assertEqual(res.data['pv_number'], 'PV26-1001')


class LeadFunnelTests(Phase2Base):
    def new_lead(self, **extra):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/students/leads/', {
            'student_name': 'Danish', 'parent_name': 'Faizal', 'phone': '019', 'form_level': 'F5',
            'lead_source': 'TIKTOK', 'campaign': 'SPM 2027', 'notes': 'Tanya pakej sains', **extra,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_new_lead_is_numbered_logged_and_gets_week_reminder(self):
        lead = self.new_lead()
        self.assertEqual(lead['lead_id'], f'LD-{date.today().year}-001')
        self.assertEqual(lead['assigned_to'], 'admin')
        self.assertEqual(lead['activity_count'], 1)
        self.assertEqual(lead['next_follow_up'], (date.today() + timedelta(days=7)).isoformat())

    def test_stage_moves_are_logged_and_cannot_be_patched(self):
        lead = self.new_lead()
        url = f"/api/v1/students/leads/{lead['id']}/"
        self.assertEqual(self.client.patch(url, {'status': 'TRIAL'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url + 'move/', {'stage': 'REGISTERED'}).status_code, 400)
        res = self.client.post(url + 'move/', {'stage': 'CONTENT_1', 'remark': 'Hantar content pertama', 'next_follow_up': '2026-12-01'})
        self.assertEqual(res.data['status'], 'CONTENT_1')
        self.assertEqual(res.data['next_follow_up'], '2026-12-01')
        log = self.client.get(url + 'activities/').data
        self.assertEqual(log[0]['from_stage'], 'ENQUIRY')
        self.assertEqual(log[0]['stage'], 'CONTENT_1')
        self.assertEqual(log[0]['pic'], 'admin')

    def test_lost_needs_reason_and_keeps_its_stage_for_conversion_rates(self):
        lead = self.new_lead()
        url = f"/api/v1/students/leads/{lead['id']}/"
        self.client.post(url + 'move/', {'stage': 'TRIAL'})
        self.assertEqual(self.client.post(url + 'lost/').status_code, 400)
        res = self.client.post(url + 'lost/', {'reason': 'Yuran mahal'})
        self.assertEqual((res.data['status'], res.data['lost_at_stage'], res.data['next_follow_up']), ('LOST', 'TRIAL', None))
        stats = self.client.get('/api/v1/students/leads/stats/').data
        funnel = {row['stage']: row for row in stats['funnel']}
        self.assertEqual(funnel['TRIAL']['reached'], 1)
        self.assertEqual(funnel['WAITING_PAYMENT']['reached'], 0)
        self.assertEqual(funnel['WAITING_PAYMENT']['rate_from_previous'], 0.0)
        self.assertEqual(stats['lost_reasons'], [{'reason': 'Yuran mahal', 'count': 1}])
        # Reopening clears the loss
        self.assertEqual(self.client.post(url + 'move/', {'stage': 'CONTENT_1'}).data['lost_at_stage'], '')

    def register_from(self, lead, **extra):
        """A prospect becomes a student through the full registration form (the lead's id travels with it)."""
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/students/students/', {
            'full_name': 'Danish', 'ic_number': '090101-03-1234', 'form_level': 'F5', 'school_name': 'SMK Telipot',
            'parent1_name': 'Faizal', 'parent1_phone': '019-1234567', 'class_ids': [self.kim.id], 'lead_id': lead['id'], **extra,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_registration_from_a_lead_then_approval_makes_lead_active(self):
        lead = self.new_lead(interested_subjects=['KIM'])
        url = f"/api/v1/students/leads/{lead['id']}/"
        student = self.register_from(lead)
        after = self.client.get(url).data
        self.assertEqual((after['status'], after['converted_student_code']), ('REGISTERED', student['student_id']))
        # the same prospect cannot be registered twice
        again = self.client.post('/api/v1/students/students/', {
            'full_name': 'Lagi', 'ic_number': '1', 'form_level': 'F5', 'school_name': 'X', 'parent1_name': 'P', 'parent1_phone': '1',
            'class_ids': [self.kim.id], 'lead_id': lead['id']}, format='json')
        self.assertEqual(again.status_code, 400)
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/students/students/{student['id']}/approve/")
        self.assertEqual(self.client.get(url).data['status'], 'ACTIVE')
        stats = self.client.get('/api/v1/students/leads/stats/').data
        self.assertEqual((stats['registered'], stats['conversion_pct']), (1, 100.0))

    def test_rejected_registration_sends_lead_back_to_waiting_payment(self):
        lead = self.new_lead()
        url = f"/api/v1/students/leads/{lead['id']}/"
        student = self.register_from(lead)
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/students/students/{student['id']}/reject/", {'comment': 'Kelas penuh'})
        lead = self.client.get(url).data
        self.assertEqual((lead['status'], lead['converted_student']), ('WAITING_PAYMENT', None))
        self.assertIsNotNone(lead['next_follow_up'])

    def test_the_old_quick_convert_shortcut_is_gone(self):
        lead = self.new_lead()
        res = self.client.post(f"/api/v1/students/leads/{lead['id']}/convert_to_student/")
        self.assertEqual(res.status_code, 404)


class MonthlyInvoicingTests(Phase2Base):
    """Monthly run, discounts, student credit and overdue status (j-status.doc Billing)."""

    def setUp(self):
        super().setUp()
        data = self.register(class_ids=[self.fz.id, self.kim.id])  # 2 subjects = RM120 package
        self.sid = data['id']
        self.as_role(SUPERVISOR)
        self.first = self.client.post(f'/api/v1/students/students/{self.sid}/approve/').data['invoice']
        self.next_month = (date.today().replace(day=28) + timedelta(days=5)).replace(day=1)

    def run_month(self, dry_run):
        self.as_role(ADMIN)
        return self.client.post('/api/v1/billing/invoices/monthly_run/',
                                {'month': self.next_month.strftime('%Y-%m'), 'dry_run': dry_run}, format='json').data

    def discount(self, **fields):
        # Discounts are set up through a change request; Management's applies at once
        self.as_role(MANAGEMENT)
        payload = {'name': 'Adik-beradik', 'code': 'sib10', 'mode': 'PERCENT', 'value': '10', **fields}
        res = self.client.post('/api/v1/change-requests/', {'kind': 'DISCOUNT', 'action': 'CREATE', 'payload': payload}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return self.client.get(f"/api/v1/billing/discounts/{res.data['target_id']}/").data

    def test_run_previews_then_creates_once(self):
        preview = self.run_month(True)
        self.assertEqual((preview['ready'], preview['created']), (1, 0))
        self.assertEqual(Invoice.objects.filter(invoice_type='MONTHLY').count(), 0)
        done = self.run_month(False)
        self.assertEqual(done['created'], 1)
        invoice = Invoice.objects.get(invoice_type='MONTHLY')
        self.assertEqual((invoice.total_payable, invoice.registration_fee, invoice.billing_month), (Decimal('120.00'), 0, self.next_month))
        # Running again never double-bills
        self.assertEqual(self.run_month(False)['created'], 0)
        # This month is covered by the first invoice
        self.as_role(ADMIN)
        this_month = self.client.post('/api/v1/billing/invoices/monthly_run/', {'month': date.today().strftime('%Y-%m')}, format='json').data
        self.assertEqual(this_month['rows'][0]['reason'], 'Invois bulan ini sudah ada')

    def test_on_hold_and_walk_in_students_are_not_billed(self):
        self.as_role(ADMIN)
        self.client.post(f'/api/v1/students/students/{self.sid}/hold/', {'until': (date.today() + timedelta(days=60)).isoformat()})
        self.assertEqual(self.run_month(False)['rows'][0]['reason'], 'Ditangguhkan')

    def test_standing_discount_and_credit_are_applied(self):
        disc = self.discount(recurring=True)
        self.as_role(ADMIN)
        self.assertEqual(self.client.patch(f'/api/v1/students/students/{self.sid}/', {'standing_discount': disc['id']}, format='json').status_code, 403)
        self.as_role(SUPERVISOR)
        self.client.patch(f'/api/v1/students/students/{self.sid}/', {'standing_discount': disc['id']}, format='json')
        Student.objects.filter(pk=self.sid).update(credit_balance=Decimal('20.00'))
        self.run_month(False)
        invoice = Invoice.objects.get(invoice_type='MONTHLY')
        # RM120 - 10% = RM108, less RM20 credit = RM88 to pay
        self.assertEqual((invoice.discount_amount, invoice.total_payable, invoice.credit_applied, invoice.balance_due),
                         (Decimal('12.00'), Decimal('108.00'), Decimal('20.00'), Decimal('88.00')))
        self.assertEqual(Student.objects.get(pk=self.sid).credit_balance, 0)
        self.assertEqual(invoice.discount.used_count, 1)

    def test_voucher_code_on_invoice_checks_validity_and_limit(self):
        self.discount(code='MERDEKA', mode='FIXED', value='50', max_uses=1)
        self.as_role(ADMIN)
        url = f"/api/v1/billing/invoices/{self.first['id']}/apply_discount/"
        self.assertEqual(self.client.post(url, {'code': 'TIADA'}).status_code, 400)
        res = self.client.post(url, {'code': 'merdeka'})
        self.assertEqual(res.status_code, 200, res.data)
        # RM120 + RM30 registration - RM50 (only off the monthly fee)
        self.assertEqual(Decimal(res.data['total_payable']), Decimal('100.00'))
        self.assertEqual(self.client.post(url, {'code': 'MERDEKA'}).status_code, 400)  # already discounted
        other = self.register('Abu', [self.kim.id])
        self.as_role(SUPERVISOR)
        inv2 = self.client.post(f"/api/v1/students/students/{other['id']}/approve/").data['invoice']
        self.as_role(ADMIN)
        res = self.client.post(f"/api/v1/billing/invoices/{inv2['id']}/apply_discount/", {'code': 'MERDEKA'})
        self.assertIn('Had penggunaan', str(res.data))

    def test_admin_cannot_edit_invoice_amounts_or_create_discounts(self):
        self.as_role(ADMIN)
        url = f"/api/v1/billing/invoices/{self.first['id']}/"
        self.assertEqual(self.client.patch(url, {'total_payable': '1.00'}, format='json').status_code, 405)
        res = self.client.post('/api/v1/billing/discounts/', {'name': 'X', 'code': 'X', 'value': '5'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_overdue_is_marked_and_partial_payment_keeps_it(self):
        Invoice.objects.filter(pk=self.first['id']).update(due_date=date.today() - timedelta(days=3))
        self.as_role(ADMIN)
        rows = self.client.get('/api/v1/billing/invoices/').data
        self.assertEqual(rows[0]['status'], 'OVERDUE')
        self.client.post('/api/v1/billing/receipts/', {'invoice': self.first['id'], 'amount_paid': '10.00', 'payment_method': 'CASH'}, format='json')
        self.assertEqual(Invoice.objects.get(pk=self.first['id']).status, 'OVERDUE')

    def test_other_invoice_and_reminder_log(self):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/billing/invoices/', {'student': self.sid, 'description': 'Seminar SPM', 'monthly_fee': '50.00'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data['invoice_type'], res.data['total_payable']), ('OTHER', '50.00'))
        res = self.client.post(f"/api/v1/billing/invoices/{res.data['id']}/remind/")
        self.assertEqual((res.data['reminder_count'], res.data['last_reminder_at']), (1, date.today().isoformat()))


class GradeListTests(Phase2Base):
    def add_grade(self, code, label, order, nxt, level='UPPER'):
        from business_config.models import DynamicMasterData
        DynamicMasterData.objects.create(category='1_form', code=code, label=label, status='APPROVED',
                                         meta_info={'order': order, 'next': nxt, 'level': level})

    def test_form_must_come_from_master_grade_list(self):
        self.add_grade('F4', 'Tingkatan 4', 10, 'F5')
        self.add_grade('F5', 'Tingkatan 5', 11, '')
        self.add_grade('PRA', 'Pra-U', 12, '')
        self.as_role(ADMIN)
        body = {'full_name': 'X', 'ic_number': '0', 'phone_number': '1', 'parent1_name': 'P', 'parent1_phone': '2'}
        self.assertEqual(self.client.post('/api/v1/students/students/', {**body, 'form_level': 'S5'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/v1/students/students/', {**body, 'form_level': 'PRA'}, format='json').status_code, 201)
        codes = [g['code'] for g in self.client.get('/api/v1/business-config/grades/').data]
        self.assertEqual(codes, ['F4', 'F5', 'PRA'])

    def test_promotion_moves_to_next_grade_and_frees_old_classes(self):
        self.add_grade('F4', 'Tingkatan 4', 10, 'F5')
        self.add_grade('F5', 'Tingkatan 5', 11, '')
        f4 = self.register('Abu', [])
        Student.objects.filter(pk=f4['id']).update(form_level='F4', status='ACTIVE')
        f5 = self.register('Ali', [self.kim.id])  # F5 class
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/students/students/{f5['id']}/approve/")
        cls_f4 = ClassTimetable.objects.create(slot=self.kim.slot, form_level='F4', section='A', subject=self.kim.subject)
        Student.objects.get(pk=f4['id']).enrolled_classes.add(cls_f4)
        self.as_role(ADMIN)
        self.assertEqual(self.client.post('/api/v1/students/students/promote/').status_code, 403)
        self.as_role(SUPERVISOR)
        preview = self.client.post('/api/v1/students/students/promote/', {'dry_run': True}, format='json').data
        self.assertEqual((preview['ready'], preview['unchanged']), (1, 1))
        self.assertEqual(Student.objects.get(pk=f4['id']).form_level, 'F4')
        done = self.client.post('/api/v1/students/students/promote/', {'dry_run': False}, format='json').data
        self.assertEqual(done['promoted'], 1)
        abu = Student.objects.get(pk=f4['id'])
        self.assertEqual((abu.form_level, abu.enrolled_classes.count()), ('F5', 0))
        ev = StudentEvent.objects.get(student=abu, event_type='PROMOTE')
        self.assertEqual(ev.description, 'Tingkatan 4 → Tingkatan 5')
        self.assertEqual(Student.objects.get(pk=f5['id']).form_level, 'F5')  # no next grade: unchanged


class CustomFeeGroupTests(Phase2Base):
    """Management adds a fee group and points a new grade (e.g. Darjah 1) at it, with no code change."""

    def test_new_group_and_grade_get_their_own_fee(self):
        from business_config.models import DynamicMasterData
        from students import services
        DynamicMasterData.objects.create(category='1_form', code='S1', label='Darjah 1', status='APPROVED',
                                         meta_info={'order': 1, 'level': 'PRIMARY', 'next': '', 'fee_group': 'DARJAH_1_4'})
        self.as_role(MANAGEMENT)
        res = self.client.post('/api/v1/change-requests/', {'kind': 'PRICING_TIER', 'action': 'CREATE', 'payload': {
            'level_category': 'darjah 1 4', 'group_label': 'Darjah 1-4', 'subject_count': 2, 'price_per_subject': '45'}}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        tier = PricingTier.objects.get(pk=res.data['target_id'])
        self.assertEqual(tier.level_category, 'DARJAH_1_4')
        self.assertEqual(float(tier.total_price), 90.0)  # the total follows the per-subject rate
        dup = self.client.post('/api/v1/change-requests/', {'kind': 'PRICING_TIER', 'action': 'CREATE', 'payload': {
            'level_category': 'DARJAH_1_4', 'subject_count': 2, 'price_per_subject': '40'}}, format='json')
        self.assertEqual(dup.status_code, 400)

        student = Student.objects.create(full_name='Adik', ic_number='1', form_level='S1', phone_number='1', join_date='2026-01-01',
                                         parent1_name='P', parent1_phone='2')
        student.enrolled_classes.add(self.fz, self.kim)
        self.assertEqual(services.monthly_fee(student), 90)
        # A grade with no fee group yet is charged nothing rather than the secondary rate
        DynamicMasterData.objects.create(category='1_form', code='S2', label='Darjah 2', status='APPROVED',
                                         meta_info={'order': 2, 'level': 'PRIMARY', 'next': ''})
        student.form_level = 'S2'
        self.assertEqual(services.monthly_fee(student), 0)


class LeadPartialInfoTests(Phase2Base):
    """A lead is saved with whatever is known; completeness is enforced when it becomes a student."""

    def post_lead(self, **fields):
        self.as_role(ADMIN)
        return self.client.post('/api/v1/students/leads/', fields, format='json')

    def test_only_a_phone_and_a_source_are_needed_and_the_rest_is_listed_as_missing(self):
        res = self.post_lead(phone='012-345 6789', lead_source='TIKTOK')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data['student_name'], res.data['parent_name'], res.data['form_level']), ('', '', ''))
        self.assertEqual(res.data['missing_fields'], ['Nama pelajar', 'Nama ibu bapa', 'Tingkatan', 'Sekolah', 'Subjek diminati'])

    def test_missing_list_shrinks_as_details_are_added(self):
        lead = self.post_lead(phone='012-3456789', lead_source='TIKTOK').data
        res = self.client.patch(f"/api/v1/students/leads/{lead['id']}/", {
            'student_name': 'Danish', 'parent_name': 'Faizal', 'form_level': 'F5', 'school_name': 'SMK Telipot',
            'interested_subjects': ['KIM']}, format='json')
        self.assertEqual((res.status_code, res.data['missing_fields']), (200, []))

    def test_phone_and_source_are_still_required(self):
        self.assertEqual(self.post_lead(lead_source='TIKTOK').status_code, 400)
        self.assertEqual(self.post_lead(phone='   ', lead_source='TIKTOK').status_code, 400)
        self.assertEqual(self.post_lead(phone='abc', lead_source='TIKTOK').status_code, 400)
        no_source = self.post_lead(phone='012-3456789')
        self.assertEqual(no_source.status_code, 400)
        self.assertIn('lead_source', no_source.data)

    def test_an_unknown_grade_is_still_refused_but_a_blank_one_is_not(self):
        self.assertEqual(self.post_lead(phone='012-3456789', lead_source='TIKTOK', form_level='X9').status_code, 400)
        self.assertEqual(self.post_lead(phone='012-3456789', lead_source='TIKTOK', form_level='').status_code, 201)


class LeadStageTrailTests(Phase2Base):
    """Who moved a lead, going back, and the eight default stages."""

    def lead(self):
        self.as_role(ADMIN)
        return self.client.post('/api/v1/students/leads/', {'phone': '012-3456789', 'lead_source': 'TIKTOK', 'student_name': 'Danish'}, format='json').data

    def test_the_eight_stages_in_order(self):
        self.assertEqual(Lead.STAGE_ORDER, ['ENQUIRY', 'CONTENT_1', 'CONTENT_2', 'CONTENT_3', 'TRIAL', 'WAITING_PAYMENT', 'REGISTERED', 'ACTIVE'])
        self.as_role(ADMIN)
        stats = self.client.get('/api/v1/students/leads/stats/').data
        self.assertEqual([f['label'] for f in stats['funnel']],
                         ['Enquiry', 'Content 1', 'Content 2', 'Content 3', 'Free Trial', 'Waiting Payment', 'Registered', 'Active'])

    def test_a_move_records_the_signed_in_user_and_the_card_shows_them(self):
        lead = self.lead()
        self.assertEqual(lead['last_move_by'], '')  # nothing has moved yet
        url = f"/api/v1/students/leads/{lead['id']}/"
        self.as_role(SUPERVISOR)
        moved = self.client.post(url + 'move/', {'stage': 'CONTENT_1'}).data
        self.assertEqual(moved['last_move_by'], 'supervisor')  # who really did it, not the lead's PIC
        self.assertEqual(moved['assigned_to'], 'admin')
        self.assertIsNotNone(moved['last_move_at'])
        listed = next(l for l in self.client.get('/api/v1/students/leads/').data if l['id'] == lead['id'])
        self.assertEqual(listed['last_move_by'], 'supervisor')
        log = self.client.get(url + 'activities/').data
        self.assertEqual((log[0]['pic'], log[0]['from_stage'], log[0]['stage']), ('supervisor', 'ENQUIRY', 'CONTENT_1'))
        self.assertTrue(log[0]['created_at'])  # the exact time is stored

    def test_going_back_is_allowed_and_worded_as_going_back(self):
        lead = self.lead()
        url = f"/api/v1/students/leads/{lead['id']}/"
        self.client.post(url + 'move/', {'stage': 'CONTENT_2'})
        self.client.post(url + 'move/', {'stage': 'CONTENT_1'})
        log = self.client.get(url + 'activities/').data
        self.assertEqual(log[0]['action'], 'Kembali ke peringkat sebelumnya: Content 2 → Content 1')
        self.assertEqual(log[1]['action'], 'Tukar peringkat: Enquiry → Content 2')
        self.assertEqual(self.client.get(url).data['status'], 'CONTENT_1')

    def test_content_3_sits_between_content_2_and_the_free_trial(self):
        lead = self.lead()
        url = f"/api/v1/students/leads/{lead['id']}/"
        self.assertEqual(self.client.post(url + 'move/', {'stage': 'CONTENT_3'}).data['status'], 'CONTENT_3')
        self.assertEqual(self.client.post(url + 'move/', {'stage': 'CONTACTED'}).status_code, 400)  # retired

    def test_retiring_contacted_moves_those_leads_to_enquiry_and_says_so(self):
        import importlib
        from django.apps import apps
        from business_config.models import BusinessSetting
        from students.models import LeadActivity
        migration = importlib.import_module('students.migrations.0012_lead_stages_and_partial_info')
        old = Lead.objects.create(lead_id='LD-OLD-1', student_name='Lama', phone='012', form_level='F5', status='CONTACTED')
        lost = Lead.objects.create(lead_id='LD-OLD-2', student_name='Hilang', phone='013', form_level='F5', status='LOST', lost_at_stage='CONTACTED')
        LeadActivity.objects.create(lead=old, stage='CONTACTED', from_stage='ENQUIRY', action='Tukar peringkat', pic='Admin')
        BusinessSetting.objects.create(key='LEAD_LABEL_CONTACTED', value='Dihubungi')
        migration.retire_contacted_stage(apps, None)
        old.refresh_from_db()
        lost.refresh_from_db()
        self.assertEqual((old.status, lost.lost_at_stage), ('ENQUIRY', 'ENQUIRY'))
        self.assertFalse(LeadActivity.objects.filter(stage='CONTACTED').exists())
        self.assertFalse(BusinessSetting.objects.filter(key='LEAD_LABEL_CONTACTED').exists())
        self.assertTrue(LeadActivity.objects.filter(lead=old, action='Peringkat Contacted dimansuhkan', pic='Sistem').exists())


class RegistrationCompletenessTests(Phase2Base):
    """Only a complete registration can become an active student."""

    def qr_student(self, **extra):
        self.client.force_authenticate(None)
        payload = {'full_name': 'Anak QR', 'ic_number': '150101-03-1111', 'form_level': 'F5', 'school_name': 'SMK Telipot',
                   'parent1_name': 'Ibu QR', 'parent1_phone': '013-9876543', **extra}
        res = self.client.post('/api/v1/students/parent-self-register/', payload, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return Student.objects.get(student_id=res.data['student_id'])

    def approve(self, student):
        self.as_role(SUPERVISOR)
        return self.client.post(f'/api/v1/students/students/{student.id}/approve/')

    def test_a_qr_registration_without_classes_cannot_be_approved_until_a_class_is_chosen(self):
        student = self.qr_student()
        self.as_role(SUPERVISOR)
        listed = next(s for s in self.client.get('/api/v1/students/students/').data if s['id'] == student.id)
        self.assertEqual(listed['registration_gaps'], ['Pilihan kelas'])
        refused = self.approve(student)
        self.assertEqual(refused.status_code, 400)
        self.assertIn('Pilihan kelas', refused.data['detail'])
        self.assertEqual(Invoice.objects.count(), 0)  # no invoice for an incomplete record
        # the counter completes it
        self.as_role(ADMIN)
        self.client.post(f'/api/v1/students/students/{student.id}/enroll/', {'class_id': self.kim.id})
        self.assertEqual(self.approve(student).status_code, 200)

    def test_every_missing_item_is_named(self):
        student = self.qr_student()
        Student.objects.filter(pk=student.pk).update(ic_number='', school_name='', parent1_name='', parent1_phone='')
        refused = self.approve(Student.objects.get(pk=student.pk))
        for label in ('No. kad pengenalan', 'Sekolah', 'Nama penjaga', 'No. telefon penjaga', 'Pilihan kelas'):
            self.assertIn(label, refused.data['detail'])

    def test_a_waiting_list_place_counts_as_a_class_choice(self):
        self.register(class_ids=[self.fz.id])                        # takes the only seat of Fizik
        second = self.register(name='Aina', class_ids=[self.fz.id])  # waits for a seat
        self.assertEqual(second['registration_gaps'], [])
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"/api/v1/students/students/{second['id']}/approve/").status_code, 200)

    def test_a_walk_in_needs_a_description_instead_of_classes(self):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/students/students/', {
            'full_name': 'Walk In', 'ic_number': '1', 'form_level': 'F5', 'school_name': 'SMK', 'student_type': 'WALK_IN',
            'parent1_name': 'P', 'parent1_phone': '1'}, format='json')
        self.assertEqual(res.data['registration_gaps'], ['Keterangan walk-in'])
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"/api/v1/students/students/{res.data['id']}/approve/").status_code, 400)
        self.client.patch(f"/api/v1/students/students/{res.data['id']}/", {'walk_in_description': 'Kelas intensif Sabtu'}, format='json')
        self.assertEqual(self.client.post(f"/api/v1/students/students/{res.data['id']}/approve/").status_code, 200)

    def test_rejecting_an_incomplete_registration_is_still_possible(self):
        student = self.qr_student()
        self.as_role(SUPERVISOR)
        res = self.client.post(f'/api/v1/students/students/{student.id}/reject/', {'comment': 'Tidak lengkap'})
        self.assertEqual(res.status_code, 200)


class LeadImportTests(Phase2Base):
    """CSV import: every row is checked against the centre's own lists, and nothing is created by a preview."""

    URL = '/api/v1/students/leads/import/'

    def setUp(self):
        super().setUp()
        from business_config.models import DynamicMasterData
        for category, code, label in (('3_lead_source', 'TIKTOK', 'TikTok Ads / Live'), ('3_lead_source', 'FB', 'Facebook Ads & Page'),
                                      ('22_lead_campaign', 'SPM27', 'SPM 2027'), ('6_school', 'SMKT', 'SMK Telipot')):
            DynamicMasterData.objects.create(category=category, code=code, label=label, status='APPROVED')
        self.as_role(ADMIN)

    def send(self, rows, commit=False, **defaults):
        return self.client.post(self.URL, {'rows': rows, 'defaults': defaults, 'commit': commit, 'filename': 'okt.csv'}, format='json')

    GOOD = {'student_name': 'Aina', 'parent_name': 'Puan Sarah', 'phone': '012 345 6789', 'lead_source': 'tiktok ads / live',
            'form_level': 'Tingkatan 5', 'school_name': 'smk telipot', 'subjects': 'Fizik; kimia', 'campaign': 'spm 2027'}

    def test_a_preview_checks_and_cleans_but_creates_nothing(self):
        res = self.send([self.GOOD])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data['committed'], res.data['counts']), (False, {'ok': 1, 'duplicate': 0, 'error': 0}))
        self.assertEqual(res.data['rows'][0]['phone'], '012-3456789')
        self.assertEqual(Lead.objects.count(), 0)

    def test_importing_creates_leads_with_codes_from_the_lists_and_logs_who_did_it(self):
        res = self.send([self.GOOD, {'phone': '019-8881122', 'lead_source': 'FB'}], commit=True, status='CONTENT_1')
        self.assertEqual((res.data['counts'], len(res.data['created'])), ({'ok': 2, 'duplicate': 0, 'error': 0}, 2))
        lead = Lead.objects.get(phone='012-3456789')
        self.assertEqual((lead.lead_source, lead.form_level, lead.school_name, lead.campaign), ('TIKTOK', 'F5', 'SMK Telipot', 'SPM 2027'))
        self.assertEqual((lead.interested_subjects, lead.status, lead.assigned_to), (['FZ', 'KIM'], 'CONTENT_1', 'admin'))
        self.assertEqual(lead.missing_fields, [])
        partial = Lead.objects.get(phone='019-8881122')
        self.assertEqual(partial.missing_fields[:3], ['Nama pelajar', 'Nama ibu bapa', 'Tingkatan'])
        entry = lead.activities.get()
        self.assertEqual((entry.action, entry.pic, entry.remark), ('Diimport dari CSV', 'admin', 'okt.csv'))

    def test_the_zero_that_excel_drops_is_put_back_and_country_codes_are_understood(self):
        rows = [{'phone': '123456789', 'lead_source': 'FB'}, {'phone': '+60 11-2345 6789', 'lead_source': 'FB'}, {'phone': '60198881122', 'lead_source': 'FB'}]
        res = self.send(rows)
        self.assertEqual([r['phone'] for r in res.data['rows']], ['012-3456789', '011-23456789', '019-8881122'])

    def test_rows_that_cannot_be_imported_say_why(self):
        rows = [
            {'lead_source': 'FB'},                                                         # no phone
            {'phone': '012-3456789', 'lead_source': 'Radio'},                              # unknown source
            {'phone': '012-3456780', 'lead_source': 'FB', 'form_level': 'Tingkatan 9'},    # unknown grade
            {'phone': '012-3456781', 'lead_source': 'FB', 'subjects': 'Fizik; Silat'},     # unknown subject
            {'phone': '012-3456782', 'lead_source': 'FB', 'email': 'bukan-emel'},          # bad e-mail
            {'phone': '012-3456783', 'lead_source': 'FB', 'campaign': 'Tiada Kempen Ini'}, # campaign not in Data induk
            {'phone': '012-3456784'},                                                      # no source anywhere
        ]
        res = self.send(rows)
        self.assertEqual(res.data['counts'], {'ok': 0, 'duplicate': 0, 'error': 7})
        said = [' '.join(r['messages']) for r in res.data['rows']]
        for part, text in zip(('telefon', 'Radio', 'Tingkatan 9', 'Silat', 'E-mel', 'Tiada Kempen Ini', 'Sumber diperlukan'), said):
            self.assertIn(part, text)

    def test_a_default_source_fills_rows_that_have_none(self):
        res = self.send([{'phone': '012-3456784'}], commit=True, lead_source='FB', campaign='SPM 2027', assigned_to='Cikgu Aina')
        self.assertEqual(res.data['counts']['ok'], 1)
        lead = Lead.objects.get()
        self.assertEqual((lead.lead_source, lead.campaign, lead.assigned_to), ('FB', 'SPM 2027', 'Cikgu Aina'))

    def test_numbers_the_centre_already_has_are_duplicates_not_new_leads(self):
        self.client.post('/api/v1/students/leads/', {'phone': '019-9881122', 'lead_source': 'FB'}, format='json')
        student = self.register(class_ids=[self.kim.id])  # parent 1 phone is 012
        Student.objects.filter(pk=student['id']).update(parent1_phone='013-5550000', phone_number='')
        rows = [
            {'phone': '0199881122', 'lead_source': 'FB'},     # same as an existing lead
            {'phone': '+6013 555 0000', 'lead_source': 'FB'}, # same as a student's parent
            {'phone': '017-1112222', 'lead_source': 'FB'},    # new
            {'phone': '017 111 2222', 'lead_source': 'FB'},   # the same number again, later in the file
        ]
        res = self.send(rows, commit=True)
        self.assertEqual(res.data['counts'], {'ok': 1, 'duplicate': 3, 'error': 0})
        self.assertIn('prospek LD-', res.data['rows'][0]['messages'][0])
        self.assertIn('pelajar AN-', res.data['rows'][1]['messages'][0])
        self.assertIn('baris 3', res.data['rows'][3]['messages'][0])
        self.assertEqual(Lead.objects.count(), 2)

    def test_importing_the_same_file_twice_adds_nothing_the_second_time(self):
        first = self.send([self.GOOD], commit=True)
        second = self.send([self.GOOD], commit=True)
        self.assertEqual((first.data['counts']['ok'], second.data['counts']), (1, {'ok': 0, 'duplicate': 1, 'error': 0}))
        self.assertEqual(Lead.objects.count(), 1)

    def test_bad_rows_do_not_stop_the_good_ones(self):
        res = self.send([self.GOOD, {'lead_source': 'FB'}], commit=True)
        self.assertEqual(res.data['counts'], {'ok': 1, 'duplicate': 0, 'error': 1})
        self.assertEqual(Lead.objects.count(), 1)

    def test_an_unknown_default_or_an_empty_or_huge_file_is_refused(self):
        self.assertEqual(self.send([self.GOOD], lead_source='Radio').status_code, 400)
        self.assertEqual(self.send([self.GOOD], status='REGISTERED').status_code, 400)
        self.assertEqual(self.send([]).status_code, 400)
        self.assertEqual(self.send([{'phone': '012-3456789', 'lead_source': 'FB'}] * 1001).status_code, 400)

    def test_a_date_column_sets_the_enquiry_date(self):
        res = self.send([{'phone': '012-3456789', 'lead_source': 'FB', 'enquiry_date': '05/10/2026'}], commit=True)
        self.assertEqual(res.data['counts']['ok'], 1)
        self.assertEqual(Lead.objects.get().enquiry_date.isoformat(), '2026-10-05')
        self.assertEqual(self.send([{'phone': '012-3456780', 'lead_source': 'FB', 'enquiry_date': 'semalam'}]).data['counts']['error'], 1)

    def test_every_staff_role_may_import_and_nobody_signed_out(self):
        for role in (ADMIN, SUPERVISOR, MANAGEMENT):
            self.as_role(role)
            self.assertEqual(self.send([self.GOOD]).status_code, 200)
        self.client.force_authenticate(None)
        self.assertIn(self.send([self.GOOD]).status_code, (401, 403))
