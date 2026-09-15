from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from business_config.views import SubjectMasterViewSet, PricingTierViewSet, BusinessSettingViewSet, TeacherRateSettingViewSet
from teachers.views import TeacherViewSet, TeacherAttendanceViewSet
from academic.views import ClassroomViewSet, TimeSlotViewSet, ClassTimetableViewSet, ClassRescheduleLogViewSet
from students.views import StudentViewSet, parent_self_register
from billing.views import InvoiceViewSet, PaymentReceiptViewSet, calculate_fees
from expenses.views import VendorViewSet, PaymentVoucherViewSet
from core.views import dashboard_summary

router = DefaultRouter()
# Business Config (Management Self-Service Engine)
router.register(r'business-config/subjects', SubjectMasterViewSet)
router.register(r'business-config/pricing-tiers', PricingTierViewSet)
router.register(r'business-config/settings', BusinessSettingViewSet)
router.register(r'business-config/teacher-rates', TeacherRateSettingViewSet)

# Academic & Timetable
router.register(r'academic/classrooms', ClassroomViewSet)
router.register(r'academic/time-slots', TimeSlotViewSet)
router.register(r'academic/timetable', ClassTimetableViewSet)
router.register(r'academic/reschedule-logs', ClassRescheduleLogViewSet)

# Teachers
router.register(r'teachers/teachers', TeacherViewSet)
router.register(r'teachers/attendance', TeacherAttendanceViewSet)

# Students
router.register(r'students/students', StudentViewSet)

# Billing
router.register(r'billing/invoices', InvoiceViewSet)
router.register(r'billing/receipts', PaymentReceiptViewSet)

# Expenses
router.register(r'expenses/vendors', VendorViewSet)
router.register(r'expenses/vouchers', PaymentVoucherViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include(router.urls)),
    path('api/v1/dashboard/summary/', dashboard_summary),
    path('api/v1/students/parent-self-register/', parent_self_register),
    path('api/v1/billing/calculate-fees/', calculate_fees),
]
