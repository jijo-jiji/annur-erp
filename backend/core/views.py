from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from datetime import date
from . import accounts
from .analytics import build_dashboard, build_reports
from django.contrib.auth.models import User
from .permissions import APPROVER_ROLES, MANAGEMENT, get_role, display_name, require_role


class LoginThrottle(ScopedRateThrottle):
    scope = 'login'


def user_payload(user):
    return {
        'username': user.username,
        'full_name': display_name(user),
        'role': get_role(user),
        'must_change_password': accounts.must_change_password(user),
    }


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def auth_login(request):
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'detail': 'Nama pengguna atau kata laluan salah.'}, status=status.HTTP_400_BAD_REQUEST)
    if get_role(user) is None:
        return Response({'detail': 'Akaun ini belum diberikan peranan. Sila hubungi Management.'}, status=status.HTTP_403_FORBIDDEN)
    update_last_login(None, user)  # shown in Management's list of accounts
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': user_payload(user)})


@api_view(['POST'])
@throttle_classes([LoginThrottle])
def auth_change_password(request):
    """Anyone changes their own password; this also ends a temporary password set by Management."""
    user = request.user
    old, new = request.data.get('old_password') or '', request.data.get('new_password') or ''
    if not user.check_password(old):
        return Response({'old_password': ['Kata laluan semasa tidak betul.']}, status=status.HTTP_400_BAD_REQUEST)
    if new == old:
        return Response({'new_password': ['Kata laluan baharu mesti berbeza daripada yang lama.']}, status=status.HTTP_400_BAD_REQUEST)
    try:
        accounts.check_password(new, user)
    except ValidationError as err:
        return Response({'new_password': err.detail['password']}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(new)
    user.save()
    accounts.set_flag(user, False)
    Token.objects.filter(user=user).delete()  # other sessions end; this one gets a new token
    token = Token.objects.create(user=user)
    accounts.log(user, 'PASSWORD_CHANGED', '', user)
    return Response({'token': token.key, 'user': user_payload(user)})


@api_view(['GET'])
def auth_me(request):
    return Response(user_payload(request.user))


@api_view(['POST'])
def auth_logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
def dashboard_summary(request):
    return Response(build_dashboard(get_role(request.user), user=request.user))


@api_view(['GET'])
def reports_summary(request):
    require_role(request, *APPROVER_ROLES)
    try:
        year = int(request.query_params.get('year') or date.today().year)
    except ValueError:
        return Response({'detail': 'Tahun tidak sah.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(build_reports(year))


@api_view(['GET'])
def auth_users(request):
    """Login accounts, for Management to link staff records to them."""
    require_role(request, MANAGEMENT)
    return Response([{
        'id': u.id, 'username': u.username, 'full_name': display_name(u), 'role': get_role(u),
    } for u in User.objects.filter(is_active=True).order_by('username')])
