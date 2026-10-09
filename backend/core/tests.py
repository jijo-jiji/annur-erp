from django.contrib.auth.models import Group, User
from django.core.cache import cache
from rest_framework.test import APITestCase
from core.permissions import ADMIN, SUPERVISOR, MANAGEMENT, ALL_ROLES
from business_config.models import DynamicMasterData
from expenses.models import Vendor, PaymentVoucher
from teachers.models import Teacher, StaffMember, LeaveRequest


class RoleTestBase(APITestCase):
    def setUp(self):
        cache.clear()  # reset login throttle between tests
        for role in ALL_ROLES:
            Group.objects.get_or_create(name=role)
        self.users = {}
        for role in ALL_ROLES:
            u = User.objects.create_user(username=role.lower(), password='test-pass-123')
            u.groups.add(Group.objects.get(name=role))
            self.users[role] = u

    def as_role(self, role):
        self.client.force_authenticate(self.users[role])


class AuthTests(RoleTestBase):
    def test_login_returns_token_and_role(self):
        res = self.client.post('/api/v1/auth/login/', {'username': 'supervisor', 'password': 'test-pass-123'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['user']['role'], SUPERVISOR)
        token = res.data['token']
        me = self.client.get('/api/v1/auth/me/', HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(me.data['role'], SUPERVISOR)

    def test_wrong_password_rejected(self):
        res = self.client.post('/api/v1/auth/login/', {'username': 'supervisor', 'password': 'nope'})
        self.assertEqual(res.status_code, 400)
        self.assertNotIn('token', res.data)

    def test_user_without_role_cannot_log_in(self):
        User.objects.create_user(username='norole', password='test-pass-123')
        res = self.client.post('/api/v1/auth/login/', {'username': 'norole', 'password': 'test-pass-123'})
        self.assertEqual(res.status_code, 403)

    def test_logout_invalidates_token(self):
        token = self.client.post('/api/v1/auth/login/', {'username': 'admin', 'password': 'test-pass-123'}).data['token']
        auth = {'HTTP_AUTHORIZATION': f'Token {token}'}
        self.assertEqual(self.client.post('/api/v1/auth/logout/', **auth).status_code, 204)
        self.assertEqual(self.client.get('/api/v1/auth/me/', **auth).status_code, 401)

    def test_api_requires_login(self):
        self.assertEqual(self.client.get('/api/v1/students/students/').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/dashboard/summary/').status_code, 401)

    def test_parent_qr_registration_stays_public(self):
        res = self.client.post('/api/v1/students/parent-self-register/', {}, format='json')
        self.assertEqual(res.status_code, 400)  # reaches validation, not 401


class RoleRuleTests(RoleTestBase):
    def test_admin_cannot_edit_timetable_or_teachers(self):
        self.as_role(ADMIN)
        self.assertEqual(self.client.post('/api/v1/academic/timetable/', {}).status_code, 403)
        self.assertEqual(self.client.post('/api/v1/teachers/teachers/', {}).status_code, 403)

    def test_only_management_changes_business_settings(self):
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post('/api/v1/business-config/settings/', {'key': 'X', 'value': '1'}).status_code, 403)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post('/api/v1/business-config/settings/', {'key': 'X', 'value': '1'}).status_code, 201)

    def test_admin_cannot_delete(self):
        vendor = Vendor.objects.create(vendor_id='V1', vendor_name='Kedai')
        self.as_role(ADMIN)
        self.assertEqual(self.client.delete(f'/api/v1/expenses/vendors/{vendor.id}/').status_code, 403)

    def test_teacher_rate_hidden_from_admin(self):
        Teacher.objects.create(teacher_code='NAK', full_name='Cikgu', phone_number='1', rate_per_session=60)
        self.as_role(ADMIN)
        self.assertNotIn('rate_per_session', self.client.get('/api/v1/teachers/teachers/').data[0])
        self.as_role(SUPERVISOR)
        self.assertIn('rate_per_session', self.client.get('/api/v1/teachers/teachers/').data[0])

    def test_master_data_proposal_needs_approver(self):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/business-config/master-data/',
                               {'category': 'LEAD_SOURCE', 'code': 'TT', 'label': 'TikTok', 'status': 'APPROVED'}, format='json')
        self.assertEqual(res.data['status'], 'PENDING')  # client cannot self-approve
        item_id = res.data['id']
        self.assertEqual(self.client.post(f'/api/v1/business-config/master-data/{item_id}/approve/').status_code, 403)
        self.as_role(SUPERVISOR)
        res = self.client.post(f'/api/v1/business-config/master-data/{item_id}/approve/')
        self.assertEqual(res.data['status'], 'APPROVED')
        self.as_role(ADMIN)
        res = self.client.patch(f'/api/v1/business-config/master-data/{item_id}/', {'label': 'Changed'}, format='json')
        self.assertEqual(res.status_code, 403)  # locked after approval

    def test_leave_approval_by_supervisor_only(self):
        staff = StaffMember.objects.create(staff_id='S1', name='Siti', role='Admin', phone='1')
        leave = LeaveRequest.objects.create(leave_id='LV1', staff=staff, start_date='2026-10-01',
                                            end_date='2026-10-01', reason='x', leave_type='AL', days_count=1)
        self.as_role(ADMIN)
        self.assertEqual(self.client.post(f'/api/v1/teachers/leave-requests/{leave.id}/approve/').status_code, 403)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f'/api/v1/teachers/leave-requests/{leave.id}/approve/').status_code, 200)
        from teachers.staff import leave_balances
        self.assertEqual(leave_balances(staff, 2026)['AL']['balance'], 11)  # 12 entitled - 1 used
        # second approval must not deduct again
        self.assertEqual(self.client.post(f'/api/v1/teachers/leave-requests/{leave.id}/approve/').status_code, 400)


class VoucherApprovalTests(RoleTestBase):
    def setUp(self):
        super().setUp()
        self.vendor = Vendor.objects.create(vendor_id='V1', vendor_name='Kedai')

    def create_pv(self, amount, **extra):
        self.as_role(ADMIN)
        return self.client.post('/api/v1/expenses/vouchers/', {
            'vendor': self.vendor.id, 'category': 'Alat Tulis', 'amount': amount,
            'items_description': 'Kertas', **extra,
        }, format='json').data

    def test_voucher_is_not_auto_approved(self):
        pv = self.create_pv(1200, status='APPROVED_MANAGEMENT')
        self.assertEqual(pv['tier_level'], 'TIER_2')
        self.assertEqual(pv['status'], 'PENDING_SUPERVISOR')
        self.assertEqual(self.create_pv(5000)['status'], 'PENDING_MANAGEMENT')
        self.assertEqual(self.create_pv(100)['status'], 'VERIFIED_ADMIN')

    def test_tier_approvers(self):
        tier2, tier3 = self.create_pv(1200), self.create_pv(5000)
        self.as_role(ADMIN)
        self.assertEqual(self.client.post(f"/api/v1/expenses/vouchers/{tier2['id']}/approve/").status_code, 403)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"/api/v1/expenses/vouchers/{tier3['id']}/approve/").status_code, 403)
        res = self.client.post(f"/api/v1/expenses/vouchers/{tier2['id']}/approve/")
        self.assertEqual(res.data['status'], 'APPROVED_SUPERVISOR')
        self.as_role(MANAGEMENT)
        res = self.client.post(f"/api/v1/expenses/vouchers/{tier3['id']}/approve/")
        self.assertEqual(res.data['status'], 'APPROVED_MANAGEMENT')

    def test_reject_requires_comment(self):
        pv = self.create_pv(1200)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"/api/v1/expenses/vouchers/{pv['id']}/reject/").status_code, 400)
        res = self.client.post(f"/api/v1/expenses/vouchers/{pv['id']}/reject/", {'comment': 'Tiada resit'})
        self.assertEqual(res.data['status'], 'REJECTED')
        self.assertEqual(res.data['approval_comment'], 'Tiada resit')

    def test_raising_amount_resets_approval(self):
        pv = self.create_pv(1200)
        self.as_role(SUPERVISOR)
        self.client.post(f"/api/v1/expenses/vouchers/{pv['id']}/approve/")
        res = self.client.patch(f"/api/v1/expenses/vouchers/{pv['id']}/", {'amount': 4000}, format='json')
        self.assertEqual(res.data['status'], 'PENDING_MANAGEMENT')
        self.assertEqual(PaymentVoucher.objects.get(id=pv['id']).approved_by, '')


