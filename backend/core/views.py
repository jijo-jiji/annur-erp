from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db.models import Sum, Count
from datetime import date
from students.models import Student
from billing.models import Invoice, PaymentReceipt
from academic.models import ClassTimetable, ClassRescheduleLog
from teachers.models import Teacher

@api_view(['GET'])
def dashboard_summary(request):
    total_students = Student.objects.count()
    active_monthly = Student.objects.filter(status='ACTIVE', student_type='MONTHLY').count()
    walk_in_students = Student.objects.filter(status='ACTIVE', student_type='WALK_IN').count()
    inactive_students = Student.objects.filter(status='TERMINATED').count()

    # Sales
    monthly_sales = PaymentReceipt.objects.aggregate(total=Sum('amount_paid'))['total'] or 0.0
    outstanding = Invoice.objects.filter(status__in=['UNPAID', 'PARTIAL']).aggregate(total=Sum('balance_due'))['total'] or 0.0

    # Capacity alerts
    all_classes = ClassTimetable.objects.all()
    overcapacity_classes = [c.class_code for c in all_classes if c.current_enrolled > c.max_seats]
    near_full_classes = [c.class_code for c in all_classes if c.current_enrolled >= c.max_seats - 2 and c.current_enrolled <= c.max_seats]

    # Reschedule logs
    recent_reschedules = ClassRescheduleLog.objects.order_by('-created_at')[:5]
    reschedule_data = [{
        'class_code': r.timetable_class.class_code,
        'batal': r.tarikh_batal,
        'ganti': r.tarikh_ganti,
        'remarks': r.remarks,
        'is_extra': r.is_extra_class
    } for r in recent_reschedules]

    # Staff & Teacher counts
    teachers_count = Teacher.objects.filter(is_active=True).count()

    return Response({
        'total_students': total_students,
        'active_monthly': active_monthly,
        'walk_in_students': walk_in_students,
        'inactive_students': inactive_students,
        'monthly_sales': float(monthly_sales),
        'outstanding_arrears': float(outstanding),
        'teachers_active': teachers_count,
        'overcapacity_classes': overcapacity_classes,
        'near_full_classes': near_full_classes,
        'recent_reschedules': reschedule_data,
        'alerts': [
            {"type": "danger", "msg": f"Amaran Kapasiti: {len(overcapacity_classes)} kelas melebihi had tempat duduk (contoh: F4 ADDMT A melebihi 2 kerusi)!"},
            {"type": "warning", "msg": "Kutipan Yuran: Tarikh akhir 7hb semakin hampir. Sila semak senarai baki tertunggak."},
            {"type": "info", "msg": "Jadual Master 2026: 5 sesi gantian kelas telah disahkan oleh Supervisor."},
        ]
    })
