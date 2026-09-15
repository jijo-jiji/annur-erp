from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from datetime import date
from .models import Student, StudentExamResult
from .serializers import StudentSerializer, StudentExamResultSerializer
from billing.models import Invoice

class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all().prefetch_related('enrolled_classes').order_by('-created_at')
    serializer_class = StudentSerializer

    def perform_create(self, serializer):
        # Auto-generate Student ID if not provided
        last_student = Student.objects.order_by('-id').first()
        next_num = (last_student.id + 1) if last_student else 1
        generated_id = f"AN-2026-{next_num:03d}"
        student = serializer.save(student_id=serializer.validated_data.get('student_id') or generated_id)
        
        # Auto create first invoice
        fee = 240.00 if student.form_level.startswith('F') else 200.00
        Invoice.objects.create(
            invoice_number=f"INV-2026-{next_num:03d}",
            student=student,
            billing_month=date.today().replace(day=1),
            registration_fee=30.00,
            monthly_fee=fee,
            total_payable=fee + 30.00,
            total_paid=0.00,
            balance_due=fee + 30.00,
            status='UNPAID',
            due_date=date.today().replace(day=7)
        )

@api_view(['POST'])
def parent_self_register(request):
    """Mobile endpoint for parents registering via QR code"""
    data = request.data.copy()
    last_student = Student.objects.order_by('-id').first()
    next_num = (last_student.id + 1) if last_student else 1
    data['student_id'] = f"AN-2026-{next_num:03d}"
    data['join_date'] = date.today().isoformat()
    data['lead_source'] = data.get('lead_source', 'QR_CODE')
    data['status'] = 'ACTIVE'

    serializer = StudentSerializer(data=data)
    if serializer.is_valid():
        student = serializer.save()
        fee = 240.00 if student.form_level.startswith('F') else 200.00
        Invoice.objects.create(
            invoice_number=f"INV-2026-{next_num:03d}",
            student=student,
            billing_month=date.today().replace(day=1),
            registration_fee=30.00,
            monthly_fee=fee,
            total_payable=fee + 30.00,
            total_paid=0.00,
            balance_due=fee + 30.00,
            status='UNPAID',
            due_date=date.today().replace(day=7)
        )
        return Response({
            'success': True,
            'message': 'Pendaftaran berjaya! Sila hubungi kaunter pejabat untuk pembayaran dan pengesahan.',
            'student': serializer.data
        }, status=status.HTTP_201_CREATED)
    return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
