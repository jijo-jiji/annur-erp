"""Rate limits for the public pages (no login): the parents' QR registration form, the parents' results form and the
teacher's private link, and QR check-in. Each limits a visitor's address (settings REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']).

DRF's ScopedRateThrottle, used here before, takes its scope from the view; these are function views, which have none,
so it never limited anything. The scope is set on each class instead."""
from rest_framework.throttling import SimpleRateThrottle


class PublicFormThrottle(SimpleRateThrottle):
    scope = None

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class PublicRegisterThrottle(PublicFormThrottle):
    scope = 'public_register'


class PublicResultsThrottle(PublicFormThrottle):
    scope = 'public_results'


class PublicTeacherThrottle(PublicFormThrottle):
    scope = 'public_teacher'


class PublicCheckInThrottle(PublicFormThrottle):
    scope = 'public_checkin'
