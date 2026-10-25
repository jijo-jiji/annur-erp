"""The bell (Phase E): a person's own notifications, newest first, and marking them read. See core/notify.py for who
is told about what."""
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Notification

SHOWN = 40


def _row(n):
    return {'id': n.id, 'kind': n.kind, 'title': n.title, 'body': n.body, 'link': n.link,
            'created_at': timezone.localtime(n.created_at), 'read': n.read_at is not None}


@api_view(['GET'])
def notifications(request):
    """{unread, items}: the newest notifications of the person asking; only theirs."""
    mine = Notification.objects.filter(user=request.user)
    return Response({'unread': mine.filter(read_at=None).count(), 'items': [_row(n) for n in mine[:SHOWN]]})


@api_view(['POST'])
def notifications_read(request):
    """{ids: [...]} marks those as read, {all: true} marks every one."""
    mine = Notification.objects.filter(user=request.user, read_at=None)
    if not request.data.get('all'):
        mine = mine.filter(id__in=[i for i in (request.data.get('ids') or []) if str(i).isdigit()])
    marked = mine.update(read_at=timezone.now())
    return Response({'marked': marked, 'unread': Notification.objects.filter(user=request.user, read_at=None).count()})
