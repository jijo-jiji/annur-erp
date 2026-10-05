from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from . import change_requests as service
from .models import ChangeRequest
from .permissions import APPROVER_ROLES, get_role, require_role


class ChangeRequestSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    action_label = serializers.CharField(source='get_action_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    changes = serializers.SerializerMethodField()
    mine = serializers.SerializerMethodField()

    class Meta:
        model = ChangeRequest
        fields = ('id', 'kind', 'kind_label', 'action', 'action_label', 'target_id', 'target_label', 'payload', 'before',
                  'changes', 'note', 'status', 'status_label', 'direct', 'requested_by_name', 'requested_at', 'decided_by',
                  'decided_at', 'decision_comment', 'seen', 'mine')
        read_only_fields = fields

    def get_changes(self, obj):
        return service.changes_of(obj)

    def get_mine(self, obj):
        request = self.context.get('request')
        return bool(request and obj.requested_by_id == request.user.id)


class ChangeRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """Propose, revise, withdraw, approve or reject changes to setup data.
    Supervisor / Management see every request; Admin sees only their own."""
    serializer_class = ChangeRequestSerializer
    queryset = ChangeRequest.objects.all()
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        if get_role(self.request.user) not in APPROVER_ROLES:
            qs = qs.filter(requested_by=self.request.user)
        p = self.request.query_params
        if p.get('kind'):
            qs = qs.filter(kind=p['kind'])
        if p.get('status'):
            qs = qs.filter(status__in=p['status'].split(','))
        if p.get('mine'):
            qs = qs.filter(requested_by=self.request.user)
        if p.get('unseen'):
            qs = qs.filter(requested_by=self.request.user, seen=False).exclude(status='PENDING')
        return qs

    def list(self, request, *args, **kwargs):
        try:
            limit = max(1, min(int(request.query_params.get('limit', 100)), 300))
        except ValueError:
            limit = 100
        return Response(self.get_serializer(self.filter_queryset(self.get_queryset())[:limit], many=True).data)

    def create(self, request, *args, **kwargs):
        d = request.data
        req = service.submit(request.user, d.get('kind'), d.get('action'), d.get('target_id'), d.get('payload'), d.get('note'))
        return Response(self.get_serializer(req).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        req = service.revise(self.get_object(), request.user, request.data.get('payload') or {}, request.data.get('note'))
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        return Response(self.get_serializer(service.approve(self.get_object(), request.user, request.data.get('comment'))).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        require_role(request, *APPROVER_ROLES)
        return Response(self.get_serializer(service.reject(self.get_object(), request.user, request.data.get('comment'))).data)

    @action(detail=True, methods=['post'])
    def withdraw(self, request, pk=None):
        return Response(self.get_serializer(service.withdraw(self.get_object(), request.user)).data)

    @action(detail=False, methods=['post'])
    def acknowledge(self, request):
        """The requester has read the decisions on their requests."""
        n = ChangeRequest.objects.filter(requested_by=request.user, seen=False).exclude(status='PENDING').update(seen=True)
        return Response({'acknowledged': n})
