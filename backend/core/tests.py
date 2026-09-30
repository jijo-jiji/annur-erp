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
        self.assertEqual(self.client.patch(f"/api/v1/academic/reschedule-logs/{res.data['id']}/",
                                           {'supervisor_approved': True}, format='json').status_code, 403)



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