class ScreenDataTests(RoleTestBase):
    def setUp(self):
        super().setUp()
        from academic.models import TimeSlot, ClassTimetable
        from business_config.models import SubjectMaster
        from students.models import Student
        self.teacher = Teacher.objects.create(teacher_code='NAK', full_name='Cikgu NAK', phone_number='1', rate_per_session=60)
        sub = SubjectMaster.objects.create(code='FZ', name='Fizik', level_category='UPPER_SEC')
        slot = TimeSlot.objects.create(day='JUMAAT', start_time='09:00', end_time='10:30', period_label='Pagi')
        self.cls = ClassTimetable.objects.create(slot=slot, subject=sub, form_level='F5', section='A', max_seats=1, teacher=self.teacher)
        for i in range(2):
            s = Student.objects.create(student_id=f'S{i}', full_name=f'P{i}', ic_number='0', form_level='F5',
                                       phone_number='0', join_date='2026-01-01', parent1_name='B', parent1_phone='0',
                                       status='ACTIVE')
            s.enrolled_classes.add(self.cls)

    def test_timetable_seats_come_from_enrolments(self):
        self.as_role(ADMIN)
        row = self.client.get('/api/v1/academic/timetable/').data[0]
        self.assertEqual(row['current_enrolled'], 2)
        self.assertEqual(row['available_seats'], -1)
        self.assertNotIn('rate_per_session', row['teacher_details'])

    def test_dashboard_flags_overcapacity(self):
        self.as_role(SUPERVISOR)
        data = self.client.get('/api/v1/dashboard/summary/').data
        self.assertEqual(data['students']['active'], 2)
        self.assertEqual([c['class_code'] for c in data['classes']['over']], [self.cls.class_code])

    def test_reports_only_for_approvers(self):
        self.as_role(ADMIN)
        self.assertEqual(self.client.get('/api/v1/reports/summary/?year=2026').status_code, 403)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.get('/api/v1/reports/summary/?year=2026').data['year'], 2026)

    def test_rate_increment_flow(self):
        self.as_role(ADMIN)
        self.assertEqual(self.client.get('/api/v1/teachers/rate-increments/').status_code, 403)
        self.as_role(SUPERVISOR)
        inc = self.client.post('/api/v1/teachers/rate-increments/', {
            'teacher': self.teacher.id, 'proposed_rate': '65.00', 'effective_date': '2027-01-01', 'reason': 'Prestasi',
        }, format='json').data
        self.assertEqual(inc['previous_rate'], '60.00')
        self.assertEqual(self.client.post(f"/api/v1/teachers/rate-increments/{inc['id']}/approve/").status_code, 403)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(f"/api/v1/teachers/rate-increments/{inc['id']}/approve/").data['status'], 'APPROVED')
        self.teacher.refresh_from_db()
        self.assertEqual(float(self.teacher.rate_per_session), 65.0)

    def test_complaints_hidden_from_admin(self):
        self.as_role(ADMIN)
        self.assertEqual(self.client.get('/api/v1/teachers/complaints/').status_code, 403)
        self.as_role(SUPERVISOR)
        res = self.client.post('/api/v1/teachers/complaints/', {
            'teacher': self.teacher.id, 'date_reported': '2026-09-01', 'complained_by': 'Ibu pelajar',
            'description': 'Lewat masuk kelas',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['recorded_by'], 'supervisor')

    def test_admin_reschedule_starts_unapproved(self):
        self.as_role(ADMIN)
        res = self.client.post('/api/v1/academic/reschedule-logs/', {
            'timetable_class': self.cls.id, 'month_label': "SEP '26", 'tarikh_ganti': '2026-09-30',
            'remarks': 'PH', 'supervisor_approved': True,
        }, format='json')
        self.assertFalse(res.data['supervisor_approved'])
        # Approval only happens through the approve action; the flag cannot be written
        res = self.client.patch(f"/api/v1/academic/reschedule-logs/{res.data['id']}/",
                                {'supervisor_approved': True}, format='json')
        self.assertEqual((res.data['supervisor_approved'], res.data['status']), (False, 'PENDING'))
        self.assertEqual(self.client.post(f"/api/v1/academic/reschedule-logs/{res.data['id']}/approve/").status_code, 403)



import io
import shutil
import tempfile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image as PILImage
from core.models import Attachment
from students.models import Student
from teachers.models import StaffMember as Staff

TEMP_MEDIA = tempfile.mkdtemp(prefix='annur-test-uploads-')


def png_bytes():
    buf = io.BytesIO()
    PILImage.new('RGB', (4, 4), 'red').save(buf, 'PNG')
    return buf.getvalue()


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class UploadTests(RoleTestBase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        super().setUp()
        self.student = Student.objects.create(student_id='AN-1', full_name='Ali', ic_number='1', form_level='F5',
                                              phone_number='1', join_date='2026-01-01', status='ACTIVE')
        self.staff = Staff.objects.create(staff_id='STF-001', name='Siti', role='Admin', phone='1', user=self.users[ADMIN])
        self.other = Staff.objects.create(staff_id='STF-002', name='Fizah', role='Admin 2', phone='2')

    def upload(self, kind, object_id, name, content, **extra):
        return self.client.post('/api/v1/files/', {
            'kind': kind, 'object_id': object_id, 'file': SimpleUploadedFile(name, content), **extra,
        }, format='multipart')

    def test_photo_is_checked_replaced_and_served_only_when_logged_in(self):
        self.as_role(ADMIN)
        self.assertEqual(self.upload('STUDENT_PHOTO', self.student.id, 'x.png', b'not an image').status_code, 400)
        self.assertEqual(self.upload('STUDENT_PHOTO', self.student.id, 'x.exe', png_bytes()).status_code, 400)
        first = self.upload('STUDENT_PHOTO', self.student.id, 'a.png', png_bytes()).data
        second = self.upload('STUDENT_PHOTO', self.student.id, 'b.png', png_bytes()).data
        self.assertEqual(list(Attachment.objects.values_list('id', flat=True)), [second['id']])  # replaced
        res = self.client.get(second['url'])
        self.assertEqual((res.status_code, res['Content-Type'], res['X-Content-Type-Options']), (200, 'image/png', 'nosniff'))
        self.assertNotIn(first['id'], [a['id'] for a in self.client.get(f'/api/v1/files/?kind=STUDENT_PHOTO&object_id={self.student.id}').data])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(second['url']).status_code, 401)

    def test_staff_documents_are_private_and_cannot_be_deleted(self):
        self.as_role(ADMIN)  # Siti uploading her own IC
        self.assertEqual(self.upload('STAFF_DOC', self.staff.id, 'ic.pdf', b'%PDF-1.4 x').status_code, 400)  # doc type needed
        doc = self.upload('STAFF_DOC', self.staff.id, 'ic.pdf', b'%PDF-1.4 x', doc_type='IC').data
        self.assertEqual(doc['doc_type_label'], 'Salinan Kad Pengenalan')
        self.assertEqual(self.upload('STAFF_DOC', self.other.id, 'ic.pdf', b'%PDF-1.4 x', doc_type='IC').status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/files/{doc['id']}/").status_code, 403)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.delete(f"/api/v1/files/{doc['id']}/").status_code, 403)  # locked for everyone
        self.assertEqual(self.client.get(doc['url']).status_code, 200)

    def test_voucher_attachments_lock_after_decision(self):
        from expenses.models import PaymentVoucher, Vendor
        pv = PaymentVoucher.objects.create(pv_number='PV26-0901', date='2026-09-05', vendor=Vendor.objects.create(vendor_id='V', vendor_name='K'),
                                           category='X', amount=100, items_description='a', status='VERIFIED_ADMIN')
        self.as_role(ADMIN)
        att = self.upload('VOUCHER', pv.id, 'resit.pdf', b'%PDF-1.4 x').data
        self.assertEqual(self.upload('VOUCHER_SIGNATURE', pv.id, 'sign.png', png_bytes()).status_code, 201)
        pv.status = 'REJECTED'
        pv.save()
        self.assertEqual(self.upload('VOUCHER', pv.id, 'lagi.pdf', b'%PDF-1.4 x').status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/files/{att['id']}/").status_code, 403)

    def test_feedback_with_media_and_history(self):
        self.as_role(ADMIN)
        fb = self.client.post('/api/v1/students/feedback/', {'student': self.student.id, 'given_by': 'PARENT',
                                                             'description': 'Anak makin yakin'}, format='json').data
        self.assertEqual(self.upload('FEEDBACK', fb['id'], 'clip.mp4', b'\x00\x00\x00\x18ftypmp42rest').status_code, 201)
        rows = self.client.get('/api/v1/students/feedback/?form=F5').data
        self.assertEqual(len(rows[0]['media']), 1)
        from students.models import StudentEvent
        self.assertTrue(StudentEvent.objects.filter(student=self.student, event_type='FEEDBACK').exists())
        # Deleting the feedback removes its files too
        self.as_role(SUPERVISOR)
        self.client.delete(f"/api/v1/students/feedback/{fb['id']}/")
        self.assertFalse(Attachment.objects.exists())


class TimetableApprovalTests(RoleTestBase):
    def setUp(self):
        super().setUp()
        from academic.models import TimeSlot, ClassTimetable
        from business_config.models import SubjectMaster
        self.slot = TimeSlot.objects.create(day='SABTU', start_time='09:00', end_time='10:30', period_label='Pagi')
        self.subject = SubjectMaster.objects.create(code='FZ', name='Fizik', level_category='UPPER_SEC')
        self.cls = ClassTimetable.objects.create(slot=self.slot, subject=self.subject, form_level='F5', max_seats=20)

    def test_supervisor_changes_wait_for_management(self):
        from academic.models import ClassTimetable
        self.as_role(SUPERVISOR)
        res = self.client.patch(f'/api/v1/academic/timetable/{self.cls.id}/', {'max_seats': 25}, format='json')
        self.assertEqual(res.status_code, 202)
        self.assertEqual(ClassTimetable.objects.get(pk=self.cls.id).max_seats, 20)  # not applied yet
        change = res.data['pending_change']
        self.assertIn('20 → 25', change['summary'])
        self.assertEqual(self.client.post(f"/api/v1/academic/timetable-changes/{change['id']}/approve/").status_code, 403)
        new = self.client.post('/api/v1/academic/timetable/', {'slot': self.slot.id, 'subject': self.subject.id, 'form_level': 'F4', 'section': 'B', 'max_seats': 15}, format='json')
        self.assertEqual((new.status_code, ClassTimetable.objects.count()), (202, 1))
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(f"/api/v1/academic/timetable-changes/{change['id']}/approve/").data['status'], 'APPROVED')
        self.assertEqual(ClassTimetable.objects.get(pk=self.cls.id).max_seats, 25)
        pid = new.data['pending_change']['id']
        self.assertEqual(self.client.post(f'/api/v1/academic/timetable-changes/{pid}/reject/').status_code, 400)  # reason needed
        self.client.post(f'/api/v1/academic/timetable-changes/{pid}/reject/', {'comment': 'Bilik penuh'})
        self.assertEqual(ClassTimetable.objects.count(), 1)
        # Management's own change applies straight away
        self.assertEqual(self.client.patch(f'/api/v1/academic/timetable/{self.cls.id}/', {'max_seats': 30}, format='json').status_code, 200)

    def test_extra_cancel_class_approve_reject_verify(self):
        self.as_role(ADMIN)
        body = {'timetable_class': self.cls.id, 'month_label': "OKT '26", 'tarikh_batal': '2026-10-03', 'tarikh_ganti': '2026-10-05', 'supervisor_approved': True}
        log = self.client.post('/api/v1/academic/reschedule-logs/', body, format='json').data
        self.assertEqual((log['status'], log['supervisor_approved']), ('PENDING', False))  # cannot self-approve
        other = self.client.post('/api/v1/academic/reschedule-logs/', body, format='json').data
        self.assertEqual(self.client.post(f"/api/v1/academic/reschedule-logs/{log['id']}/approve/").status_code, 403)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"/api/v1/academic/reschedule-logs/{other['id']}/reject/").status_code, 400)
        self.assertEqual(self.client.post(f"/api/v1/academic/reschedule-logs/{other['id']}/reject/", {'comment': 'Bertindih'}).data['status'], 'REJECTED')
        self.assertEqual(self.client.post(f"/api/v1/academic/reschedule-logs/{log['id']}/approve/").data['status'], 'APPROVED')
        self.assertEqual(self.client.post(f"/api/v1/academic/reschedule-logs/{log['id']}/verify/").status_code, 403)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(f"/api/v1/academic/reschedule-logs/{other['id']}/verify/").status_code, 400)
        self.assertEqual(self.client.post(f"/api/v1/academic/reschedule-logs/{log['id']}/verify/").data['verified_by'], 'management')


