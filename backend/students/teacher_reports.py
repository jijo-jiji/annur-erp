"""Two-way reports (Phase H), entered by staff (client decision 7).

- A teacher's report about a student (StudentReport): on the student's profile, and beside the student on Prestasi
  pelajar while it is open. Every role records and follows them up; Supervisor and Management delete.
- A student's or parent's report about a teacher is a complaint (teachers.TeacherComplaint) with who it came from and
  the student it concerns; it stays with Supervisor and Management, as complaints always have.

Both take comments one at a time (`comment`), kept with who wrote them and when, never edited."""
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from core import notify
from core.permissions import APPROVER_ROLES, display_name, require_role
from .models import StudentReport

MAX_COMMENT = 1000


def add_comment(obj, text, by):
    """Add one comment to a report or complaint."""
    text = str(text or '').strip()
    if not text:
        raise ValidationError({'text': 'Tulis komen dahulu.'})
    if len(text) > MAX_COMMENT:
        raise ValidationError({'text': f'Komen terlalu panjang (maksimum {MAX_COMMENT} aksara).'})
    obj.comments = [*(obj.comments or []), {'by': by, 'at': timezone.localtime().isoformat(timespec='minutes'), 'text': text}]
    obj.save(update_fields=['comments'])
    return obj


class StudentReportSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True, default='')
    class_code = serializers.CharField(source='timetable_class.class_code', read_only=True, default='')
    student_name = serializers.CharField(source='student.full_name', read_only=True)

    class Meta:
        model = StudentReport
        fields = '__all__'
        read_only_fields = ('comments', 'recorded_by')

    def validate(self, attrs):
        cls = attrs.get('timetable_class')
        if cls is not None:
            student = attrs.get('student', getattr(self.instance, 'student', None))
            if student is not None and not student.enrolled_classes.filter(pk=cls.pk).exists():
                raise serializers.ValidationError({'timetable_class': 'Pelajar ini tidak dalam kelas tersebut.'})
            if not attrs.get('teacher') and cls.teacher_id:
                attrs['teacher'] = cls.teacher  # the class's teacher unless another is named
        return attrs


class StudentReportViewSet(viewsets.ModelViewSet):
    queryset = StudentReport.objects.select_related('student', 'teacher', 'timetable_class__subject', 'timetable_class__teacher')
    serializer_class = StudentReportSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student_id=p['student'] if str(p['student']).isdigit() else 0)
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        return qs

    def perform_create(self, serializer):
        report = serializer.save(recorded_by=display_name(self.request.user))
        notify.student_report_added(report, self.request.user)

    @action(detail=True, methods=['post'])
    def comment(self, request, pk=None):
        return Response(self.get_serializer(add_comment(self.get_object(), request.data.get('text'), display_name(request.user))).data)


@api_view(['GET'])
def performance(request):
    """Prestasi pelajar: ?year=&term= (the latest exam with results by default). Supervisor and Management."""
    from .performance import concerns
    require_role(request, *APPROVER_ROLES)
    return Response(concerns(request.query_params.get('year'), request.query_params.get('term')))
