from datetime import date, time, timedelta
from decimal import Decimal
from django.contrib.auth.models import Group, User
from rest_framework.test import APITestCase
from academic.models import TimeSlot, ClassTimetable, ClassRescheduleLog
from business_config.models import SubjectMaster
from core.permissions import ADMIN, SUPERVISOR, MANAGEMENT, ALL_ROLES
from teachers.models import Teacher, TeacherAttendance, TeacherPayment, StaffMember, StaffAttendance, LeaveRequest, StaffHistory

FRIDAY = date(2026, 10, 2)  # a Friday (JUMAAT)


class PayrollBase(APITestCase):
    def setUp(self):
        self.users = {}
        for role in ALL_ROLES:
            g, _ = Group.objects.get_or_create(name=role)
            u = User.objects.create_user(username=role.lower(), password='x-pass-123')
            u.groups.add(g)
            self.users[role] = u
        self.ali = Teacher.objects.create(teacher_code='ALI', full_name='Cikgu Ali', phone_number='011', rate_per_session=60)
        self.siti = Teacher.objects.create(teacher_code='STI', full_name='Cikgu Siti', phone_number='012', rate_per_session=50, teacher_type='REPLACEMENT')
        slot = TimeSlot.objects.create(day='JUMAAT', start_time='09:00', end_time='10:30', period_label='Pagi')
        other = TimeSlot.objects.create(day='SABTU', start_time='09:00', end_time='10:30', period_label='Pagi')
        self.fz = ClassTimetable.objects.create(slot=slot, form_level='F5', teacher=self.ali,
                                                 subject=SubjectMaster.objects.create(code='FZ', name='Fizik', level_category='UPPER_SEC'))
        self.kim = ClassTimetable.objects.create(slot=slot, form_level='F4', teacher=self.ali,
                                                  subject=SubjectMaster.objects.create(code='KIM', name='Kimia', level_category='UPPER_SEC'))
        self.sat = ClassTimetable.objects.create(slot=other, form_level='F3', teacher=self.ali,
                                                  subject=SubjectMaster.objects.create(code='BIO', name='Biologi', level_category='UPPER_SEC'))

    def as_role(self, role):
        self.client.force_authenticate(self.users[role])

    def save(self, marks, on=FRIDAY):
        return self.client.post('/api/v1/teachers/attendance/roster/', {'date': on.isoformat(), 'marks': marks}, format='json')