class ChangeRequestTests(RoleTestBase):
    """Subjects change by request: Admin proposes, Supervisor / Management decides."""
    URL = '/api/v1/change-requests/'

    def setUp(self):
        super().setUp()
        from business_config.models import SubjectMaster
        self.Subject = SubjectMaster
        self.bm = SubjectMaster.objects.create(code='BM', name='Bahasa Melayu', level_category='UPPER_SEC')
        self.admin2 = User.objects.create_user(username='admin2', password='test-pass-123')
        self.admin2.groups.add(Group.objects.get(name=ADMIN))

    def propose_new(self, code='EKON', note='Pelajar minta'):
        return self.client.post(self.URL, {
            'kind': 'SUBJECT', 'action': 'CREATE', 'note': note,
            'payload': {'code': code, 'name': 'Ekonomi', 'level_category': 'UPPER_SEC', 'stream': 'TERAS'},
        }, format='json')

    def test_admin_proposal_waits_then_supervisor_approves(self):
        self.as_role(ADMIN)
        res = self.propose_new()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'PENDING')
        self.assertFalse(self.Subject.objects.filter(code='EKON').exists())

        self.as_role(SUPERVISOR)
        listed = self.client.get(self.URL + '?status=PENDING').data
        self.assertEqual([r['id'] for r in listed], [res.data['id']])
        done = self.client.post(f"{self.URL}{res.data['id']}/approve/", {'comment': 'OK'}, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data['status'], 'APPROVED')
        self.assertEqual(done.data['decided_by'], 'supervisor')
        self.assertTrue(self.Subject.objects.filter(code='EKON', is_active=True).exists())

        # The requester is told about the decision once, then it is marked as read
        self.as_role(ADMIN)
        self.assertEqual(len(self.client.get(self.URL + '?unseen=1').data), 1)
        self.assertEqual(self.client.get('/api/v1/dashboard/summary/').data['approvals']['change_requests_unseen'], 1)
        self.client.post(self.URL + 'acknowledge/')
        self.assertEqual(len(self.client.get(self.URL + '?unseen=1').data), 0)

    def test_update_changes_nothing_until_approved_and_keeps_old_values(self):
        self.as_role(ADMIN)
        res = self.client.post(self.URL, {
            'kind': 'SUBJECT', 'action': 'UPDATE', 'target_id': self.bm.id, 'note': 'Ejaan',
            'payload': {'name': 'BM', 'is_active': False},
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.bm.refresh_from_db()
        self.assertEqual((self.bm.name, self.bm.is_active), ('Bahasa Melayu', True))
        self.assertEqual(res.data['before'], {'name': 'Bahasa Melayu', 'is_active': True})
        self.assertEqual({c['field'] for c in res.data['changes']}, {'name', 'is_active'})

        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json')
        self.bm.refresh_from_db()
        self.assertEqual((self.bm.name, self.bm.is_active), ('BM', False))

    def test_reject_needs_reason_and_changes_nothing(self):
        self.as_role(ADMIN)
        req = self.propose_new().data
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"{self.URL}{req['id']}/reject/", {}, format='json').status_code, 400)
        res = self.client.post(f"{self.URL}{req['id']}/reject/", {'comment': 'Tidak diperlukan'}, format='json')
        self.assertEqual(res.data['status'], 'REJECTED')
        self.assertEqual(res.data['decision_comment'], 'Tidak diperlukan')
        self.assertFalse(self.Subject.objects.filter(code='EKON').exists())
        # A decided request cannot be decided again
        self.assertEqual(self.client.post(f"{self.URL}{req['id']}/approve/", {}, format='json').status_code, 400)

    def test_admin_cannot_decide_and_cannot_see_or_touch_other_admins_requests(self):
        self.as_role(ADMIN)
        req = self.propose_new().data
        self.assertEqual(self.client.post(f"{self.URL}{req['id']}/approve/", {}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f"{self.URL}{req['id']}/reject/", {'comment': 'x'}, format='json').status_code, 403)

        self.client.force_authenticate(self.admin2)
        self.assertEqual(self.client.get(self.URL).data, [])
        self.assertEqual(self.client.get(f"{self.URL}{req['id']}/").status_code, 404)
        self.assertEqual(self.client.post(f"{self.URL}{req['id']}/withdraw/").status_code, 404)

    def test_requester_can_revise_and_withdraw_until_decided(self):
        self.as_role(ADMIN)
        req = self.propose_new().data
        res = self.client.patch(f"{self.URL}{req['id']}/", {
            'note': 'Pelajar minta lagi',
            'payload': {'code': 'EKON', 'name': 'Ekonomi Asas', 'level_category': 'UPPER_SEC', 'stream': 'TERAS'},
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['payload']['name'], 'Ekonomi Asas')

        self.as_role(SUPERVISOR)  # an approver cannot rewrite someone else's request, only decide it
        self.assertEqual(self.client.patch(f"{self.URL}{req['id']}/", {'payload': {'name': 'X'}}, format='json').status_code, 403)
        self.client.post(f"{self.URL}{req['id']}/approve/", {}, format='json')
        self.as_role(ADMIN)
        self.assertEqual(self.client.patch(f"{self.URL}{req['id']}/", {'note': 'lagi'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f"{self.URL}{req['id']}/withdraw/").status_code, 400)

        second = self.propose_new(code='SEJ').data
        out = self.client.post(f"{self.URL}{second['id']}/withdraw/")
        self.assertEqual(out.data['status'], 'WITHDRAWN')
        self.assertFalse(self.Subject.objects.filter(code='SEJ').exists())

    def test_approver_changes_apply_at_once_and_are_recorded(self):
        self.as_role(SUPERVISOR)
        res = self.propose_new(note='')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data['status'], res.data['direct']), ('APPROVED', True))
        self.assertTrue(self.Subject.objects.filter(code='EKON').exists())
        self.assertEqual(self.client.get(self.URL).data[0]['target_label'], 'EKON Ekonomi')
        self.assertEqual(self.client.get('/api/v1/dashboard/summary/').data['approvals']['change_requests_unseen'], 0)

    def test_checks(self):
        self.as_role(ADMIN)
        self.assertEqual(self.propose_new(note='').status_code, 400)  # Admin must give a reason
        self.assertEqual(self.propose_new(code='BM').status_code, 400)  # code already used
        self.assertEqual(self.propose_new().status_code, 201)
        self.assertEqual(self.propose_new().status_code, 400)  # same code already waiting
        bad = self.client.post(self.URL, {'kind': 'SUBJECT', 'action': 'UPDATE', 'target_id': self.bm.id, 'note': 'x',
                                          'payload': {'code': 'BM2'}}, format='json')
        self.assertEqual(bad.status_code, 400)  # the code of an existing subject cannot change
        same = self.client.post(self.URL, {'kind': 'SUBJECT', 'action': 'UPDATE', 'target_id': self.bm.id, 'note': 'x',
                                           'payload': {'name': 'Bahasa Melayu'}}, format='json')
        self.assertEqual(same.status_code, 400)  # nothing changed
        self.assertEqual(self.client.post(self.URL, {'kind': 'NOPE', 'action': 'CREATE', 'note': 'x', 'payload': {}}, format='json').status_code, 400)

    def test_approval_checks_again_if_the_code_was_taken_meanwhile(self):
        self.as_role(ADMIN)
        req = self.propose_new().data
        self.Subject.objects.create(code='EKON', name='Lain', level_category='UPPER_SEC')
        self.as_role(SUPERVISOR)
        self.assertEqual(self.client.post(f"{self.URL}{req['id']}/approve/", {}, format='json').status_code, 400)
        self.assertEqual(self.client.get(f"{self.URL}{req['id']}/").data['status'], 'PENDING')

    def test_subjects_cannot_be_written_directly_by_anyone(self):
        for role in ALL_ROLES:
            self.as_role(role)
            self.assertEqual(self.client.post('/api/v1/business-config/subjects/', {
                'code': 'X1', 'name': 'X', 'level_category': 'UPPER_SEC'}, format='json').status_code, 405)
            self.assertEqual(self.client.patch(f'/api/v1/business-config/subjects/{self.bm.id}/', {'name': 'X'}, format='json').status_code, 405)
        self.assertEqual(self.client.get('/api/v1/business-config/subjects/').status_code, 200)

    def test_dashboard_counts(self):
        def counts():
            a = self.client.get('/api/v1/dashboard/summary/').data['approvals']
            return a['change_requests_pending'], a['change_requests_mine_pending']

        self.as_role(ADMIN)
        self.propose_new()
        self.assertEqual(counts(), (0, 1))  # waits for someone else to decide
        self.client.force_authenticate(self.admin2)
        self.assertEqual(counts(), (0, 0))
        self.as_role(SUPERVISOR)
        self.assertEqual(counts(), (1, 0))
        self.as_role(MANAGEMENT)
        self.assertEqual(counts(), (1, 0))


