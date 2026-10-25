"""School exam results: entry by staff (one student and term in a grid, or a whole tuition class), the public form
parents and students use (#/keputusan) and the review queue for what they send. Terms: students.exam_terms."""
import json
from datetime import date

from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, parser_classes, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from academic.models import ClassTimetable
from business_config.models import SubjectMaster
from core import files, grades
from core.models import Attachment
from core.permissions import display_name
from . import exam_terms
from .models import ResultSubmission, Student, StudentExamResult

SUBJECT_LEVEL = {'PRIMARY': 'PRIMARY', 'LOWER': 'LOWER_SEC', 'UPPER': 'UPPER_SEC'}
MAX_TRIES = 5  # wrong IC digits for one student code before that code is locked for an hour


def _year(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({'year': 'Tahun tidak sah.'})


@transaction.atomic
def save_term(student, year, term, rows, by, source='STAFF', form_level='', remove_blank=True):
    """Save one term's results for a student: rows [{subject, mark, grade}]. A row left empty removes that
    subject's result for the term (unless `remove_blank` is False, as when approving a parent's form)."""
    form_level = form_level or student.form_level
    exam_terms.check(term, form_level, year)
    ids = []
    for row in rows:
        try:
            ids.append(int(row.get('subject')))
        except (TypeError, ValueError, AttributeError):
            raise ValidationError({'rows': 'Setiap baris perlukan subjek.'})
    subjects = {s.pk: s for s in SubjectMaster.objects.filter(pk__in=ids)}
    saved = removed = 0
    for subject_id, row in zip(ids, rows):
        subject = subjects.get(subject_id)
        if subject is None:
            raise ValidationError({'rows': 'Subjek tidak dijumpai.'})
        try:
            mark, grade = exam_terms.clean_row(term, row.get('mark'), row.get('grade'))
        except ValidationError as err:
            raise ValidationError({'rows': f"{subject.name}: {' '.join(str(m) for v in err.detail.values() for m in v)}"})
        key = {'student': student, 'year': year, 'term': term, 'subject': subject}
        if mark is None and not grade:
            if remove_blank:
                removed += StudentExamResult.objects.filter(**key).delete()[0]
            continue
        StudentExamResult.objects.update_or_create(**key, defaults={
            'mark': mark, 'grade': grade, 'form_level': form_level, 'source': source, 'recorded_by': by[:150],
        })
        saved += 1
    return {'saved': saved, 'removed': removed}


def subjects_for(student):
    """Subjects a student's results form offers: the subjects of their tuition classes first, then the other
    active subjects of their level."""
    taking = list(student.enrolled_classes.values_list('subject_id', flat=True))
    level = SUBJECT_LEVEL.get(grades.level_of(student.form_level), 'UPPER_SEC')
    rows = SubjectMaster.objects.filter(is_active=True).filter(Q(level_category=level) | Q(pk__in=taking)).order_by('name')
    return sorted(({'id': s.pk, 'name': s.name, 'tuition': s.pk in taking} for s in rows), key=lambda s: not s['tuition'])


# ---- Staff: results ---------------------------------------------------------------------------------------------

class StudentExamResultSerializer(serializers.ModelSerializer):
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    term_label = serializers.CharField(source='get_term_display', read_only=True)

    class Meta:
        model = StudentExamResult
        fields = '__all__'
        read_only_fields = ('exam_name', 'source', 'recorded_by')
        validators = []  # one result per student, year, term and subject: a second one updates the first

    def validate(self, attrs):
        get = lambda k, d=None: attrs.get(k, getattr(self.instance, k, d))
        student = get('student')
        form = get('form_level') or student.form_level
        exam_terms.check(get('term'), form, get('year'))
        mark, grade = exam_terms.clean_row(get('term'), get('mark'), get('grade', ''))
        if mark is None and not grade:
            raise ValidationError({'mark': 'Masukkan markah atau gred.'})
        if self.instance and StudentExamResult.objects.filter(
                student=student, year=get('year'), term=get('term'), subject=get('subject')).exclude(pk=self.instance.pk).exists():
            raise ValidationError({'subject': 'Keputusan subjek ini bagi peperiksaan tersebut sudah ada.'})
        attrs.update(form_level=form, mark=mark, grade=grade)
        return attrs


class StudentExamResultViewSet(viewsets.ModelViewSet):
    queryset = StudentExamResult.objects.select_related('student', 'subject').all()
    serializer_class = StudentExamResultSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('year'):
            qs = qs.filter(year=p['year'])
        return qs

    def perform_create(self, serializer):
        d = dict(serializer.validated_data)
        key = {k: d.pop(k) for k in ('student', 'year', 'term', 'subject')}
        serializer.instance, _ = StudentExamResult.objects.update_or_create(
            **key, defaults={**d, 'source': 'STAFF', 'recorded_by': display_name(self.request.user)})

    def perform_update(self, serializer):
        serializer.save(recorded_by=display_name(self.request.user))

    @action(detail=False, methods=['post'])
    def grid(self, request):
        """One student's results for one term: {student, year, term, rows: [{subject, mark, grade}]}."""
        student = Student.objects.filter(pk=request.data.get('student')).first()
        if student is None:
            raise ValidationError({'student': 'Pelajar tidak dijumpai.'})
        done = save_term(student, _year(request.data.get('year')), request.data.get('term'), request.data.get('rows') or [],
                         display_name(request.user), form_level=request.data.get('form_level') or '')
        return Response(done)

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """One term's results for a whole tuition class, in the class's subject:
        {class_id, year, term, marks: {student_code: mark, or a grade for SPM}}. A blank removes that result."""
        try:
            cls = ClassTimetable.objects.select_related('subject').get(pk=int(request.data.get('class_id')))
        except (TypeError, ValueError, ClassTimetable.DoesNotExist):
            raise ValidationError({'class_id': 'Kelas tidak dijumpai.'})
        year, term = _year(request.data.get('year')), request.data.get('term')
        students = {s.student_id: s for s in cls.students.all()}
        by = display_name(request.user)
        saved = 0
        with transaction.atomic():
            for code, value in (request.data.get('marks') or {}).items():
                student = students.get(code)
                if not student:
                    raise ValidationError({'marks': f'Pelajar {code} tiada dalam kelas ini.'})
                text = str(value if value is not None else '').strip()
                row = {'subject': cls.subject_id, **({'mark': text} if text.isdigit() or not text else {'grade': text})}
                saved += save_term(student, year, term, [row], by)['saved']
        return Response({'saved': saved})


# ---- Staff: review queue ----------------------------------------------------------------------------------------

class ResultSubmissionSerializer(serializers.ModelSerializer):
    student_code = serializers.CharField(source='student.student_id', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    term_label = serializers.CharField(source='get_term_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    reference = serializers.SerializerMethodField()
    rows_detail = serializers.SerializerMethodField()
    slip = serializers.SerializerMethodField()

    class Meta:
        model = ResultSubmission
        fields = '__all__'

    def get_reference(self, obj):
        return reference(obj)

    def get_rows_detail(self, obj):
        # Each subject with what is already saved for that term, so staff see what would change
        names = dict(SubjectMaster.objects.filter(pk__in=[r.get('subject') for r in obj.rows]).values_list('pk', 'name'))
        saved = {r.subject_id: r for r in StudentExamResult.objects.filter(student=obj.student, year=obj.year, term=obj.term)}
        return [{**r, 'subject_name': names.get(r.get('subject'), '?'),
                 'current_mark': getattr(saved.get(r.get('subject')), 'mark', None),
                 'current_grade': getattr(saved.get(r.get('subject')), 'grade', '')} for r in obj.rows]

    def get_slip(self, obj):
        a = Attachment.objects.filter(kind='RESULT_SLIP', object_id=obj.pk).first()
        return a and {'id': a.id, 'url': f"/api/v1/files/{a.id}/download/", 'name': a.original_name, 'original_name': a.original_name,
                      'content_type': a.content_type, 'is_image': a.content_type.startswith('image/')}


def reference(submission):
    return f"KP-{submission.pk:05d}"


class ResultSubmissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ResultSubmission.objects.select_related('student').all()
    serializer_class = ResultSubmissionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('status'):
            qs = qs.filter(status=self.request.query_params['status'])
        return qs

    def _pending(self):
        sub = self.get_object()
        if sub.status != 'PENDING':
            raise ValidationError({'detail': 'Hantaran ini sudah disemak.'})
        return sub

    def _decide(self, sub, decision, note):
        sub.status, sub.review_note = decision, note
        sub.reviewed_by, sub.reviewed_at = display_name(self.request.user), timezone.now()
        sub.save(update_fields=['status', 'review_note', 'reviewed_by', 'reviewed_at', 'rows'])
        return Response(self.get_serializer(sub).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Copy the rows (as sent, or as corrected by staff in `rows`) into the student's results."""
        sub = self._pending()
        if request.data.get('rows') is not None:
            sub.rows = request.data['rows']
        with transaction.atomic():
            save_term(sub.student, sub.year, sub.term, sub.rows,
                      f"{display_name(request.user)} (borang {sub.submitted_by})", source='PARENT',
                      form_level=sub.form_level, remove_blank=False)
            return self._decide(sub, 'APPROVED', (request.data.get('note') or '').strip())

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        sub = self._pending()
        note = (request.data.get('note') or '').strip()
        if not note:
            raise ValidationError({'note': 'Nyatakan sebab hantaran ditolak.'})
        return self._decide(sub, 'REJECTED', note)


# ---- Public form (no login) -------------------------------------------------------------------------------------

class PublicResultsThrottle(ScopedRateThrottle):
    scope = 'public_results'


def find_student(code, ic_last4):
    """The student with this code (or the code they had before renumbering) whose IC ends in these 4 digits.
    Repeated wrong digits lock the code for an hour."""
    code = str(code or '').strip().upper()
    ic4 = ''.join(ch for ch in str(ic_last4 or '') if ch.isdigit())
    tries_key = f'results-tries:{code}'
    if cache.get(tries_key, 0) >= MAX_TRIES:
        raise ValidationError({'detail': 'Terlalu banyak cubaan yang salah. Sila cuba semula selepas sejam atau hubungi kaunter.'})
    student = Student.objects.filter(Q(student_id=code) | Q(previous_student_id=code)).exclude(status='REJECTED').first() if code else None
    ic_digits = ''.join(ch for ch in (student.ic_number if student else '') if ch.isdigit())
    if student is None or len(ic4) != 4 or len(ic_digits) < 4 or not ic_digits.endswith(ic4):
        cache.set(tries_key, cache.get(tries_key, 0) + 1, 3600)
        raise ValidationError({'detail': 'Kod pelajar atau 4 digit akhir No. K/P tidak sepadan.'})
    cache.delete(tries_key)
    return student


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicResultsThrottle])
def public_results_check(request):
    """Step 1 of the public form: confirm the student and get the choices for their form."""
    student = find_student(request.data.get('student_code'), request.data.get('ic_last4'))
    this_year = date.today().year
    return Response({
        'name': student.full_name, 'student_code': student.student_id, 'form_level': student.form_level,
        'form_label': grades.label(student.form_level), 'years': [this_year, this_year - 1],
        'terms': exam_terms.terms_for(student.form_level), 'grades': exam_terms.GRADES, 'subjects': subjects_for(student),
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicResultsThrottle])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def public_results_submit(request):
    """Step 2: the results, an optional photo of the report slip, and who is sending them. They wait for staff
    review; sending again for the same exam replaces a submission that has not been reviewed yet."""
    student = find_student(request.data.get('student_code'), request.data.get('ic_last4'))
    year, term = _year(request.data.get('year')), request.data.get('term')
    exam_terms.check(term, student.form_level, year)
    rows = request.data.get('rows') or []
    if isinstance(rows, str):
        try:
            rows = json.loads(rows)
        except ValueError:
            raise ValidationError({'rows': 'Senarai keputusan tidak sah.'})
    allowed = {s['id'] for s in subjects_for(student)}
    clean = []
    for row in rows if isinstance(rows, list) else []:
        try:
            subject = int(row.get('subject'))
        except (TypeError, ValueError, AttributeError):
            continue
        if subject not in allowed:
            raise ValidationError({'rows': 'Subjek ini tidak ditawarkan untuk tingkatan pelajar.'})
        mark, grade = exam_terms.clean_row(term, row.get('mark'), row.get('grade'))
        if mark is not None or grade:
            clean.append({'subject': subject, 'mark': mark, 'grade': grade})
    if not clean:
        raise ValidationError({'rows': 'Masukkan sekurang-kurangnya satu keputusan.'})
    sender = str(request.data.get('submitted_by') or '').strip()[:120]
    if not sender:
        raise ValidationError({'submitted_by': 'Nyatakan nama anda.'})
    slip = request.FILES.get('slip')
    content_type = files.validate_upload('RESULT_SLIP', slip) if slip else None
    with transaction.atomic():
        sub = ResultSubmission.objects.filter(student=student, year=year, term=term, status='PENDING').first()
        replaced = sub is not None
        sub = sub or ResultSubmission(student=student, year=year, term=term)
        sub.form_level, sub.rows, sub.submitted_by = student.form_level, clean, sender
        sub.relation = str(request.data.get('relation') or '')[:30]
        sub.phone = str(request.data.get('phone') or '')[:30]
        sub.note = str(request.data.get('note') or '')[:1000]
        sub.save()
        if slip:
            Attachment.objects.filter(kind='RESULT_SLIP', object_id=sub.pk).delete()
            Attachment.objects.create(kind='RESULT_SLIP', object_id=sub.pk, file=slip, original_name=slip.name[:255],
                                      content_type=content_type, size=slip.size, uploaded_by_name=sender)
    return Response({'success': True, 'reference': reference(sub), 'replaced': replaced, 'student_name': student.full_name,
                     'exam': f"{exam_terms.label(term)} {year}", 'count': len(clean)}, status=status.HTTP_201_CREATED)
