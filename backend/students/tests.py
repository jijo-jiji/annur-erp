from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth.models import Group, User
from rest_framework.test import APITestCase
from academic.models import TimeSlot, ClassTimetable
from billing.models import Invoice, PaymentReceipt
from business_config.models import SubjectMaster, PricingTier, BusinessSetting
from core.permissions import ADMIN, SUPERVISOR, MANAGEMENT, ALL_ROLES
from expenses.models import Vendor
from students.models import Student, StudentEvent


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
            'full_name': name, 'ic_number': '0', 'form_level': 'F5', 'phone_number': '011',
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
        res = self.client.post(url + 'move/', {'stage': 'CONTACTED', 'remark': 'Hubungi via WhatsApp', 'next_follow_up': '2026-12-01'})
        self.assertEqual(res.data['status'], 'CONTACTED')
        self.assertEqual(res.data['next_follow_up'], '2026-12-01')
        log = self.client.get(url + 'activities/').data
        self.assertEqual(log[0]['from_stage'], 'ENQUIRY')
        self.assertEqual(log[0]['stage'], 'CONTACTED')
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

    def test_convert_then_approval_makes_lead_active(self):
        lead = self.new_lead(interested_subjects=['KIM'])
        url = f"/api/v1/students/leads/{lead['id']}/"
        res = self.client.post(url + 'convert_to_student/', {'class_ids': [self.kim.id]}, format='json')
        self.assertEqual(res.data['status'], 'REGISTERED')
        self.assertEqual(self.client.post(url + 'convert_to_student/').status_code, 400)
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/students/students/{res.data['student']['id']}/approve/")
        lead = self.client.get(url).data
        self.assertEqual(lead['status'], 'ACTIVE')
        stats = self.client.get('/api/v1/students/leads/stats/').data
        self.assertEqual((stats['registered'], stats['conversion_pct']), (1, 100.0))

    def test_rejected_registration_sends_lead_back_to_waiting_payment(self):
        lead = self.new_lead()
        url = f"/api/v1/students/leads/{lead['id']}/"
        student = self.client.post(url + 'convert_to_student/').data['student']
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/students/students/{student['id']}/reject/", {'comment': 'Kelas penuh'})
        lead = self.client.get(url).data
        self.assertEqual((lead['status'], lead['converted_student']), ('WAITING_PAYMENT', None))
        self.assertIsNotNone(lead['next_follow_up'])


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
        self.as_role(SUPERVISOR)
        res = self.client.post('/api/v1/billing/discounts/', {'name': 'Adik-beradik', 'code': 'sib10', 'mode': 'PERCENT', 'value': '10', **fields}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

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