class VendorChangeRequestTests(RoleTestBase):
    """Vendor details: Supervisor asks, Management approves; Admin only chooses a vendor for a voucher."""
    URL = '/api/v1/change-requests/'

    def setUp(self):
        super().setUp()
        self.vendor = Vendor.objects.create(vendor_id='SSM-1', vendor_name='Kedai Buku', bank_name='Maybank', bank_account='111')

    def new_vendor(self, vendor_id='SSM-2', note='Pembekal baharu'):
        return self.client.post(self.URL, {
            'kind': 'VENDOR', 'action': 'CREATE', 'note': note,
            'payload': {'vendor_id': vendor_id, 'vendor_name': 'Syarikat ABC', 'bank_name': 'CIMB', 'bank_account': '222', 'tin_number': 'C123'},
        }, format='json')

    def test_admin_cannot_ask_for_vendor_changes(self):
        self.as_role(ADMIN)
        self.assertEqual(self.new_vendor().status_code, 403)
        self.assertEqual(Vendor.objects.count(), 1)

    def test_supervisor_asks_and_only_management_decides(self):
        self.as_role(SUPERVISOR)
        res = self.new_vendor()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data['status'], res.data['direct']), ('PENDING', False))
        self.assertFalse(Vendor.objects.filter(vendor_id='SSM-2').exists())
        self.assertFalse(res.data['can_decide'])
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/reject/", {'comment': 'x'}, format='json').status_code, 403)

        self.as_role(MANAGEMENT)
        seen = self.client.get(self.URL + '?status=PENDING').data
        self.assertTrue(seen[0]['can_decide'])
        done = self.client.post(f"{self.URL}{res.data['id']}/approve/", {'comment': 'OK'}, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        vendor = Vendor.objects.get(vendor_id='SSM-2')
        self.assertEqual((vendor.vendor_name, vendor.bank_account, vendor.status), ('Syarikat ABC', '222', 'ACTIVE'))

        self.as_role(SUPERVISOR)  # the Supervisor is told, and sees the decision
        self.assertEqual(len(self.client.get(self.URL + '?unseen=1').data), 1)

    def test_bank_detail_change_waits_for_management(self):
        self.as_role(SUPERVISOR)
        res = self.client.post(self.URL, {
            'kind': 'VENDOR', 'action': 'UPDATE', 'target_id': self.vendor.id, 'note': 'Tukar akaun',
            'payload': {'bank_account': '999'},
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.bank_account, '111')
        self.assertEqual(res.data['changes'][0]['before'], '111')
        # the same vendor cannot have two changes waiting
        again = self.client.post(self.URL, {'kind': 'VENDOR', 'action': 'UPDATE', 'target_id': self.vendor.id, 'note': 'x',
                                            'payload': {'phone_number': '012'}}, format='json')
        self.assertEqual(again.status_code, 400)
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/reject/", {'comment': 'Sahkan dahulu dengan pembekal'}, format='json')
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.bank_account, '111')

    def test_management_changes_apply_at_once(self):
        self.as_role(MANAGEMENT)
        res = self.client.post(self.URL, {
            'kind': 'VENDOR', 'action': 'UPDATE', 'target_id': self.vendor.id, 'payload': {'status': 'INACTIVE'},
        }, format='json')
        self.assertEqual((res.status_code, res.data['status'], res.data['direct']), (201, 'APPROVED', True))
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.status, 'INACTIVE')

    def test_checks(self):
        self.as_role(SUPERVISOR)
        self.assertEqual(self.new_vendor(vendor_id='SSM-1').status_code, 400)  # id already used
        self.assertEqual(self.new_vendor(note='').status_code, 400)  # reason needed
        self.assertEqual(self.new_vendor().status_code, 201)
        self.assertEqual(self.new_vendor().status_code, 400)  # same id already waiting
        bad = self.client.post(self.URL, {'kind': 'VENDOR', 'action': 'UPDATE', 'target_id': self.vendor.id, 'note': 'x',
                                          'payload': {'status': 'DELETED'}}, format='json')
        self.assertEqual(bad.status_code, 400)
        blank = self.client.post(self.URL, {'kind': 'VENDOR', 'action': 'CREATE', 'note': 'x',
                                            'payload': {'vendor_id': 'SSM-9', 'vendor_name': '  '}}, format='json')
        self.assertEqual(blank.status_code, 400)

    def test_vendors_cannot_be_written_directly_but_everyone_can_read(self):
        for role in ALL_ROLES:
            self.as_role(role)
            self.assertEqual(self.client.post('/api/v1/expenses/vendors/', {'vendor_id': 'X', 'vendor_name': 'X'}, format='json').status_code, 405)
            self.assertEqual(self.client.patch(f'/api/v1/expenses/vendors/{self.vendor.id}/', {'bank_account': '1'}, format='json').status_code, 405)
            self.assertEqual(self.client.get('/api/v1/expenses/vendors/').status_code, 200)
        self.assertEqual(Vendor.objects.get(pk=self.vendor.id).bank_account, '111')


class ExpenseCategoryRequestTests(RoleTestBase):
    """Expense categories and monthly budget: Supervisor sets, Management approves; Admin only picks one."""
    URL = '/api/v1/change-requests/'

    def setUp(self):
        super().setUp()
        self.cat = DynamicMasterData.objects.create(
            category='18_expense_cat', code='SEWA', label='Sewa Premis', meta_info={'budget': 3500.0}, status='APPROVED', is_locked=True)

    def ask(self, kind, action, payload, target_id=None, note='Perlu'):
        return self.client.post(self.URL, {'kind': kind, 'action': action, 'target_id': target_id, 'payload': payload, 'note': note}, format='json')

    def new_cat(self, code='GAJI', label='Gaji Staf', budget=4500, note='Perlu'):
        return self.ask('EXPENSE_CATEGORY', 'CREATE', {'code': code, 'label': label, 'budget': budget}, note=note)

    def test_admin_cannot_ask_for_categories(self):
        self.as_role(ADMIN)
        self.assertEqual(self.new_cat().status_code, 403)
        self.assertEqual(self.ask('EXPENSE_SUBCATEGORY', 'CREATE', {'code': 'X', 'label': 'X', 'cat': 'SEWA'}).status_code, 403)

    def test_supervisor_asks_management_approves_and_the_category_becomes_usable(self):
        self.as_role(SUPERVISOR)
        res = self.new_cat()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'PENDING')
        self.assertFalse(DynamicMasterData.objects.filter(category='18_expense_cat', code='GAJI').exists())
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json').status_code, 403)

        self.as_role(MANAGEMENT)
        done = self.client.post(f"{self.URL}{res.data['id']}/approve/", {'comment': 'OK'}, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        row = DynamicMasterData.objects.get(category='18_expense_cat', code='GAJI')
        self.assertEqual((row.status, row.label, row.meta_info['budget'], row.is_locked), ('APPROVED', 'Gaji Staf', 4500.0, True))
        self.assertEqual((row.created_by, row.approved_by), ('supervisor', 'management'))
        self.as_role(ADMIN)  # Admin can now pick it in the voucher drop-down
        listed = self.client.get('/api/v1/business-config/master-data/?category=18_expense_cat&status=APPROVED').data
        self.assertIn('GAJI', [r['code'] for r in listed])

    def test_budget_change_waits_and_label_cannot_change(self):
        self.as_role(SUPERVISOR)
        res = self.ask('EXPENSE_CATEGORY', 'UPDATE', {'budget': 4000}, target_id=self.cat.id)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['changes'][0]['before'], 'RM 3,500.00')
        self.assertEqual(res.data['changes'][0]['after'], 'RM 4,000.00')
        self.cat.refresh_from_db()
        self.assertEqual(self.cat.meta_info['budget'], 3500.0)
        # a name is stored on every voucher, so it cannot change
        self.assertEqual(self.ask('EXPENSE_CATEGORY', 'UPDATE', {'label': 'Lain'}, target_id=self.cat.id).status_code, 400)
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json')
        self.cat.refresh_from_db()
        self.assertEqual((self.cat.meta_info['budget'], self.cat.label), (4000.0, 'Sewa Premis'))

    def test_subcategory_needs_an_approved_category(self):
        self.as_role(SUPERVISOR)
        bad = self.ask('EXPENSE_SUBCATEGORY', 'CREATE', {'code': 'SUB_X', 'label': 'Sewa kedai', 'cat': 'TIADA'})
        self.assertEqual(bad.status_code, 400)
        ok = self.ask('EXPENSE_SUBCATEGORY', 'CREATE', {'code': 'SUB_X', 'label': 'Sewa kedai', 'cat': 'SEWA'})
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data['changes'][-1]['after'], 'Sewa Premis')  # shown by name, not code
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{ok.data['id']}/approve/", {}, format='json')
        row = DynamicMasterData.objects.get(category='19_expense_subcat', code='SUB_X')
        self.assertEqual((row.meta_info, row.status), ({'cat': 'SEWA'}, 'APPROVED'))

    def test_management_changes_apply_at_once(self):
        self.as_role(MANAGEMENT)
        res = self.new_cat(code='jamuan', label='Jamuan', budget='500.5')
        self.assertEqual((res.status_code, res.data['status'], res.data['direct']), (201, 'APPROVED', True))
        row = DynamicMasterData.objects.get(category='18_expense_cat', code='JAMUAN')
        self.assertEqual(row.meta_info['budget'], 500.5)

    def test_checks(self):
        self.as_role(SUPERVISOR)
        self.assertEqual(self.new_cat(code='SEWA').status_code, 400)  # code used
        self.assertEqual(self.new_cat(label='sewa premis').status_code, 400)  # name used (vouchers match by name)
        self.assertEqual(self.new_cat(code='A B!').status_code, 400)  # bad code
        self.assertEqual(self.new_cat(budget=-5).status_code, 400)
        self.assertEqual(self.new_cat(budget='abc').status_code, 400)
        self.assertEqual(self.new_cat(note='').status_code, 400)
        self.assertEqual(self.new_cat().status_code, 201)
        self.assertEqual(self.new_cat().status_code, 400)  # already waiting
        self.assertEqual(self.new_cat(code='GAJI2', label='gaji staf').status_code, 400)  # same name already waiting

    def test_the_two_lists_cannot_be_changed_through_data_induk(self):
        for role in (ADMIN, SUPERVISOR, MANAGEMENT):
            self.as_role(role)
            res = self.client.post('/api/v1/business-config/master-data/', {'category': '18_expense_cat', 'code': 'X', 'label': 'X'}, format='json')
            self.assertEqual(res.status_code, 403)
            if role != ADMIN:
                self.assertEqual(self.client.patch(f'/api/v1/business-config/master-data/{self.cat.id}/', {'label': 'X'}, format='json').status_code, 403)
                self.assertEqual(self.client.delete(f'/api/v1/business-config/master-data/{self.cat.id}/').status_code, 403)
        # other lists still work as before
        self.as_role(ADMIN)
        ok = self.client.post('/api/v1/business-config/master-data/', {'category': '3_lead_source', 'code': 'X1', 'label': 'X1'}, format='json')
        self.assertEqual(ok.status_code, 201)
        self.assertTrue(DynamicMasterData.objects.filter(pk=self.cat.id, label='Sewa Premis').exists())


