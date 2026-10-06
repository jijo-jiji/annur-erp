"""Login accounts: Management creates them, sets the role, switches them off and resets passwords.

A password set by Management is temporary: the person must choose their own at first login.
The last Management account can never be removed or switched off, and nobody can change their
own role or switch themselves off, so the centre cannot lock itself out."""
import re
import secrets
import string
from django.contrib.auth import password_validation
from django.contrib.auth.models import Group, User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from .models import AccountEvent, AccountSecurity
from .permissions import ALL_ROLES, MANAGEMENT, ROLE_LABELS, display_name, get_role, require_role

USERNAME = re.compile(r'^[a-z0-9._]{3,30}$')
PASSWORD_MESSAGES = {
    'password_too_short': 'Kata laluan terlalu pendek: sekurang-kurangnya 10 aksara.',
    'password_too_common': 'Kata laluan ini terlalu mudah diteka.',
    'password_entirely_numeric': 'Kata laluan tidak boleh nombor sahaja.',
    'password_too_similar': 'Kata laluan terlalu serupa dengan nama pengguna atau nama.',
}


def generate_password():
    alphabet = string.ascii_letters + string.digits
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(12))
        if any(c.islower() for c in password) and any(c.isupper() for c in password) and any(c.isdigit() for c in password):
            return password


def check_password(password, user):
    """The same rules Django applies everywhere (length, common passwords, similarity to the name)."""
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as err:
        raise ValidationError({'password': [PASSWORD_MESSAGES.get(e.code, ' '.join(e.messages)) for e in err.error_list]})


def must_change_password(user):
    return AccountSecurity.objects.filter(user=user, must_change_password=True).exists()


def set_flag(user, value):
    AccountSecurity.objects.update_or_create(user=user, defaults={'must_change_password': value})


def log(user, action_code, detail, by):
    AccountEvent.objects.create(user=user, username=user.username, action=action_code, detail=detail, by_name=display_name(by) if by else '')


def set_role(user, role):
    user.groups.remove(*Group.objects.filter(name__in=ALL_ROLES))
    user.groups.add(Group.objects.get_or_create(name=role)[0])


def other_active_management(user):
    """Active accounts that can still act as Management if `user` is removed."""
    return any(get_role(u) == MANAGEMENT for u in User.objects.filter(is_active=True).exclude(pk=user.pk))


def payload(user, me):
    staff = getattr(user, 'staff_profile', None)
    return {
        'id': user.id, 'username': user.username, 'full_name': display_name(user), 'role': get_role(user),
        'is_active': user.is_active, 'is_superuser': user.is_superuser, 'is_self': user.pk == me.pk,
        'last_login': user.last_login, 'must_change_password': must_change_password(user),
        'staff': {'id': staff.id, 'staff_id': staff.staff_id, 'name': staff.name} if staff else None,
    }


