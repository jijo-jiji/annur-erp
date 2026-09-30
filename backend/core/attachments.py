"""Attachment API: list, upload, download (permission-checked) and delete."""
from django.db import transaction
from django.http import FileResponse
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from . import files
from .models import Attachment
from .permissions import display_name


class AttachmentSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    doc_type_label = serializers.CharField(source='get_doc_type_display', read_only=True)
    url = serializers.SerializerMethodField()
    is_image = serializers.SerializerMethodField()
    is_video = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        exclude = ['file', 'uploaded_by']

    def get_url(self, obj):
        return f"/api/v1/files/{obj.id}/download/"

    def get_is_image(self, obj):
        return obj.content_type.startswith('image/')

    def get_is_video(self, obj):
        return obj.content_type.startswith('video/')


def after_upload(attachment, obj):
    """Keep the handout record's file details in step with its uploaded file."""
    if attachment.kind == 'HANDOUT':
        size = attachment.size
        obj.file_name = attachment.original_name[:200]
        obj.file_size = f"{size / files.MB:.1f} MB" if size >= files.MB else f"{max(1, size // 1024)} KB"
        obj.file_type = attachment.content_type.split('/')[-1].upper()[:50]
        obj.save(update_fields=['file_name', 'file_size', 'file_type'])


class AttachmentViewSet(viewsets.ModelViewSet):
    queryset = Attachment.objects.all()
    serializer_class = AttachmentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def list(self, request):
        kind = request.query_params.get('kind')
        object_id = request.query_params.get('object_id')
        if not kind or not object_id:
            raise ValidationError({'detail': 'kind dan object_id diperlukan.'})
        obj = files.target(kind, object_id)
        files.check(request.user, 'view', kind, obj)
        rows = Attachment.objects.filter(kind=kind, object_id=obj.pk)
        return Response(self.get_serializer(rows, many=True).data)

    def retrieve(self, request, pk=None):
        attachment = self.get_object()
        files.check(request.user, 'view', attachment.kind, files.target(attachment.kind, attachment.object_id), attachment)
        return Response(self.get_serializer(attachment).data)

    def create(self, request):
        kind = request.data.get('kind')
        if kind not in files.RULES:
            raise ValidationError({'kind': 'Jenis lampiran tidak sah.'})
        obj = files.target(kind, request.data.get('object_id'))
        files.check(request.user, 'upload', kind, obj)
        upload = request.FILES.get('file')
        if not upload:
            raise ValidationError({'file': 'Pilih fail untuk dimuat naik.'})
        content_type = files.validate_upload(kind, upload)
        doc_type = request.data.get('doc_type') or ''
        if kind == 'STAFF_DOC' and doc_type not in dict(Attachment.DOC_TYPES):
            raise ValidationError({'doc_type': 'Pilih jenis dokumen.'})
        with transaction.atomic():
            if files.RULES[kind].get('single'):
                # A new photo / signature / handout file replaces the old one
                for old in Attachment.objects.filter(kind=kind, object_id=obj.pk):
                    if kind == 'VOUCHER_SIGNATURE':
                        files.check(request.user, 'delete', kind, obj, old)
                    old.delete()
            attachment = Attachment.objects.create(
                kind=kind, object_id=obj.pk, file=upload, original_name=upload.name[:255],
                content_type=content_type, size=upload.size, doc_type=doc_type if kind == 'STAFF_DOC' else '',
                description=(request.data.get('description') or '').strip()[:255],
                uploaded_by=request.user, uploaded_by_name=display_name(request.user),
            )
            after_upload(attachment, obj)
        return Response(self.get_serializer(attachment).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        attachment = self.get_object()
        files.check(request.user, 'delete', attachment.kind, files.target(attachment.kind, attachment.object_id), attachment)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        attachment = self.get_object()
        files.check(request.user, 'view', attachment.kind, files.target(attachment.kind, attachment.object_id), attachment)
        inline = attachment.content_type in files.INLINE_TYPES
        response = FileResponse(attachment.file.open('rb'), content_type=attachment.content_type,
                                as_attachment=not inline, filename=attachment.original_name)
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'private, no-store'
        # Uploaded content never runs as a page on this site
        response['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; media-src 'self'; sandbox"
        return response