class TeacherRequestTests(RoleTestBase):
    """New teachers and active / inactive changes: Supervisor asks, Management approves."""
    URL = '/api/v1/change-requests/'

    def setUp(self):
        super().setUp()
        from business_config.models import SubjectMaster
        self.math = SubjectMaster.objects.create(code='MT', name='Matematik', level_category='UPPER_SEC')
        self.bio = SubjectMaster.objects.create(code='BIO', name='Biologi', level_category='UPPER_SEC')
        self.teacher = Teacher.objects.create(teacher_code='NAK', full_name='Nur Aini', phone_number='011', rate_per_session=60)

    def ask(self, action, payload, target_id=None, note='Perlu'):
        return self.client.post(self.URL, {'kind': 'TEACHER', 'action': action, 'target_id': target_id, 'payload': payload, 'note': note}, format='json')

    def new_teacher(self, code='sf', **extra):
        payload = {'teacher_code': code, 'full_name': 'Siti Fatimah', 'phone_number': '012', 'teacher_type': 'REPLACEMENT',
                   'rate_per_session': '55', 'bank_name': 'Maybank', 'bank_account': '555', 'subjects_qualified': [self.math.id, self.bio.id],
                   'teaching_since': '2015-01-01', 'teaching_permit_expiry': '2027-03-01', **extra}
        return self.ask('CREATE', payload)

    def test_admin_cannot_ask(self):
        self.as_role(ADMIN)
        self.assertEqual(self.new_teacher().status_code, 403)
        self.assertEqual(Teacher.objects.count(), 1)

    def test_supervisor_asks_management_approves_and_the_teacher_is_created(self):
        self.as_role(SUPERVISOR)
        res = self.new_teacher()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'PENDING')
        self.assertFalse(Teacher.objects.filter(teacher_code='SF').exists())
        shown = {c['field']: c['after'] for c in res.data['changes']}
        self.assertEqual((shown['teacher_type'], shown['rate_per_session'], shown['subjects_qualified']), ('Sambilan (Part-time)', 'RM 55.00', 'Matematik, Biologi'))
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json').status_code, 403)

        self.as_role(ADMIN)  # Admin never sees pay: the request, with its rate and bank details, is not theirs
        self.assertEqual(self.client.get(self.URL).data, [])
        self.as_role(MANAGEMENT)
        done = self.client.post(f"{self.URL}{res.data['id']}/approve/", {'comment': 'OK'}, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        t = Teacher.objects.get(teacher_code='SF')
        self.assertEqual((t.teacher_type, float(t.rate_per_session), t.is_active, t.bank_account), ('REPLACEMENT', 55.0, True, '555'))
        self.assertEqual(set(t.subjects_qualified.values_list('code', flat=True)), {'MT', 'BIO'})
        self.assertEqual(str(t.teaching_since), '2015-01-01')

    def test_rate_and_code_cannot_change_here_but_other_details_can(self):
        self.as_role(SUPERVISOR)
        self.assertEqual(self.ask('UPDATE', {'rate_per_session': '99'}, self.teacher.id).status_code, 400)
        self.assertEqual(self.ask('UPDATE', {'teacher_code': 'ZZ'}, self.teacher.id).status_code, 400)
        res = self.ask('UPDATE', {'phone_number': '019', 'bank_account': '777', 'teacher_type': 'REPLACEMENT', 'rate_per_session': '60'}, self.teacher.id)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual({c['field'] for c in res.data['changes']}, {'phone_number', 'bank_account', 'teacher_type'})  # the unchanged rate is dropped
        self.teacher.refresh_from_db()
        self.assertEqual((self.teacher.phone_number, self.teacher.teacher_type), ('011', 'PERMANENT'))
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json')
        self.teacher.refresh_from_db()
        self.assertEqual((self.teacher.phone_number, self.teacher.bank_account, self.teacher.teacher_type, float(self.teacher.rate_per_session)),
                         ('019', '777', 'REPLACEMENT', 60.0))

    def test_a_teacher_with_classes_cannot_be_made_inactive(self):
        from academic.models import ClassTimetable, TimeSlot
        slot = TimeSlot.objects.create(day='SABTU', start_time='09:00', end_time='10:30', period_label='Pagi')
        cls = ClassTimetable.objects.create(slot=slot, form_level='F5', section='A', max_seats=10, subject=self.math, teacher=self.teacher)
        self.as_role(SUPERVISOR)
        blocked = self.ask('UPDATE', {'is_active': False}, self.teacher.id, note='Berhenti')
        self.assertEqual(blocked.status_code, 400)
        self.assertIn('1 kelas', str(blocked.data))
        cls.teacher = None
        cls.save()
        res = self.ask('UPDATE', {'is_active': False}, self.teacher.id, note='Berhenti')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['changes'][0]['after'], 'Tidak aktif')
        # a class is given back to the teacher before the decision: approval checks again
        cls.teacher = self.teacher
        cls.save()
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json').status_code, 400)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.is_active)

    def test_management_changes_apply_at_once(self):
        self.as_role(MANAGEMENT)
        res = self.new_teacher(code='az')
        self.assertEqual((res.status_code, res.data['status'], res.data['direct']), (201, 'APPROVED', True))
        self.assertTrue(Teacher.objects.filter(teacher_code='AZ').exists())
        off = self.ask('UPDATE', {'is_active': False}, self.teacher.id, note='')
        self.assertEqual(off.status_code, 201, off.data)
        self.teacher.refresh_from_db()
        self.assertFalse(self.teacher.is_active)

    def test_checks(self):
        self.as_role(SUPERVISOR)
        self.assertEqual(self.new_teacher(code='NAK').status_code, 400)  # code used
        self.assertEqual(self.new_teacher(code='A B!').status_code, 400)
        self.assertEqual(self.new_teacher(rate_per_session='-1').status_code, 400)
        self.assertEqual(self.new_teacher(rate_per_session='').status_code, 400)  # the starting rate is needed
        self.assertEqual(self.new_teacher(full_name='   ').status_code, 400)
        self.assertEqual(self.new_teacher(email='bukan-emel').status_code, 400)
        self.assertEqual(self.new_teacher(subjects_qualified=[9999]).status_code, 400)
        self.assertEqual(self.new_teacher(teaching_since='bukan tarikh').status_code, 400)
        self.assertEqual(self.new_teacher().status_code, 201)
        self.assertEqual(self.new_teacher().status_code, 400)  # same code already waiting
        self.assertEqual(self.ask('UPDATE', {'phone_number': '019'}, self.teacher.id).status_code, 201)
        self.assertEqual(self.ask('UPDATE', {'phone_number': '018'}, self.teacher.id).status_code, 400)  # one change at a time
        self.assertEqual(self.ask('UPDATE', {'phone_number': '011'}, self.teacher.id).status_code, 400)  # unchanged
        self.assertEqual(Teacher.objects.count(), 1)

    def test_teachers_cannot_be_written_directly(self):
        body = {'teacher_code': 'X', 'full_name': 'X', 'phone_number': '1'}
        self.as_role(ADMIN)
        self.assertEqual(self.client.post('/api/v1/teachers/teachers/', body, format='json').status_code, 403)
        for role in (SUPERVISOR, MANAGEMENT):
            self.as_role(role)
            self.assertEqual(self.client.post('/api/v1/teachers/teachers/', body, format='json').status_code, 405)
            self.assertEqual(self.client.patch(f'/api/v1/teachers/teachers/{self.teacher.id}/', {'rate_per_session': '1'}, format='json').status_code, 405)
        self.assertEqual(Teacher.objects.get(pk=self.teacher.id).rate_per_session, 60)