class AccountViewSet(viewsets.ViewSet):
    """Management only. Accounts are switched off, never deleted, so history and records keep their names."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        require_role(request, MANAGEMENT)

    def list(self, request):
        users = User.objects.all().order_by('username')
        return Response([payload(u, request.user) for u in users])

    def _staff(self, value, user=None):
        from teachers.models import StaffMember
        staff = StaffMember.objects.filter(pk=value).first()
        if not staff:
            raise ValidationError({'staff': 'Staf tidak dijumpai.'})
        if staff.user_id and (user is None or staff.user_id != user.pk):
            raise ValidationError({'staff': 'Staf ini sudah mempunyai akaun.'})
        return staff

    @transaction.atomic
    def create(self, request):
        d = request.data
        username = str(d.get('username', '')).strip().lower()
        full_name = ' '.join(str(d.get('full_name', '')).split())
        role = d.get('role')
        errors = {}
        if not USERNAME.match(username):
            errors['username'] = 'Nama pengguna 3 hingga 30 aksara: huruf kecil, nombor, titik atau garis bawah.'
        elif User.objects.filter(username__iexact=username).exists():
            errors['username'] = 'Nama pengguna ini sudah digunakan.'
        if not full_name or len(full_name) > 150:
            errors['full_name'] = 'Nama penuh diperlukan.'
        if role not in ALL_ROLES:
            errors['role'] = 'Pilih peranan.'
        if errors:
            raise ValidationError(errors)
        staff = self._staff(d['staff']) if d.get('staff') else None

        typed = str(d.get('password') or '')
        password = typed or generate_password()
        user = User(username=username, first_name=full_name)
        check_password(password, user)
        user.set_password(password)
        user.save()
        set_role(user, role)
        set_flag(user, True)
        if staff:
            staff.user = user
            staff.save(update_fields=['user'])
        log(user, 'CREATED', f'{ROLE_LABELS[role]}' + (f', dipautkan kepada staf {staff.name}' if staff else ''), request.user)
        data = payload(user, request.user)
        if not typed:
            data['temporary_password'] = password  # shown once; Management gives it to the person
        return Response(data, status=201)

    @transaction.atomic
    def partial_update(self, request, pk=None):
        user = get_object_or_404(User, pk=pk)
        d = request.data
        if user.is_superuser:
            raise PermissionDenied('Akaun pentadbir sistem tidak boleh diubah di sini.')
        is_self = user.pk == request.user.pk
        current_role = get_role(user)
        was_management = current_role == MANAGEMENT and user.is_active

        new_role = d.get('role', current_role)
        if new_role not in ALL_ROLES:
            raise ValidationError({'role': 'Pilih peranan.'})
        new_active = d.get('is_active', user.is_active)
        if not isinstance(new_active, bool):
            raise ValidationError({'is_active': 'Status tidak sah.'})
        role_changes, active_changes = new_role != current_role, new_active != user.is_active
        if is_self and (role_changes or active_changes):
            raise ValidationError({'detail': 'Anda tidak boleh mengubah peranan atau menyahaktifkan akaun anda sendiri.'})
        if was_management and (role_changes or active_changes) and not other_active_management(user):
            raise ValidationError({'detail': 'Ini akaun Management yang terakhir. Sekurang-kurangnya satu akaun Management mesti kekal aktif.'})
        full_name = ' '.join(str(d['full_name']).split()) if 'full_name' in d else None
        if full_name is not None and (not full_name or len(full_name) > 150):
            raise ValidationError({'full_name': 'Nama penuh diperlukan.'})
        staff = None
        relink = 'staff' in d
        if relink and d['staff']:
            staff = self._staff(d['staff'], user)

        if full_name is not None and full_name != display_name(user):
            log(user, 'RENAMED', f'{display_name(user)} → {full_name}', request.user)
            user.first_name, user.last_name = full_name, ''
        if role_changes:
            set_role(user, new_role)
            log(user, 'ROLE_CHANGED', f'{ROLE_LABELS.get(current_role, "Tiada")} → {ROLE_LABELS[new_role]}', request.user)
        if active_changes:
            user.is_active = new_active
            log(user, 'REACTIVATED' if new_active else 'DEACTIVATED', '', request.user)
            if not new_active:
                Token.objects.filter(user=user).delete()  # signed out at once
        user.save()
        if relink:
            from teachers.models import StaffMember
            before = getattr(user, 'staff_profile', None)
            if (before.pk if before else None) != (staff.pk if staff else None):
                StaffMember.objects.filter(user=user).update(user=None)
                if staff:
                    staff.user = user
                    staff.save(update_fields=['user'])
                log(user, 'LINKED', f'Staf: {staff.name}' if staff else 'Pautan staf dibuang', request.user)
        user.refresh_from_db()
        return Response(payload(user, request.user))

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reset_password(self, request, pk=None):
        user = get_object_or_404(User, pk=pk)
        if user.is_superuser:
            raise PermissionDenied('Akaun pentadbir sistem tidak boleh diubah di sini.')
        if user.pk == request.user.pk:
            raise ValidationError({'detail': 'Gunakan "Tukar kata laluan" untuk akaun anda sendiri.'})
        typed = str(request.data.get('password') or '')
        password = typed or generate_password()
        check_password(password, user)
        user.set_password(password)
        user.save()
        set_flag(user, True)
        Token.objects.filter(user=user).delete()  # signed out everywhere
        log(user, 'PASSWORD_RESET', '', request.user)
        data = payload(user, request.user)
        if not typed:
            data['temporary_password'] = password
        return Response(data)

    @action(detail=False, methods=['get'])
    def events(self, request):
        return Response([{
            'id': e.id, 'at': e.at, 'username': e.username, 'action': e.action, 'action_label': e.get_action_display(),
            'detail': e.detail, 'by': e.by_name,
        } for e in AccountEvent.objects.all()[:60]])
