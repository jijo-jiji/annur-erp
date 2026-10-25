"""Step 3 of the drill-down (DRILLDOWN_PLAN.md): the figures on Laporan, and the teacher, permit, attendance and
follow-up figures on Ringkasan, equal the rows of the list each one opens."""
from datetime import date, timedelta
from billing.models import Invoice, PaymentReceipt
from core.permissions import ADMIN, MANAGEMENT
from expenses.models import PaymentVoucher
from students.models import ClassAttendanceSession, Lead, Student, StudentAttendance, StudentEvent
from students.tests import Phase2Base
from teachers.models import Teacher, TeacherAttendance


class ReportFiguresMatchTheirListsTests(Phase2Base):
    """Every number on Laporan can be checked against the records behind it."""

    def setUp(self):
        super().setUp()
        today = date.today()
        self.today = today
        self.year = today.year - 1  # the year the figures are read for; this year's records must stay out of them
        y = self.year
        n = iter(range(1, 1000))

        def student(code, form='F5', kind='MONTHLY', status='ACTIVE'):
            return Student.objects.create(student_id=code, full_name=f'Pelajar {code}', ic_number='1', form_level=form, student_type=kind,
                                          status=status, join_date=date(y, 1, 1), parent1_name='P', parent1_phone='012')

        self.f5 = student('AN-9001')
        self.f5_walk_in = student('AN-9002', kind='WALK_IN')
        self.f2 = student('AN-9003', form='F2')
        self.s6 = student('AN-9004', form='S6')
        self.f5.enrolled_classes.add(self.kim)
        self.f2.enrolled_classes.add(self.kim)

        def invoice(student, month, total, status='PAID', paid=None):
            paid = total if paid is None and status == 'PAID' else (paid or 0)
            return Invoice.objects.create(invoice_number=f'INV-9-{next(n)}', student=student, billing_month=month, invoice_type='MONTHLY',
                                          total_payable=total, total_paid=paid, balance_due=total - paid, status=status, due_date=month)

        def receipt(inv, day, amount):
            return PaymentReceipt.objects.create(receipt_number=f'REC-9-{next(n)}', invoice=inv, student=inv.student, payment_date=day, amount_paid=amount)

        a = invoice(self.f5, date(y, 3, 1), 200)
        b = invoice(self.f5_walk_in, date(y, 3, 1), 80)
        c = invoice(self.f2, date(y, 4, 1), 150, 'PARTIAL', 50)
        d = invoice(self.s6, date(y, 6, 1), 90, 'UNPAID')
        e = invoice(self.f5, date(today.year, 1, 1), 300)  # this year: not in last year's figures
        receipt(a, date(y, 3, 5), 200)
        receipt(b, date(y, 3, 6), 80)
        receipt(c, date(y, 4, 9), 50)
        receipt(e, date(today.year, 1, 5), 300)
        self.unpaid = d

        def voucher(status, day, amount, category='Utiliti'):
            return PaymentVoucher.objects.create(pv_number=f'PV-9-{next(n)}', date=day, category=category, amount=amount, items_description='x', status=status)

        voucher('VERIFIED_ADMIN', date(y, 3, 10), 120)
        voucher('APPROVED_SUPERVISOR', date(y, 3, 20), 800, 'Sewa')
        voucher('APPROVED_MANAGEMENT', date(y, 8, 2), 4000, 'Sewa')
        voucher('PENDING_SUPERVISOR', date(y, 8, 3), 900)
        voucher('REJECTED', date(y, 8, 4), 300)
        voucher('VERIFIED_ADMIN', date(today.year, 1, 2), 77)  # this year

        # teachers: one takes two classes, covers one, and is absent for one; another is covered for
        self.t1 = Teacher.objects.create(teacher_code='NAK', full_name='Nur Aini', phone_number='1', teaching_permit_expiry=today + timedelta(days=20))
        self.t2 = Teacher.objects.create(teacher_code='SF', full_name='Siti Fatimah', phone_number='1', teaching_permit_expiry=today + timedelta(days=400))
        self.t3 = Teacher.objects.create(teacher_code='AZ', full_name='Azman', phone_number='1', teaching_permit_expiry=today - timedelta(days=5))
        self.t4 = Teacher.objects.create(teacher_code='Z', full_name='Zainal', phone_number='1')
        self.t5 = Teacher.objects.create(teacher_code='OLD', full_name='Lama', phone_number='1', is_active=False, teaching_permit_expiry=today - timedelta(days=90))

        def session(teacher, day, status='PRESENT', replacement=None, amount=60, label='F5 Kimia'):
            return TeacherAttendance.objects.create(teacher=teacher, date=day, status=status, replacement_teacher=replacement, allowance_earned=amount,
                                                    class_label=f'{label} {next(n)}')

        session(self.t1, date(y, 2, 3))
        session(self.t1, date(y, 2, 4))
        session(self.t2, date(y, 2, 5), 'REPLACED', self.t1, amount=45)   # t1 covered, t2 was absent
        session(self.t2, date(y, 2, 6), 'ABSENT', amount=0)
        session(self.t2, date(y, 2, 7), 'CANCELLED', amount=0)
        session(self.t3, date(y, 2, 8), 'REPLACED', None, amount=0)       # nobody was named: not a session
        session(self.t2, date(today.year, 1, 3))                           # this year

        # why students left or dropped a subject
        def event(student, kind, day, reason):
            return StudentEvent.objects.create(student=student, event_type=kind, event_date=day, reason_code=reason)

        event(self.f5, 'DROP_SUBJECT', date(y, 2, 1), 'PRICE')
        event(self.f2, 'DROP_SUBJECT', date(y, 2, 9), 'PRICE')
        event(self.f2, 'TERMINATE', date(y, 5, 9), 'PRICE')
        event(self.s6, 'TERMINATE', date(y, 5, 20), '')
        event(self.f5, 'DROP_SUBJECT', date(today.year, 1, 4), 'PRICE')   # this year
        event(self.f5, 'NOTE', date(y, 2, 1), 'PRICE')                     # not a drop

        # prospects
        for i, (offset, stage) in enumerate([(-3, 'ENQUIRY'), (0, 'CONTENT_1'), (5, 'TRIAL'), (-8, 'LOST'), (-9, 'ACTIVE'), (None, 'ENQUIRY')]):
            Lead.objects.create(lead_id=f'LD-9-{i}', phone='011', status=stage, next_follow_up=None if offset is None else today + timedelta(days=offset))

        # attendance in the last 30 days (and one older session that must stay out of the window)
        def attendance(cls, day, marks):
            s = ClassAttendanceSession.objects.create(timetable_class=cls, date=day)
            for who, present in marks:
                StudentAttendance.objects.create(session=s, student=who, present=present)

        attendance(self.kim, today - timedelta(days=1), [(self.f5, True), (self.f2, False)])
        attendance(self.kim, today - timedelta(days=2), [(self.f5, True), (self.f2, True)])
        attendance(self.fz, today - timedelta(days=3), [(self.f5, False)])
        attendance(self.kim, today - timedelta(days=80), [(self.f5, False), (self.f2, False)])
        attendance(self.kim, date(y, 5, 5), [(self.f5, True), (self.f2, False)])
        attendance(self.fz, date(y, 5, 6), [(self.f5, True)])

    def get(self, url, role=MANAGEMENT, **params):
        self.as_role(role)
        res = self.client.get(url, params)
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def reports(self):
        return self.get('/api/v1/reports/summary/', year=self.year)

    def receipts(self, **params):
        return self.get('/api/v1/billing/receipts/matching/', **params)

    def invoices(self, **params):
        return self.get('/api/v1/billing/invoices/matching/', **params)

    def vouchers(self, **params):
        return self.get('/api/v1/expenses/vouchers/matching/', **params)

    # ---- Jualan & perbelanjaan -------------------------------------------------

    def test_the_four_sales_figures_open_the_rows_that_add_up_to_them(self):
        sales = self.reports()['sales']
        y = str(self.year)
        self.assertAlmostEqual(self.invoices(year=y)['billed'], sales['total_billed'], places=2)
        self.assertEqual(self.invoices(year=y)['count'], 4)  # last year's four invoices, not this year's
        self.assertAlmostEqual(self.receipts(year=y)['total'], sales['total_collected'], places=2)
        self.assertEqual(self.receipts(year=y)['count'], 3)
        self.assertAlmostEqual(self.receipts(year=y, walk_in='1')['total'], sales['walk_in_collected'], places=2)
        self.assertAlmostEqual(self.invoices(status='OUTSTANDING')['balance'], sales['outstanding'], places=2)
        self.assertGreater(sales['walk_in_collected'], 0)

    def test_each_month_opens_the_invoices_receipts_and_vouchers_it_is_made_of(self):
        report = self.reports()
        for m in report['sales']['months']:
            month = f"{self.year}-{m['month']:02d}"
            self.assertAlmostEqual(self.invoices(month=month)['billed'], m['billed'], places=2, msg=month)
            self.assertAlmostEqual(self.receipts(month=month)['total'], m['collected'], places=2, msg=month)
            self.assertAlmostEqual(self.receipts(month=month, walk_in='1')['total'], m['walk_in_collected'], places=2, msg=month)
            self.assertAlmostEqual(self.vouchers(month=month, status='COUNTED')['total'], m['expenses'], places=2, msg=month)
        march = report['sales']['months'][2]
        self.assertEqual((march['billed'], march['collected'], march['walk_in_collected'], march['expenses']), (280, 280, 80, 920))

    def test_each_tingkatan_and_peringkat_opens_the_receipts_it_adds_up_to(self):
        sales = self.reports()['sales']
        y = str(self.year)
        self.assertEqual({r['form'] for r in sales['by_form']}, {'F5', 'F2'})
        for row in sales['by_form']:
            self.assertAlmostEqual(self.receipts(year=y, form=row['form'])['total'], row['amount'], places=2, msg=row['form'])
        levels = {r['level']: r['amount'] for r in sales['by_level']}
        self.assertEqual(set(levels), {'UPPER', 'LOWER'})
        for level, amount in levels.items():
            self.assertAlmostEqual(self.receipts(year=y, level=level)['total'], amount, places=2, msg=level)
        self.assertAlmostEqual(sum(levels.values()), sales['total_collected'], places=2)
        self.assertEqual(self.receipts(year=y, level='PRIMARY')['count'], 0)

    def test_a_grade_the_list_no_longer_names_counts_as_upper_in_both_places(self):
        old = Student.objects.create(student_id='AN-9099', full_name='Lama', ic_number='1', form_level='X9', status='ACTIVE', join_date=date(self.year, 1, 1),
                                     parent1_name='P', parent1_phone='012')
        inv = Invoice.objects.create(invoice_number='INV-9-x', student=old, billing_month=date(self.year, 7, 1), invoice_type='MONTHLY', total_payable=33,
                                     total_paid=33, balance_due=0, status='PAID', due_date=date(self.year, 7, 1))
        PaymentReceipt.objects.create(receipt_number='REC-9-x', invoice=inv, student=old, payment_date=date(self.year, 7, 2), amount_paid=33)
        levels = {r['level']: r['amount'] for r in self.reports()['sales']['by_level']}
        self.assertAlmostEqual(self.receipts(year=str(self.year), level='UPPER')['total'], levels['UPPER'], places=2)
        self.assertAlmostEqual(self.receipts(year=str(self.year), level='UPPER')['total'] + self.receipts(year=str(self.year), level='LOWER')['total'],
                               self.receipts(year=str(self.year))['total'], places=2)

    def test_spending_budget_and_pending_open_the_vouchers_behind_them(self):
        report = self.reports()
        y = str(self.year)
        self.assertAlmostEqual(self.vouchers(year=y, status='COUNTED')['total'], report['expenses']['total'], places=2)
        self.assertEqual(self.vouchers(year=y, status='COUNTED')['count'], 3)
        for row in report['expenses']['by_category']:
            listed = self.vouchers(year=y, status='COUNTED', category=row['category'])
            self.assertAlmostEqual(listed['total'], row['amount'], places=2, msg=row['category'])
            self.assertEqual(listed['count'], row['count'], row['category'])
        for row in report['budget']['rows']:
            self.assertAlmostEqual(self.vouchers(year=y, status='COUNTED', category=row['category'])['total'], row['actual'], places=2, msg=row['category'])
        self.assertAlmostEqual(self.vouchers(year=y, status='PENDING')['total'], report['expenses']['pending_total'], places=2)
        self.assertEqual(report['expenses']['pending_total'], 900)

    # ---- Bayaran guru ----------------------------------------------------------

    def test_a_teachers_sessions_and_allowance_open_the_sessions_behind_them(self):
        rows = {r['code']: r for r in self.reports()['teacher_payments']}
        self.assertEqual(set(rows), {'NAK'})  # the other teacher was absent, replaced or cancelled; the cover with no name counts for nobody
        for code, row in rows.items():
            listed = self.get('/api/v1/teachers/attendance/paid/', teacher=code, year=str(self.year))
            self.assertEqual(listed['count'], row['sessions'], code)
            self.assertAlmostEqual(listed['allowance'], row['allowance'], places=2, msg=code)
            self.assertEqual(listed['count'], len(listed['rows']))
        nak = self.get('/api/v1/teachers/attendance/paid/', teacher='NAK', year=str(self.year))
        self.assertEqual((nak['count'], nak['allowance']), (3, 165))
        self.assertEqual(sorted(r['role'] for r in nak['rows']), ['Guru ganti', 'Guru kelas', 'Guru kelas'])
        self.assertEqual(self.get('/api/v1/teachers/attendance/paid/', teacher='NAK', month=f'{self.year}-02')['count'], 3)
        self.assertEqual(self.get('/api/v1/teachers/attendance/paid/', teacher='NAK', month=f'{self.year}-03')['count'], 0)

    def test_admin_sees_the_sessions_but_not_the_pay(self):
        listed = self.get('/api/v1/teachers/attendance/paid/', role=ADMIN, teacher='NAK', year=str(self.year))
        self.assertEqual(listed['count'], 3)
        self.assertNotIn('allowance', listed)
        self.assertTrue(all('amount' not in r for r in listed['rows']))

    # ---- Akademik --------------------------------------------------------------

    def test_each_drop_reason_and_month_opens_the_history_rows_it_counts(self):
        report = self.reports()
        y = self.year
        self.assertEqual({r['code'] for r in report['drop_reasons']}, {'PRICE', ''})
        for row in report['drop_reasons']:
            listed = self.get('/api/v1/students/history/', type='DROP_SUBJECT,TERMINATE', start=f'{y}-01-01', end=f'{y}-12-31', reason=row['code'] or 'NONE')
            self.assertEqual(len(listed), row['subject_drops'] + row['students_left'], row['code'])
        for month in range(1, 13):
            end = (date(y, month, 1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            listed = self.get('/api/v1/students/history/', type='DROP_SUBJECT,TERMINATE', start=date(y, month, 1).isoformat(), end=end.isoformat())
            self.assertEqual(len(listed), report['drops_by_month'][month - 1] + report['left_by_month'][month - 1], month)

    def test_the_held_and_inactive_headings_open_those_students(self):
        Student.objects.filter(pk=self.f2.pk).update(status='ON_HOLD')
        Student.objects.filter(pk=self.s6.pk).update(status='TERMINATED')
        academic = self.reports()['academic']
        on_hold = self.get('/api/v1/students/students/matching/', status='ON_HOLD')
        inactive = self.get('/api/v1/students/students/matching/', status='INACTIVE')
        self.assertEqual((on_hold['count'], inactive['count']), (len(academic['on_hold']), len(academic['inactive'])))
        self.assertEqual((on_hold['count'], inactive['count']), (1, 1))

    # ---- Kehadiran & kapasiti --------------------------------------------------

    def test_each_class_rate_in_laporan_opens_that_classes_attendance(self):
        report = self.reports()
        y = self.year
        rows = report['attendance']
        self.assertEqual(len(rows), 2)
        for row in rows:
            listed = self.get('/api/v1/attendance/summary/', start=f'{y}-01-01', end=f'{y}-12-31', class_id=row['class_id'])
            self.assertEqual((listed['present'], listed['total'], listed['rate']), (row['present'], row['total'], row['rate']), row['class_code'])
            self.assertEqual(len(listed['classes']), 1)
            sessions = self.get('/api/v1/attendance/sessions/', start=f'{y}-01-01', end=f'{y}-12-31', class_id=row['class_id'])
            self.assertEqual(len(sessions), row['sessions'], row['class_code'])

    def test_each_subject_bar_opens_the_classes_whose_seats_it_adds_up(self):
        """The bar sums the seats of the classes the timetable lists (current_enrolled and max_seats); the list is those classes."""
        self.as_role(MANAGEMENT)
        listing = self.client.get('/api/v1/academic/timetable/').data
        for code in ('FZ', 'KIM'):
            matched = self.get('/api/v1/academic/timetable/matching/', subject=code)
            mine = [c for c in listing if c['subject_details']['code'] == code]
            self.assertEqual(sorted(matched['ids']), sorted(c['id'] for c in mine), code)
            self.assertEqual(matched['enrolled'], sum(c['current_enrolled'] for c in mine), code)
            self.assertEqual(matched['seats'], sum(c['max_seats'] for c in mine), code)
        self.assertEqual(self.get('/api/v1/academic/timetable/matching/', subject='KIM')['enrolled'], 2)

    # ---- Ringkasan -------------------------------------------------------------

    def test_the_last_30_days_figure_opens_the_attendance_it_is_made_of(self):
        att = self.get('/api/v1/dashboard/summary/')['attendance']
        listed = self.get('/api/v1/attendance/summary/', start=att['start'], end=att['end'])
        self.assertEqual((listed['present'], listed['total'], listed['rate']), (att['present'], att['total'], att['rate']))
        self.assertEqual((att['present'], att['total']), (3, 5))  # the session 80 days ago and last year's are outside the window
        for low in att['low_classes']:
            one = self.get('/api/v1/attendance/summary/', start=att['start'], end=att['end'], class_id=low['class_id'])
            self.assertEqual((one['present'], one['total'], one['rate']), (low['present'], low['total'], low['rate']), low['class_code'])
        self.assertTrue(att['low_classes'])

    def test_active_teachers_and_permits_open_the_teachers_they_count(self):
        data = self.get('/api/v1/dashboard/summary/')['teachers']
        active = self.get('/api/v1/teachers/teachers/matching/', status='ACTIVE')
        self.assertEqual(active['count'], data['active'])
        self.assertEqual(active['count'], 4)
        expiring = self.get('/api/v1/teachers/teachers/matching/', status='ACTIVE', permit='EXPIRING')
        self.assertEqual(sorted(expiring['ids']), sorted(p['code'] for p in data['permits_expiring']))
        self.assertEqual(sorted(expiring['ids']), ['AZ', 'NAK'])  # one running out, one already out; the inactive teacher is not counted
        missing = self.get('/api/v1/teachers/teachers/matching/', status='ACTIVE', permit='MISSING')
        self.assertEqual((missing['count'], missing['ids']), (data['permits_missing'], ['Z']))
        self.assertEqual(self.get('/api/v1/teachers/teachers/matching/', code='SF')['ids'], ['SF'])
        self.assertEqual(self.get('/api/v1/teachers/teachers/matching/', status='INACTIVE')['ids'], ['OLD'])

    def test_prospects_to_follow_up_open_the_same_prospects(self):
        dashboard = self.get('/api/v1/dashboard/summary/')
        due = self.get('/api/v1/students/leads/matching/', due='1')
        self.assertEqual(due['count'], dashboard['approvals']['lead_followups_due'])
        self.assertEqual(due['count'], 2)  # three days overdue and due today; not the future one, the closed ones or the undated one
        self.assertEqual(due['count'], self.get('/api/v1/students/leads/stats/')['follow_ups_due'])

    def test_bad_filters_are_refused(self):
        self.as_role(ADMIN)
        for url, bad in (
            ('/api/v1/billing/receipts/matching/', {'year': 'lepas'}), ('/api/v1/billing/receipts/matching/', {'level': 'ATAS'}),
            ('/api/v1/billing/invoices/matching/', {'year': '20x6'}), ('/api/v1/expenses/vouchers/matching/', {'year': '-'}),
            ('/api/v1/teachers/teachers/matching/', {'status': 'X'}), ('/api/v1/teachers/teachers/matching/', {'permit': 'X'}),
            ('/api/v1/teachers/attendance/paid/', {'teacher': 'TIADA'}), ('/api/v1/teachers/attendance/paid/', {'year': 'x'}),
            ('/api/v1/students/history/', {'type': 'LOMPAT'}), ('/api/v1/students/history/', {'start': 'semalam'}),
            ('/api/v1/attendance/summary/', {'class_id': 'x'}),
        ):
            self.assertEqual(self.client.get(url, bad).status_code, 400, (url, bad))