class FeePackageRequestTests(RoleTestBase):
    """Fee packages: Supervisor asks, Management approves; the package total always follows the rate."""
    URL = '/api/v1/change-requests/'

    def setUp(self):
        super().setUp()
        from business_config.models import PricingTier
        self.Tier = PricingTier
        self.t4 = PricingTier.objects.create(level_category='SECONDARY', group_label='Sekolah menengah', subject_count=4, price_per_subject=60, total_price=240)
        self.t5 = PricingTier.objects.create(level_category='SECONDARY', group_label='Sekolah menengah', subject_count=5, price_per_subject=55, total_price=275)
        self.d5 = PricingTier.objects.create(level_category='DARJAH_5', group_label='Darjah 5', subject_count=2, price_per_subject=50, total_price=100)

    def ask(self, action, payload=None, target_id=None, note='Perlu'):
        return self.client.post(self.URL, {'kind': 'PRICING_TIER', 'action': action, 'target_id': target_id, 'payload': payload or {}, 'note': note}, format='json')

    def test_admin_cannot_ask(self):
        self.as_role(ADMIN)
        self.assertEqual(self.ask('UPDATE', {'price_per_subject': '1'}, self.t4.id).status_code, 403)

    def test_rate_change_waits_and_the_total_follows_the_rate(self):
        self.as_role(SUPERVISOR)
        res = self.ask('UPDATE', {'price_per_subject': '65'}, self.t4.id)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data['changes'][0]['before'], res.data['changes'][0]['after']), ('RM 60.00', 'RM 65.00'))
        self.t4.refresh_from_db()
        self.assertEqual(float(self.t4.price_per_subject), 60.0)
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json').status_code, 403)
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/approve/", {'comment': 'OK'}, format='json').status_code, 200)
        self.t4.refresh_from_db()
        self.assertEqual((float(self.t4.price_per_subject), float(self.t4.total_price)), (65.0, 260.0))

    def test_new_package_and_new_group(self):
        self.as_role(SUPERVISOR)
        res = self.ask('CREATE', {'level_category': 'darjah 1 4', 'group_label': 'Darjah 1-4', 'subject_count': 2, 'price_per_subject': '45'})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['target_label'], 'Darjah 1-4 · 2 subjek')
        self.assertFalse(self.Tier.objects.filter(group_label='Darjah 1-4').exists())
        self.assertEqual(self.ask('CREATE', {'level_category': 'DARJAH_1_4', 'group_label': 'Darjah 1-4', 'subject_count': 2, 'price_per_subject': '40'}).status_code, 400)  # already waiting
        self.assertEqual(self.ask('CREATE', {'level_category': 'SECONDARY', 'subject_count': 4, 'price_per_subject': '40'}).status_code, 400)  # exists
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json')
        tier = self.Tier.objects.get(level_category='DARJAH_1_4')
        self.assertEqual((float(tier.total_price), tier.group_label), (90.0, 'Darjah 1-4'))

    def test_renaming_a_group_renames_every_package_in_it(self):
        self.as_role(SUPERVISOR)
        res = self.ask('UPDATE', {'group_label': 'Menengah (T1-T5)'}, self.t4.id)
        self.assertEqual(res.status_code, 201, res.data)
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json')
        self.assertEqual(set(self.Tier.objects.filter(level_category='SECONDARY').values_list('group_label', flat=True)), {'Menengah (T1-T5)'})
        self.assertEqual(self.Tier.objects.get(pk=self.d5.id).group_label, 'Darjah 5')

    def test_group_and_count_cannot_change_and_only_one_change_waits(self):
        self.as_role(SUPERVISOR)
        self.assertEqual(self.ask('UPDATE', {'subject_count': 9}, self.t4.id).status_code, 400)
        self.assertEqual(self.ask('UPDATE', {'level_category': 'LAIN'}, self.t4.id).status_code, 400)
        self.assertEqual(self.ask('UPDATE', {'price_per_subject': '60'}, self.t4.id).status_code, 400)  # no change
        self.assertEqual(self.ask('UPDATE', {'price_per_subject': '-1'}, self.t4.id).status_code, 400)
        self.assertEqual(self.ask('UPDATE', {'price_per_subject': '61'}, self.t4.id).status_code, 201)
        self.assertEqual(self.ask('UPDATE', {'price_per_subject': '62'}, self.t4.id).status_code, 400)
        self.assertEqual(self.ask('DELETE', None, self.t4.id).status_code, 400)  # a change is already waiting

    def test_removing_a_package(self):
        self.as_role(SUPERVISOR)
        # the only Darjah 5 package is still used by grade S5 (Darjah 5), so fees would drop to RM0
        blocked = self.ask('DELETE', None, self.d5.id)
        self.assertEqual(blocked.status_code, 400)
        self.assertIn('Darjah 5', str(blocked.data))
        res = self.ask('DELETE', None, self.t5.id)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['action'], 'DELETE')
        self.assertEqual(res.data['changes'][0]['after'], 'dipadam')
        self.assertTrue(self.Tier.objects.filter(pk=self.t5.id).exists())
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json').status_code, 200)
        self.assertFalse(self.Tier.objects.filter(pk=self.t5.id).exists())
        self.assertEqual(self.client.get(f"{self.URL}{res.data['id']}/").data['target_id'], self.t5.id)

    def test_management_changes_apply_at_once_and_direct_writes_are_closed(self):
        self.as_role(MANAGEMENT)
        res = self.ask('UPDATE', {'price_per_subject': '70'}, self.t4.id, note='')
        self.assertEqual((res.status_code, res.data['status'], res.data['direct']), (201, 'APPROVED', True))
        self.t4.refresh_from_db()
        self.assertEqual(float(self.t4.total_price), 280.0)
        for role in (SUPERVISOR, MANAGEMENT):
            self.as_role(role)
            self.assertEqual(self.client.patch(f'/api/v1/business-config/pricing-tiers/{self.t4.id}/', {'price_per_subject': '1'}, format='json').status_code, 405)
            self.assertEqual(self.client.delete(f'/api/v1/business-config/pricing-tiers/{self.t4.id}/').status_code, 405)
        self.as_role(ADMIN)
        self.assertEqual(self.client.patch(f'/api/v1/business-config/pricing-tiers/{self.t4.id}/', {'price_per_subject': '1'}, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/v1/business-config/pricing-tiers/').status_code, 200)


class DiscountRequestTests(RoleTestBase):
    """Discount types and voucher codes: Supervisor asks, Management approves; the counter only reads them."""
    URL = '/api/v1/change-requests/'

    def ask(self, action, payload=None, target_id=None, note='Perlu'):
        return self.client.post(self.URL, {'kind': 'DISCOUNT', 'action': action, 'target_id': target_id, 'payload': payload or {}, 'note': note}, format='json')

    def new_discount(self, note='Perlu', **extra):
        return self.ask('CREATE', {'name': 'Adik-beradik', 'code': 'sib10', 'mode': 'PERCENT', 'value': '10', 'recurring': True, **extra}, note=note)

    def test_supervisor_asks_management_approves(self):
        from billing.models import Discount
        self.as_role(ADMIN)
        self.assertEqual(self.new_discount().status_code, 403)
        self.as_role(SUPERVISOR)
        res = self.new_discount()
        self.assertEqual(res.status_code, 201, res.data)
        shown = {c['field']: c['after'] for c in res.data['changes']}
        self.assertEqual((shown['code'], shown['mode'], shown['recurring']), ('SIB10', '%', 'Setiap bulan'))
        self.assertFalse(Discount.objects.exists())
        self.assertEqual(self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json').status_code, 403)
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json')
        d = Discount.objects.get()
        self.assertEqual((d.code, d.mode, float(d.value), d.recurring, d.is_active, d.created_by), ('SIB10', 'PERCENT', 10.0, True, True, 'supervisor'))
        self.as_role(ADMIN)  # the counter can read and use it
        self.assertEqual(len(self.client.get('/api/v1/billing/discounts/').data), 1)

    def test_checks(self):
        self.as_role(SUPERVISOR)
        self.assertEqual(self.new_discount(value='150').status_code, 400)  # over 100 per cent
        self.assertEqual(self.new_discount(value='0').status_code, 400)
        self.assertEqual(self.new_discount(valid_from='2026-05-01', valid_until='2026-04-01').status_code, 400)
        self.assertEqual(self.new_discount(note='').status_code, 400)
        self.assertEqual(self.new_discount().status_code, 201)
        self.assertEqual(self.new_discount().status_code, 400)  # same code already waiting
        self.assertEqual(self.new_discount(code='SIB10', name='Lain').status_code, 400)

    def test_edit_and_code_is_fixed(self):
        from billing.models import Discount
        d = Discount.objects.create(name='Promosi', code='PROMO', mode='FIXED', value=20)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.ask('UPDATE', {'code': 'LAIN'}, d.id).status_code, 400)
        res = self.ask('UPDATE', {'value': '25', 'valid_until': '2026-12-31', 'is_active': False}, d.id)
        self.assertEqual(res.status_code, 201, res.data)
        d.refresh_from_db()
        self.assertEqual((float(d.value), d.is_active), (20.0, True))
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json')
        d.refresh_from_db()
        self.assertEqual((float(d.value), d.is_active, str(d.valid_until)), (25.0, False, '2026-12-31'))

    def test_a_used_discount_cannot_be_removed_but_an_unused_one_can(self):
        from billing.models import Discount
        used = Discount.objects.create(name='Dipakai', code='USED', mode='FIXED', value=5, used_count=2)
        spare = Discount.objects.create(name='Tidak dipakai', code='SPARE', mode='FIXED', value=5)
        self.as_role(SUPERVISOR)
        self.assertEqual(self.ask('DELETE', None, used.id).status_code, 400)
        res = self.ask('DELETE', None, spare.id)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(Discount.objects.filter(pk=spare.id).exists())
        self.as_role(MANAGEMENT)
        self.client.post(f"{self.URL}{res.data['id']}/approve/", {}, format='json')
        self.assertFalse(Discount.objects.filter(pk=spare.id).exists())
        self.assertTrue(Discount.objects.filter(pk=used.id).exists())

    def test_management_applies_at_once_and_direct_writes_are_closed(self):
        from billing.models import Discount
        self.as_role(MANAGEMENT)
        res = self.new_discount(note='')
        self.assertEqual((res.status_code, res.data['status'], res.data['direct']), (201, 'APPROVED', True))
        d = Discount.objects.get()
        for role in (SUPERVISOR, MANAGEMENT):
            self.as_role(role)
            self.assertEqual(self.client.post('/api/v1/billing/discounts/', {'name': 'X', 'code': 'X', 'value': '5'}, format='json').status_code, 405)
            self.assertEqual(self.client.patch(f'/api/v1/billing/discounts/{d.id}/', {'value': '99'}, format='json').status_code, 405)
            self.assertEqual(self.client.delete(f'/api/v1/billing/discounts/{d.id}/').status_code, 405)
        self.as_role(ADMIN)
        self.assertEqual(self.client.post('/api/v1/billing/discounts/', {'name': 'X', 'code': 'X', 'value': '5'}, format='json').status_code, 403)
        self.assertEqual(float(Discount.objects.get().value), 10.0)


class AccountTests(RoleTestBase):
    """Login accounts: Management creates them, sets roles, switches them off and resets passwords."""
    URL = '/api/v1/auth/accounts/'
    GOOD = 'Tuisyen-Annur-2026'

    def create(self, username='aina.r', role='ADMIN', **extra):
        return self.client.post(self.URL, {'username': username, 'full_name': 'Aina Rahman', 'role': role, **extra}, format='json')

    def login(self, username, password):
        self.client.force_authenticate(None)
        return self.client.post('/api/v1/auth/login/', {'username': username, 'password': password}, format='json')

    def test_only_management_can_manage_accounts(self):
        for role in (ADMIN, SUPERVISOR):
            self.as_role(role)
            self.assertEqual(self.client.get(self.URL).status_code, 403)
            self.assertEqual(self.create().status_code, 403)
            self.assertEqual(self.client.get(self.URL + 'events/').status_code, 403)
        self.assertFalse(User.objects.filter(username='aina.r').exists())

    def test_new_account_gets_a_temporary_password_and_must_change_it(self):
        self.as_role(MANAGEMENT)
        res = self.create(username='Aina.R')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data['username'], res.data['role'], res.data['must_change_password']), ('aina.r', 'ADMIN', True))
        temp = res.data['temporary_password']
        self.assertEqual(len(temp), 12)

        login = self.login('aina.r', temp)
        self.assertEqual(login.status_code, 200, login.data)
        self.assertTrue(login.data['user']['must_change_password'])
        self.as_role(MANAGEMENT)
        listed = {x['username']: x for x in self.client.get(self.URL).data}
        self.assertIsNotNone(listed['aina.r']['last_login'])  # Management can see when someone last logged in
        self.assertIsNone(listed['admin']['last_login'])
        self.client.force_authenticate(None)
        auth = {'HTTP_AUTHORIZATION': f"Token {login.data['token']}"}
        # until the password is changed only these calls work
        blocked = self.client.get('/api/v1/students/students/', **auth)
        self.assertEqual(blocked.status_code, 403)
        self.assertIn('tukar kata laluan', str(blocked.data).lower())
        self.assertEqual(self.client.get('/api/v1/auth/me/', **auth).status_code, 200)

        for bad, field in (('salah', 'old_password'), ('12345678901', 'new_password'), ('pendek', 'new_password')):
            body = {'old_password': 'x' if field == 'old_password' else temp, 'new_password': bad if field == 'new_password' else 'Sesuatu-Baharu-77'}
            self.assertEqual(self.client.post('/api/v1/auth/change-password/', body, format='json', **auth).status_code, 400)
        self.assertEqual(self.client.post('/api/v1/auth/change-password/', {'old_password': temp, 'new_password': temp}, format='json', **auth).status_code, 400)
        done = self.client.post('/api/v1/auth/change-password/', {'old_password': temp, 'new_password': 'Sesuatu-Baharu-77'}, format='json', **auth)
        self.assertEqual(done.status_code, 200, done.data)
        self.assertFalse(done.data['user']['must_change_password'])

        # the old token ends; the new one works everywhere
        self.assertEqual(self.client.get('/api/v1/auth/me/', **auth).status_code, 401)
        fresh = {'HTTP_AUTHORIZATION': f"Token {done.data['token']}"}
        self.assertEqual(self.client.get('/api/v1/students/students/', **fresh).status_code, 200)
        self.assertEqual(self.login('aina.r', temp).status_code, 400)
        self.assertEqual(self.login('aina.r', 'Sesuatu-Baharu-77').status_code, 200)

    def test_checks_on_new_accounts(self):
        from teachers.models import StaffMember
        self.as_role(MANAGEMENT)
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.create(username='AINA.R').status_code, 400)  # same name, any case
        for bad in ('ab', 'a b c', 'nama!', 'x' * 31):
            self.assertEqual(self.create(username=bad).status_code, 400, bad)
        self.assertEqual(self.create(username='baru', role='BOSS').status_code, 400)
        self.assertEqual(self.client.post(self.URL, {'username': 'baru', 'role': 'ADMIN'}, format='json').status_code, 400)  # no name
        self.assertEqual(self.create(username='baru', password='12345678').status_code, 400)  # numeric
        self.assertEqual(self.create(username='baru', password='pendek').status_code, 400)
        self.assertEqual(self.create(username='baru', password='password123').status_code, 400)  # too common
        self.assertFalse(User.objects.filter(username='baru').exists())
        taken = StaffMember.objects.create(staff_id='S9', name='Siti', role='Admin', phone='1', user=self.users[ADMIN])
        self.assertEqual(self.create(username='baru', staff=taken.id).status_code, 400)  # that staff already has an account

    def test_a_typed_password_is_not_echoed_back_and_a_staff_record_can_be_linked(self):
        from teachers.models import StaffMember
        staff = StaffMember.objects.create(staff_id='S8', name='Nora', role='Admin', phone='1')
        self.as_role(MANAGEMENT)
        res = self.create(password=self.GOOD, staff=staff.id)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertNotIn('temporary_password', res.data)
        self.assertEqual(res.data['staff']['name'], 'Nora')
        staff.refresh_from_db()
        self.assertEqual(staff.user.username, 'aina.r')
        self.assertEqual(self.login('aina.r', self.GOOD).status_code, 200)

    def test_role_name_and_status_changes_are_recorded(self):
        self.as_role(MANAGEMENT)
        uid = self.create().data['id']
        res = self.client.patch(f'{self.URL}{uid}/', {'role': 'SUPERVISOR', 'full_name': 'Aina R. Rahman'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data['role'], res.data['full_name']), ('SUPERVISOR', 'Aina R. Rahman'))
        self.assertEqual(self.client.patch(f'{self.URL}{uid}/', {'role': 'BOSS'}, format='json').status_code, 400)

        off = self.client.patch(f'{self.URL}{uid}/', {'is_active': False}, format='json')
        self.assertFalse(off.data['is_active'])
        self.assertEqual(self.login('aina.r', 'tidak-penting').status_code, 400)
        self.as_role(MANAGEMENT)
        self.client.patch(f'{self.URL}{uid}/', {'is_active': True}, format='json')
        events = self.client.get(self.URL + 'events/').data
        self.assertEqual([e['action'] for e in events][::-1], ['CREATED', 'RENAMED', 'ROLE_CHANGED', 'DEACTIVATED', 'REACTIVATED'])
        self.assertEqual(events[-1]['by'], 'management')
        self.assertIn('Admin → Supervisor', [e['detail'] for e in events])

    def test_a_deactivated_account_is_signed_out_at_once(self):
        self.as_role(MANAGEMENT)
        res = self.create(password=self.GOOD)
        token = self.login('aina.r', self.GOOD).data['token']
        # change the password so the account is usable, then switch it off
        auth = {'HTTP_AUTHORIZATION': f'Token {token}'}
        token = self.client.post('/api/v1/auth/change-password/', {'old_password': self.GOOD, 'new_password': 'Sesuatu-Baharu-77'}, format='json', **auth).data['token']
        auth = {'HTTP_AUTHORIZATION': f'Token {token}'}
        self.assertEqual(self.client.get('/api/v1/students/students/', **auth).status_code, 200)
        self.as_role(MANAGEMENT)
        self.client.patch(f"{self.URL}{res.data['id']}/", {'is_active': False}, format='json')
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/v1/students/students/', **auth).status_code, 401)

    def test_nobody_can_lock_the_centre_out(self):
        from core.accounts import other_active_management
        me = self.users[MANAGEMENT]
        self.as_role(MANAGEMENT)
        for body in ({'role': 'ADMIN'}, {'is_active': False}):
            self.assertEqual(self.client.patch(f'{self.URL}{me.id}/', body, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'{self.URL}{me.id}/', {'full_name': 'Pengurus Baharu'}, format='json').status_code, 200)  # own name is fine
        self.assertEqual(self.client.post(f'{self.URL}{me.id}/reset_password/', {}, format='json').status_code, 400)  # use change-password
        self.assertFalse(other_active_management(me))
        second = self.create(username='pengurus2', role='MANAGEMENT')
        self.assertTrue(other_active_management(me))
        self.assertEqual(second.status_code, 201)

    def test_system_administrator_accounts_are_not_editable_here(self):
        root = User.objects.create_superuser('root', password='Tuisyen-Annur-2026')
        self.as_role(MANAGEMENT)
        listed = {a['username']: a for a in self.client.get(self.URL).data}
        self.assertEqual((listed['root']['is_superuser'], listed['root']['role']), (True, 'MANAGEMENT'))
        self.assertEqual(self.client.patch(f'{self.URL}{root.id}/', {'is_active': False}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'{self.URL}{root.id}/reset_password/', {}, format='json').status_code, 403)

    def test_reset_password_signs_the_person_out_and_forces_a_change(self):
        self.as_role(MANAGEMENT)
        res = self.create(password=self.GOOD)
        uid = res.data['id']
        token = self.login('aina.r', self.GOOD).data['token']
        self.as_role(MANAGEMENT)
        reset = self.client.post(f'{self.URL}{uid}/reset_password/', {}, format='json')
        self.assertEqual(reset.status_code, 200, reset.data)
        temp = reset.data['temporary_password']
        self.assertTrue(reset.data['must_change_password'])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/v1/auth/me/', HTTP_AUTHORIZATION=f'Token {token}').status_code, 401)
        self.assertEqual(self.login('aina.r', self.GOOD).status_code, 400)
        self.assertTrue(self.login('aina.r', temp).data['user']['must_change_password'])
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.post(f'{self.URL}{uid}/reset_password/', {'password': 'pendek'}, format='json').status_code, 400)
        typed = self.client.post(f'{self.URL}{uid}/reset_password/', {'password': 'Lain-Sementara-55'}, format='json')
        self.assertNotIn('temporary_password', typed.data)
        self.assertEqual(self.login('aina.r', 'Lain-Sementara-55').status_code, 200)