class TeacherPayrollTests(PayrollBase):
    def test_roster_lists_the_days_classes_plus_moved_classes(self):
        self.as_role(ADMIN)
        ClassRescheduleLog.objects.create(timetable_class=self.sat, tarikh_batal=date(2026, 10, 3), tarikh_ganti=FRIDAY)
        codes = [c['class_code'] for c in self.client.get(f'/api/v1/teachers/attendance/roster/?date={FRIDAY}').data['classes']]
        self.assertEqual(sorted(codes), sorted([self.fz.class_code, self.kim.class_code, self.sat.class_code]))

    def test_attendance_rules_and_admin_cannot_see_pay(self):
        self.as_role(ADMIN)
        self.assertEqual(self.save([{'class_id': self.fz.id, 'status': 'REPLACED', 'reason': 'Sakit'}]).status_code, 400)  # no replacement
        self.assertEqual(self.save([{'class_id': self.fz.id, 'status': 'ABSENT'}]).status_code, 400)  # no reason
        res = self.save([
            {'class_id': self.fz.id, 'status': 'REPLACED', 'reason': 'Sakit', 'replacement_teacher': self.siti.id},
            {'class_id': self.kim.id, 'status': 'PRESENT'},
        ])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(TeacherAttendance.objects.get(timetable_class=self.fz).allowance_earned, Decimal('50.00'))  # replacement's rate
        rows = self.client.get('/api/v1/teachers/attendance/summary/?month=2026-10').data
        self.assertNotIn('amount', rows[0])
        self.assertNotIn('allowance_earned', self.client.get('/api/v1/teachers/attendance/').data[0])
        self.assertEqual(self.client.get('/api/v1/teachers/payments/').status_code, 403)

    def test_full_pay_flow_and_attendance_lock(self):
        self.as_role(ADMIN)
        self.save([
            {'class_id': self.fz.id, 'status': 'PRESENT'},
            {'class_id': self.kim.id, 'status': 'REPLACED', 'reason': 'Kursus', 'replacement_teacher': self.siti.id},
        ])
        self.save([{'class_id': self.fz.id, 'status': 'PRESENT'}], on=date(2026, 10, 9))
        self.as_role(SUPERVISOR)
        res = self.client.post('/api/v1/teachers/payments/calculate/', {'month': '2026-10'}, format='json')
        pays = {p['teacher_code']: p for p in res.data['payments']}
        self.assertEqual((pays['ALI']['sessions'], pays['ALI']['calculated_amount']), (2, '120.00'))
        self.assertEqual(pays['STI']['calculated_amount'], '50.00')
        ali = pays['ALI']['id']
        url = f'/api/v1/teachers/payments/{ali}/'
        self.assertEqual(self.client.post(url + 'adjust/', {'adjustment': '-20'}).status_code, 400)  # needs a reason
        res = self.client.post(url + 'adjust/', {'adjustment': '-20', 'adjustment_note': 'Lebih bayar bulan lepas'})
        self.assertEqual(res.data['amount_payable'], '100.00')
        self.assertEqual(self.client.post(url + 'approve/').status_code, 403)  # Management only
        self.client.post(url + 'verify/')
        # Verified pay locks that teacher's attendance for the month
        self.as_role(ADMIN)
        self.assertEqual(self.save([{'class_id': self.fz.id, 'status': 'ABSENT', 'reason': 'x'}]).status_code, 400)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(url + 'mark_paid/', {'payment_method': 'CASH'}).status_code, 400)  # not approved yet
        self.assertEqual(self.client.post(url + 'reject/').status_code, 400)  # needs a reason
        self.client.post(url + 'approve/', {'comment': 'OK'})
        res = self.client.post(url + 'mark_paid/', {'payment_method': 'BANK_TRANSFER', 'payment_reference': 'TRX1', 'paid_date': '2026-11-05'})
        self.assertEqual((res.data['status'], res.data['paid_by'], res.data['paid_date']), ('PAID', 'management', '2026-11-05'))
        sessions = self.client.get(url + 'sessions/').data
        self.assertEqual(len(sessions), 2)
        # Recalculating leaves paid pay untouched
        self.as_role(SUPERVISOR)
        res = self.client.post('/api/v1/teachers/payments/calculate/', {'month': '2026-10'}, format='json')
        self.assertEqual(res.data['kept'], 1)
        self.assertEqual(TeacherPayment.objects.get(pk=ali).amount_payable, Decimal('100.00'))

    def test_rejected_pay_can_be_recalculated(self):
        self.as_role(ADMIN)
        self.save([{'class_id': self.fz.id, 'status': 'PRESENT'}])
        self.as_role(SUPERVISOR)
        pid = self.client.post('/api/v1/teachers/payments/calculate/', {'month': '2026-10'}, format='json').data['payments'][0]['id']
        self.client.post(f'/api/v1/teachers/payments/{pid}/verify/')
        self.as_role(MANAGEMENT)
        self.client.post(f'/api/v1/teachers/payments/{pid}/reject/', {'comment': 'Semak kelas 2 Okt'})
        # Rejection unlocks attendance; the correction flows into the recalculation
        self.as_role(ADMIN)
        self.assertEqual(self.save([{'class_id': self.fz.id, 'status': 'CANCELLED'}, {'class_id': self.kim.id, 'status': 'PRESENT'}]).status_code, 200)
        self.as_role(SUPERVISOR)
        res = self.client.post('/api/v1/teachers/payments/calculate/', {'month': '2026-10'}, format='json')
        self.assertEqual((res.data['payments'][0]['status'], res.data['payments'][0]['sessions']), ('DRAFT', 1))


