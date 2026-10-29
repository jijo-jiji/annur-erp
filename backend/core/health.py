"""The hosting platform's health check (Render asks for /healthz before it sends visitors to a new version)."""
from django.http import HttpResponse


class HealthCheckMiddleware:
    """Answer /healthz before anything else looks at the request.

    The platform calls it by an internal address, which is not in ALLOWED_HOSTS and arrives over plain HTTP, so
    without this the check would be refused (400) or redirected to HTTPS and the new version would never go live.
    It reads no data, so it also answers while the database is waking up."""
    PATH = '/healthz'

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == self.PATH:
            return HttpResponse('ok', content_type='text/plain')
        return self.get_response(request)