class ScheduleRequestTests(RoleTestBase):
    """Time slots, classrooms and closed days: Supervisor asks, Management approves; nobody needs the developer."""
    URL = '/api/v1/change-requests/'

    def setUp(self):
        super().setUp()
        from academic.models import ClassTimetable, Classroom, TimeSlot
        from business_config.models import SubjectMaster
        self.TimeSlot, self.Classroom = TimeSlot, Classroom
        self.slot = TimeSlot.objects.create(day='SABTU', start_time='09:00', end_time='10:30', period_label='Pagi 9.00 - 10.30')
        self.room = Classroom.objects.create(name='Bilik Al-Farabi', capacity=20)
        self.math = SubjectMaster.objects.create(code='MT', name='Matematik', level_category='UPPER_SEC')
        self.cls = ClassTimetable.objects.create(slot=self.slot, subject=self.math, form_level='F5', section='A', max_seats=10, classroom=self.room)

    def ask(self, kind, action, payload=None, target_id=None, note='Perlu'):
        return self.client.post(self.URL, {'kind': kind, 'action': action, 'target_id': target_id, 'payload': payload or {}, 'note': note}, format='json')

    def approve(self, req):
        self.as_role(MANAGEMENT)
        res = self.client.post(f"{self.URL}{req.data['id']}/approve/", {}, format='json')
        self.as_role(SUPERVISOR)
        return res

    def test_admin_cannot_ask_and_nothing_can_be_written_directly(self):
        self.as_role(ADMIN)
        for kind, payload in (('TIME_SLOT', {'day': 'SABTU', 'start_time': '20:30', 'end_time': '22:00'}), ('CLASSROOM', {'name': 'Bilik Baru', 'capacity': 10}),
                              ('CLOSED_DATE', {'date': '2026-12-25', 'reason': 'Krismas'})):
            self.assertEqual(self.ask(kind, 'CREATE', payload).status_code, 403, kind)
        for role in (SUPERVISOR, MANAGEMENT):
            self.as_role(role)
            for url in ('time-slots', 'classrooms', 'closed-dates'):
                self.assertEqual(self.client.post(f'/api/v1/academic/{url}/', {}, format='json').status_code, 405, url)
        self.as_role(ADMIN)
        self.assertEqual(self.client.get('/api/v1/academic/closed-dates/').status_code, 200)

    def test_new_saturday_evening_slot_is_usable_after_approval(self):
        self.as_role(SUPERVISOR)
        res = self.ask('TIME_SLOT', 'CREATE', {'day': 'SABTU', 'start_time': '20:30', 'end_time': '22:00'})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'PENDING')
        self.assertEqual(res.data['target_label'], 'Sabtu 20:30-22:00')
        self.assertEqual(self.TimeSlot.objects.count(), 1)
        self.assertEqual(self.approve(res).status_code, 200)
        slot = self.TimeSlot.objects.get(start_time='20:30')
        self.assertEqual((slot.day, slot.end_time, slot.period_label, slot.is_active), ('SABTU', '22:00', 'Malam 8.30 - 10.00', True))
        self.as_role(ADMIN)
        self.assertIn('20:30', [s['start_time'] for s in self.client.get('/api/v1/academic/time-slots/').data])

    def test_a_sunday_slot_is_possible(self):
        self.as_role(MANAGEMENT)
        res = self.ask('TIME_SLOT', 'CREATE', {'day': 'AHAD', 'start_time': '10:00', 'end_time': '11:30'}, note='')
        self.assertEqual((res.status_code, res.data['status']), (201, 'APPROVED'))
        self.assertEqual(self.TimeSlot.objects.get(day='AHAD').period_label, 'Pagi 10.00 - 11.30')

    def test_slot_checks(self):
        self.as_role(SUPERVISOR)
        make = lambda **kw: self.ask('TIME_SLOT', 'CREATE', {'day': 'SABTU', 'start_time': '20:30', 'end_time': '22:00', **kw})
        self.assertEqual(make(start_time='8:30').status_code, 400)
        self.assertEqual(make(start_time='25:00').status_code, 400)
        self.assertEqual(make(end_time='20:30').status_code, 400)  # not after the start
        self.assertEqual(make(end_time='19:00').status_code, 400)
        self.assertEqual(make(day='ISNEN').status_code, 400)
        self.assertEqual(make(start_time='09:00', end_time='10:30').status_code, 400)  # already exists
        self.assertEqual(make().status_code, 201)
        self.assertEqual(make().status_code, 400)  # already waiting

    def test_changing_times_renames_the_slot_and_classes_keep_it(self):
        self.as_role(SUPERVISOR)
        res = self.ask('TIME_SLOT', 'UPDATE', {'start_time': '16:00', 'end_time': '17:30'}, self.slot.id)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.approve(res).status_code, 200)
        self.slot.refresh_from_db()
        self.assertEqual((self.slot.start_time, self.slot.period_label), ('16:00', 'Petang 4.00 - 5.30'))
        self.cls.refresh_from_db()
        self.assertEqual(self.cls.slot_id, self.slot.id)

    def test_a_slot_used_by_classes_is_retired_not_removed(self):
        self.as_role(SUPERVISOR)
        blocked = self.ask('TIME_SLOT', 'DELETE', None, self.slot.id)
        self.assertEqual(blocked.status_code, 400)
        self.assertIn('1 kelas', str(blocked.data))
        retire = self.ask('TIME_SLOT', 'UPDATE', {'is_active': False}, self.slot.id)
        self.assertEqual(retire.status_code, 201, retire.data)
        self.approve(retire)
        self.slot.refresh_from_db()
        self.assertFalse(self.slot.is_active)
        self.cls.refresh_from_db()
        self.assertEqual(self.cls.slot_id, self.slot.id)  # the class keeps it
        spare = self.TimeSlot.objects.create(day='ISNIN', start_time='09:00', end_time='10:30', period_label='x')
        gone = self.ask('TIME_SLOT', 'DELETE', None, spare.id)
        self.assertEqual(gone.status_code, 201, gone.data)
        self.approve(gone)
        self.assertFalse(self.TimeSlot.objects.filter(pk=spare.id).exists())

    def test_classrooms(self):
        self.as_role(SUPERVISOR)
        res = self.ask('CLASSROOM', 'CREATE', {'name': '  Bilik   Ibnu Sina ', 'capacity': 15})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.approve(res).status_code, 200)
        self.assertEqual(self.Classroom.objects.get(name='Bilik Ibnu Sina').capacity, 15)
        self.assertEqual(self.ask('CLASSROOM', 'CREATE', {'name': 'bilik al-farabi', 'capacity': 10}).status_code, 400)  # name used, any case
        self.assertEqual(self.ask('CLASSROOM', 'CREATE', {'name': 'Bilik Besar', 'capacity': 0}).status_code, 400)
        self.assertEqual(self.ask('CLASSROOM', 'CREATE', {'name': 'Bilik Besar', 'capacity': 900}).status_code, 400)
        self.assertEqual(self.ask('CLASSROOM', 'DELETE', None, self.room.id).status_code, 400)  # a class uses it
        rename = self.ask('CLASSROOM', 'UPDATE', {'name': 'Bilik Al-Farabi 2', 'capacity': 25}, self.room.id)
        self.assertEqual(rename.status_code, 201, rename.data)
        self.approve(rename)
        self.room.refresh_from_db()
        self.assertEqual((self.room.name, self.room.capacity), ('Bilik Al-Farabi 2', 25))

    def test_a_closed_day_blocks_attendance_and_roster(self):
        from datetime import date
        on = date(2026, 12, 25)
        self.as_role(SUPERVISOR)
        res = self.ask('CLOSED_DATE', 'CREATE', {'date': '2026-12-25', 'reason': 'Hari Krismas'})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['target_label'], '25/12/2026 Hari Krismas')
        self.assertEqual(self.ask('CLOSED_DATE', 'CREATE', {'date': '2026-12-25', 'reason': 'Lain'}).status_code, 400)  # waiting
        self.assertEqual(self.approve(res).status_code, 200)
        self.assertEqual(self.ask('CLOSED_DATE', 'CREATE', {'date': '2026-12-25', 'reason': 'Lain'}).status_code, 400)  # exists
        self.assertEqual(self.ask('CLOSED_DATE', 'UPDATE', {'date': '2026-12-26'}, 1).status_code, 400)  # the date cannot move

        self.as_role(ADMIN)
        teacher = self.client.get('/api/v1/teachers/attendance/roster/?date=2026-12-25').data
        self.assertEqual((teacher['closed'], teacher['classes']), ('Hari Krismas', []))
        self.assertEqual(self.client.post('/api/v1/teachers/attendance/roster/', {'date': '2026-12-25', 'marks': []}, format='json').status_code, 400)
        student = self.client.get(f'/api/v1/attendance/roster/?class_id={self.cls.id}&date=2026-12-25').data
        self.assertEqual(student['closed'], 'Hari Krismas')
        self.assertEqual(self.client.post('/api/v1/attendance/roster/', {'class_id': self.cls.id, 'date': '2026-12-25', 'marks': []}, format='json').status_code, 400)
        # an open day is unaffected
        self.assertIsNone(self.client.get(f'/api/v1/attendance/roster/?class_id={self.cls.id}&date=2026-12-24').data['closed'])
        self.assertEqual(self.client.post('/api/v1/attendance/roster/', {'class_id': self.cls.id, 'date': '2026-12-24', 'marks': []}, format='json').status_code, 200)

    def test_a_day_with_attendance_cannot_be_closed_and_a_closed_day_can_reopen(self):
        from students.models import ClassAttendanceSession
        ClassAttendanceSession.objects.create(timetable_class=self.cls, date='2026-12-24', recorded_by='x')
        self.as_role(SUPERVISOR)
        blocked = self.ask('CLOSED_DATE', 'CREATE', {'date': '2026-12-24', 'reason': 'Cuti'})
        self.assertEqual(blocked.status_code, 400)
        self.assertIn('Kehadiran sudah direkod', str(blocked.data))
        res = self.ask('CLOSED_DATE', 'CREATE', {'date': '2026-12-25', 'reason': 'Krismas'})
        self.approve(res)
        from academic.models import ClosedDate
        cd = ClosedDate.objects.get()
        reopen = self.ask('CLOSED_DATE', 'DELETE', None, cd.id)
        self.assertEqual(reopen.status_code, 201, reopen.data)
        self.assertTrue(ClosedDate.objects.exists())
        self.approve(reopen)
        self.assertFalse(ClosedDate.objects.exists())
        self.as_role(ADMIN)
        self.assertIsNone(self.client.get('/api/v1/teachers/attendance/roster/?date=2026-12-25').data['closed'])