class StaffHRTests(APITestCase):
    def setUp(self):
        self.users = {}
        for role in ALL_ROLES:
            g, _ = Group.objects.get_or_create(name=role)
            u = User.objects.create_user(username=role.lower(), password='x-pass-123')
            u.groups.add(g)
            self.users[role] = u
        self.siti = StaffMember.objects.create(staff_id='STF-001', name='Siti', role='Admin Kaunter', phone='1',
                                               user=self.users[ADMIN], al_entitlement=2,
                                               work_start=time(8, 30), work_end=time(17, 30), work_days='0,1,2,3,4,5')
        self.other = StaffMember.objects.create(staff_id='STF-002', name='Fizah', role='Admin 2', phone='2')

    def as_role(self, role):
        self.client.force_authenticate(self.users[role])

    def test_only_management_adds_staff_and_changes_job_details(self):
        self.as_role(SUPERVISOR)
        payload = {'name': 'Baru', 'role': 'Kerani', 'phone': '3'}
        self.assertEqual(self.client.post('/api/v1/teachers/staff/', payload, format='json').status_code, 403)
        self.as_role(MANAGEMENT)
        res = self.client.post('/api/v1/teachers/staff/', {**payload, 'employment_type': 'CONTRACT'}, format='json')
        self.assertEqual(res.data['staff_id'], 'STF-003')
        self.as_role(SUPERVISOR)
        url = f"/api/v1/teachers/staff/{self.siti.id}/"
        self.assertEqual(self.client.patch(url, {'role': 'Pengurus'}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(url, {'emergency_name': 'Ibu Siti'}, format='json').status_code, 200)
        self.as_role(MANAGEMENT)
        self.client.patch(url, {'role': 'Ketua Kaunter', 'history_remark': 'Naik pangkat'}, format='json')
        h = StaffHistory.objects.get(staff=self.siti)
        self.assertIn('Ketua Kaunter', h.change)
        self.assertEqual(h.remark, 'Naik pangkat')

    def test_staff_can_update_only_own_personal_details(self):
        self.as_role(ADMIN)
        self.assertEqual(self.client.patch(f"/api/v1/teachers/staff/{self.siti.id}/", {'address': 'Telipot'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(f"/api/v1/teachers/staff/{self.siti.id}/", {'al_entitlement': 30}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f"/api/v1/teachers/staff/{self.other.id}/", {'address': 'X'}, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/v1/teachers/staff/me/').data['staff_id'], 'STF-001')

    def test_clock_is_for_own_record_and_late_early_are_calculated(self):
        self.as_role(SUPERVISOR)  # no linked staff record
        self.assertEqual(self.client.post('/api/v1/teachers/staff-attendance/toggle_clock/').status_code, 400)
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/teachers/staff-attendance/toggle_clock/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(StaffAttendance.objects.get().staff, self.siti)
        # Supervisor corrects a day: 08:50 in, 17:00 out on a Monday
        self.as_role(SUPERVISOR)
        body = {'staff': self.siti.id, 'date': '2026-09-07', 'clock_in': '08:50', 'clock_out': '17:00'}
        self.assertEqual(self.client.post('/api/v1/teachers/staff-attendance/correct/', body, format='json').status_code, 400)  # needs a note
        res = self.client.post('/api/v1/teachers/staff-attendance/correct/', {**body, 'note': 'Lupa clock'}, format='json')
        self.assertEqual((res.data['late_minutes'], res.data['early_minutes']), (20, 30))
        report = self.client.get('/api/v1/teachers/staff/report/?month=2026-09').data['attendance']
        row = next(r for r in report['rows'] if r['code'] == 'STF-001')
        # (the real clock-in above may also count as late, depending on when the test runs)
        self.assertIn(date(2026, 9, 7), row['late_dates'])
        self.assertEqual(row['early_dates'], [date(2026, 9, 7)])
        # Admin cannot see other staff's attendance or the report
        self.as_role(ADMIN)
        self.assertEqual(self.client.get('/api/v1/teachers/staff/report/').status_code, 403)

    def test_leave_counts_working_days_checks_balance_and_no_self_approval(self):
        self.as_role(ADMIN)
        # Own leave only
        self.assertEqual(self.client.post('/api/v1/teachers/leave-requests/', {
            'staff': self.other.id, 'leave_type': 'AL', 'start_date': '2026-10-05', 'end_date': '2026-10-05', 'reason': 'x'}, format='json').status_code, 403)
        # Sat 3 Oct - Mon 5 Oct: Sunday is not a working day, so 2 days
        res = self.client.post('/api/v1/teachers/leave-requests/', {
            'staff': self.siti.id, 'leave_type': 'AL', 'start_date': '2026-10-03', 'end_date': '2026-10-05', 'reason': 'Kenduri'}, format='json')
        self.assertEqual((res.data['days_count'], res.data['leave_id']), (2, 'LV-2026-001'))
        first = res.data['id']
        res = self.client.post('/api/v1/teachers/leave-requests/', {
            'staff': self.siti.id, 'leave_type': 'AL', 'start_date': '2026-10-06', 'end_date': '2026-10-06', 'reason': 'Lagi'}, format='json')
        second = res.data['id']
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f'/api/v1/teachers/leave-requests/{first}/reject/').status_code, 400)  # reason required
        self.assertEqual(self.client.post(f'/api/v1/teachers/leave-requests/{first}/approve/').status_code, 200)
        res = self.client.post(f'/api/v1/teachers/leave-requests/{second}/approve/')
        self.assertEqual(res.status_code, 400)  # AL entitlement 2, already used 2
        # Supervisor's own leave goes to Management
        sup = StaffMember.objects.create(staff_id='STF-009', name='Maheran', role='Supervisor', phone='9', user=self.users[SUPERVISOR])
        leave = LeaveRequest.objects.create(leave_id='LV-X', staff=sup, leave_type='MC', start_date='2026-10-07', end_date='2026-10-07', days_count=1, reason='Demam')
        self.assertEqual(self.client.post(f'/api/v1/teachers/leave-requests/{leave.id}/approve/').status_code, 403)

    def test_kpi_set_review_and_report(self):
        self.as_role(MANAGEMENT)
        a = self.client.post('/api/v1/teachers/staff-kpis/', {'staff': self.siti.id, 'year': 2026, 'title': 'Kutipan yuran', 'target': '95% kutipan', 'weight': 60}, format='json').data
        b = self.client.post('/api/v1/teachers/staff-kpis/', {'staff': self.siti.id, 'year': 2026, 'title': 'Susulan lead', 'target': '100 lead', 'weight': 40}, format='json').data
        self.client.post(f"/api/v1/teachers/staff-kpis/{a['id']}/review/", {'score': 90, 'achieved': '93%'})
        self.client.post(f"/api/v1/teachers/staff-kpis/{b['id']}/review/", {'score': 50, 'achieved': '50 lead'})
        row = self.client.get('/api/v1/teachers/staff/report/?year=2026').data['kpi']['rows'][0]
        self.assertEqual(row['achievement_pct'], 74.0)  # (60*90 + 40*50) / 100
        self.assertEqual(self.client.patch(f"/api/v1/teachers/staff-kpis/{a['id']}/", {'target': 'x'}, format='json').status_code, 400)
        self.as_role(ADMIN)  # sees own KPIs only
        self.assertEqual(len(self.client.get('/api/v1/teachers/staff-kpis/').data), 2)

    def test_contract_and_birthday_alerts(self):
        today = date.today()
        self.siti.contract_end = today + timedelta(days=20)
        self.siti.date_of_birth = (today + timedelta(days=3)).replace(year=1995)
        self.siti.save()
        self.as_role(MANAGEMENT)
        staff = self.client.get('/api/v1/dashboard/summary/').data['staff']
        self.assertEqual(staff['contracts_ending'][0]['days_left'], 20)
        self.assertEqual(staff['birthdays'][0]['days_left'], 3)


class PdfTests(PayrollBase):
    def test_payslip_and_receipt_pdfs(self):
        self.as_role(ADMIN)
        self.save([{'class_id': self.fz.id, 'status': 'PRESENT'}])
        self.as_role(SUPERVISOR)
        pay = self.client.post('/api/v1/teachers/payments/calculate/', {'month': '2026-10'}, format='json').data['payments'][0]
        res = self.client.get(f"/api/v1/teachers/payments/{pay['id']}/payslip/")
        self.assertEqual((res.status_code, res['Content-Type']), (200, 'application/pdf'))
        self.assertTrue(res.content.startswith(b'%PDF'))
        self.assertIn('slip-gaji-ALI-2026-10.pdf', res['Content-Disposition'])
        self.as_role(ADMIN)  # pay is hidden from Admin
        self.assertEqual(self.client.get(f"/api/v1/teachers/payments/{pay['id']}/payslip/").status_code, 403)
        # Receipt PDF for a payment
        from students.models import Student
        from billing.models import Invoice, PaymentReceipt
        st = Student.objects.create(student_id='AN-X', full_name='Ali', ic_number='1', form_level='F5', phone_number='1', join_date='2026-01-01', status='ACTIVE')
        inv = Invoice.objects.create(invoice_number='INV-X', student=st, billing_month='2026-10-01', monthly_fee=100, total_payable=100, balance_due=100, due_date='2026-10-07')
        rec = self.client.post('/api/v1/billing/receipts/', {'invoice': inv.id, 'amount_paid': '100.00', 'payment_method': 'CASH'}, format='json').data
        res = self.client.get(f"/api/v1/billing/receipts/{rec['id']}/pdf/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))
