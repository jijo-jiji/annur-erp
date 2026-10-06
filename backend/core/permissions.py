from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission, SAFE_METHODS

# User roles from j-status.doc (Admin 1 & Admin 2 share the ADMIN role)
ADMIN = 'ADMIN'
SUPERVISOR = 'SUPERVISOR'
MANAGEMENT = 'MANAGEMENT'
ALL_ROLES = (ADMIN, SUPERVISOR, MANAGEMENT)
APPROVER_ROLES = (SUPERVISOR, MANAGEMENT)

ROLE_LABELS = {
    ADMIN: 'Admin',
    SUPERVISOR: 'Supervisor',
    MANAGEMENT: 'Management',
}


def get_role(user):
    """Role comes from Django group membership; the highest role wins."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return MANAGEMENT
    names = set(user.groups.values_list('name', flat=True))
    for role in (MANAGEMENT, SUPERVISOR, ADMIN):
        if role in names:
            return role
    return None


def display_name(user):
    full = user.get_full_name().strip()
    return full or user.username


def require_role(request, *roles):
    if get_role(request.user) not in roles:
        allowed = ' / '.join(ROLE_LABELS[r] for r in roles)
        raise PermissionDenied(f"Tindakan ini hanya untuk {allowed}.")


class RolePermission(BasePermission):
    """
    Default permission for every API view.
    - Must be logged in with one of the three roles.
    - Reads are limited to `view.read_roles` (default: all roles).
    - Writes are limited to `view.write_roles` (default: all roles).
    - Deletes are limited to `view.delete_roles` (default: Supervisor & Management).
    Custom approve/reject actions check their own roles with `require_role`.
    """
    message = 'Anda tidak mempunyai kebenaran untuk tindakan ini.'
    # A password set by Management is temporary: until it is changed, only these calls work
    PASSWORD_CHANGE_PATHS = ('/api/v1/auth/me/', '/api/v1/auth/logout/', '/api/v1/auth/change-password/')

    def has_permission(self, request, view):
        role = get_role(request.user)
        if role is None:
            return False
        if request.path not in self.PASSWORD_CHANGE_PATHS:
            from .accounts import must_change_password
            if must_change_password(request.user):
                raise PermissionDenied('Sila tukar kata laluan sementara anda dahulu.')
        if request.method in SAFE_METHODS:
            return role in getattr(view, 'read_roles', ALL_ROLES)
        if request.method == 'DELETE':
            return role in getattr(view, 'delete_roles', APPROVER_ROLES)
        return role in getattr(view, 'write_roles', ALL_ROLES)