class CentreProfileTests(RoleTestBase):
    """The centre's details live in one place; Management edits them and every document reads them."""
    PUBLIC = '/api/v1/centre/'
    PROFILE = '/api/v1/centre/profile/'

    def test_the_login_page_can_read_the_public_details_but_not_the_tin_or_bank(self):
        self.client.force_authenticate(None)
        res = self.client.get(self.PUBLIC)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['name'], 'Pusat Tuisyen An Nur')
        for private in ('tin', 'bank_name', 'bank_account', 'bank_holder'):
            self.assertNotIn(private, res.data)
        self.assertIn(self.client.get(self.PROFILE).status_code, (401, 403))  # the full profile needs a login

    def test_staff_read_the_full_profile_and_only_management_changes_it(self):
        for role in ALL_ROLES:
            self.as_role(role)
            self.assertIn('tin', self.client.get(self.PROFILE).data)
        for role in (ADMIN, SUPERVISOR):
            self.as_role(role)
            self.assertEqual(self.client.put(self.PROFILE, {'phone': '012-3456789'}, format='json').status_code, 403)
            self.assertEqual(self.client.get('/api/v1/centre/events/').status_code, 403)

    def test_management_saves_the_details_and_changes_are_recorded(self):
        self.as_role(MANAGEMENT)
        res = self.client.put(self.PROFILE, {
            'name': '  Pusat  Tuisyen An Nur ', 'phone': '09-747 1234', 'whatsapp': '+60 13-983 8085',
            'tin': 'c 1234567-89', 'bank_name': 'Maybank', 'bank_account': '5140 1234 5678', 'bank_holder': 'Pusat Tuisyen An Nur',
            'email': 'admin@annur.example',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data['name'], res.data['whatsapp'], res.data['tin']), ('Pusat Tuisyen An Nur', '60139838085', 'C 1234567-89'))

        self.client.force_authenticate(None)
        public = self.client.get(self.PUBLIC).data
        self.assertEqual((public['phone'], public['email']), ('09-747 1234', 'admin@annur.example'))
        self.assertNotIn('tin', public)

        self.as_role(MANAGEMENT)
        events = self.client.get('/api/v1/centre/events/').data
        changed = {e['label']: (e['old'], e['new']) for e in events}
        self.assertEqual(changed['Telefon'], ('013-983 8085', '09-747 1234'))
        self.assertEqual(changed['No. TIN'], ('', 'C 1234567-89'))
        self.assertNotIn('Nama pusat', changed)  # the name only had extra spaces, so nothing changed
        self.assertEqual(events[0]['by'], 'management')
        n = len(events)
        self.client.put(self.PROFILE, {'phone': '09-747 1234'}, format='json')  # nothing new to record
        self.assertEqual(len(self.client.get('/api/v1/centre/events/').data), n)

    def test_checks(self):
        self.as_role(MANAGEMENT)
        for bad in ({'name': '   '}, {'address': ''}, {'phone': 'telefon'}, {'phone': '12'}, {'whatsapp': 'abc'}, {'whatsapp': '123'},
                    {'email': 'bukan-emel'}, {'tin': '!!!'}, {'tin': 'A' * 40}, {'bank_account': 'abc'}, {'name': 'x' * 101}, {'warna': 'biru'}):
            res = self.client.put(self.PROFILE, bad, format='json')
            self.assertEqual(res.status_code, 400, bad)
        self.assertEqual(self.client.get(self.PROFILE).data['name'], 'Pusat Tuisyen An Nur')
        self.assertEqual(self.client.get('/api/v1/centre/events/').data, [])
        self.assertEqual(self.client.put(self.PROFILE, {'tin': '', 'email': ''}, format='json').status_code, 200)  # optional ones can be cleared

    def test_documents_read_the_saved_details(self):
        from core import pdf
        self.as_role(MANAGEMENT)
        self.client.put(self.PROFILE, {'name': 'Pusat Ilmu Baharu', 'phone': '09-111 2222', 'tin': 'C 99887766-01'}, format='json')
        header = ' '.join(p.text for p in pdf._header('RESIT RASMI') if hasattr(p, 'text'))
        self.assertIn('PUSAT ILMU BAHARU', header)
        self.assertIn('09-111 2222', header)
        self.assertIn('C 99887766-01', header)

    def test_the_general_settings_endpoint_does_not_bypass_the_checks(self):
        from business_config.models import BusinessSetting
        row = BusinessSetting.objects.create(key='CENTER_PHONE', value='x')
        self.as_role(MANAGEMENT)
        self.assertEqual(self.client.patch(f'/api/v1/business-config/settings/{row.id}/', {'value': 'bukan telefon'}, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/v1/business-config/settings/', {'key': 'CENTER_TIN', 'value': '!!'}, format='json').status_code, 403)
        other = BusinessSetting.objects.create(key='MONTHLY_DUE_DAY', value='7')
        self.assertEqual(self.client.patch(f'/api/v1/business-config/settings/{other.id}/', {'value': '10'}, format='json').status_code, 200)
