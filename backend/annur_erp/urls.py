from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from business_config.views import (
    grade_list,
    SubjectMasterViewSet, PricingTierViewSet, BusinessSettingViewSet,
    TeacherRateSettingViewSet, DynamicMasterDataViewSet
)
from teachers.views import (
    TeacherViewSet, TeacherAttendanceViewSet, TeacherComplaintViewSet, TeacherRateIncrementViewSet, TeacherPaymentViewSet,
    StaffRecordViewSet, StaffKPIViewSet,
    StaffMemberViewSet, StaffAttendanceViewSet, LeaveRequestViewSet
)
from academic.views import (
    TimetableChangeViewSet,
    ClassroomViewSet, TimeSlotViewSet, ClosedDateViewSet, ClassTimetableViewSet,
    ClassRescheduleLogViewSet, LessonHandoutViewSet
)
from students.views import (
    StudentViewSet, LeadViewSet, StudentEventViewSet, ClassWaitlistViewSet, StudentExamResultViewSet, StudentFeedbackViewSet,
    parent_self_register, attendance_roster, attendance_summary, attendance_sessions,
)
from billing.views import DiscountViewSet, InvoiceViewSet, PaymentReceiptViewSet, calculate_fees
from expenses.views import VendorViewSet, PaymentVoucherViewSet
from core.attachments import AttachmentViewSet
from core.change_request_views import ChangeRequestViewSet
from core.accounts import AccountViewSet
from core.centre import centre_events, centre_profile, centre_public
from core.messages import message_detail, messages_list, messages_public
from core.views import dashboard_summary, reports_summary, auth_login, auth_me, auth_logout, auth_users, auth_change_password

router = DefaultRouter()
# Business Config (Management Self-Service Engine & Dynamic Master Data)
router.register(r'business-config/subjects', SubjectMasterViewSet)
router.register(r'business-config/pricing-tiers', PricingTierViewSet)
router.register(r'business-config/settings', BusinessSettingViewSet)
router.register(r'business-config/teacher-rates', TeacherRateSettingViewSet)
router.register(r'business-config/master-data', DynamicMasterDataViewSet)
router.register(r'change-requests', ChangeRequestViewSet)
router.register(r'auth/accounts', AccountViewSet, basename='account')

# Academic & Timetable
router.register(r'academic/classrooms', ClassroomViewSet)
router.register(r'academic/time-slots', TimeSlotViewSet)
router.register(r'academic/closed-dates', ClosedDateViewSet)
router.register(r'academic/timetable', ClassTimetableViewSet)
router.register(r'academic/reschedule-logs', ClassRescheduleLogViewSet)
router.register(r'academic/timetable-changes', TimetableChangeViewSet)
router.register(r'academic/handouts', LessonHandoutViewSet)

# Teachers & Staff HR
router.register(r'teachers/teachers', TeacherViewSet)
router.register(r'teachers/attendance', TeacherAttendanceViewSet)
router.register(r'teachers/payments', TeacherPaymentViewSet)
router.register(r'teachers/complaints', TeacherComplaintViewSet)
router.register(r'teachers/rate-increments', TeacherRateIncrementViewSet)
router.register(r'teachers/staff', StaffMemberViewSet)
router.register(r'teachers/staff-attendance', StaffAttendanceViewSet)
router.register(r'teachers/leave-requests', LeaveRequestViewSet)
router.register(r'teachers/staff-records', StaffRecordViewSet)
router.register(r'teachers/staff-kpis', StaffKPIViewSet)

# Students & CRM Leads
router.register(r'students/students', StudentViewSet)
router.register(r'students/leads', LeadViewSet)
router.register(r'students/feedback', StudentFeedbackViewSet)
router.register(r'files', AttachmentViewSet)
router.register(r'students/history', StudentEventViewSet)
router.register(r'students/waitlist', ClassWaitlistViewSet)
router.register(r'students/results', StudentExamResultViewSet)

# Billing
router.register(r'billing/invoices', InvoiceViewSet)
router.register(r'billing/receipts', PaymentReceiptViewSet)
router.register(r'billing/discounts', DiscountViewSet)

# Expenses
router.register(r'expenses/vendors', VendorViewSet)
router.register(r'expenses/vouchers', PaymentVoucherViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/login/', auth_login),
    path('api/v1/auth/me/', auth_me),
    path('api/v1/auth/logout/', auth_logout),
    path('api/v1/auth/change-password/', auth_change_password),
    path('api/v1/centre/', centre_public),
    path('api/v1/centre/profile/', centre_profile),
    path('api/v1/centre/events/', centre_events),
    path('api/v1/messages/', messages_list),
    path('api/v1/messages/public/', messages_public),
    path('api/v1/messages/<str:key>/', message_detail),
    path('api/v1/', include(router.urls)),
    path('api/v1/auth/users/', auth_users),
    path('api/v1/business-config/grades/', grade_list),
    path('api/v1/dashboard/summary/', dashboard_summary),
    path('api/v1/reports/summary/', reports_summary),
    path('api/v1/students/parent-self-register/', parent_self_register),
    path('api/v1/attendance/roster/', attendance_roster),
    path('api/v1/attendance/summary/', attendance_summary),
    path('api/v1/attendance/sessions/', attendance_sessions),
    path('api/v1/billing/calculate-fees/', calculate_fees),
]

