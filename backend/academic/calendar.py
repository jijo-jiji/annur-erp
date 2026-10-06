"""Days the centre is closed. Class attendance and teacher attendance are not taken on them."""
from rest_framework.exceptions import ValidationError
from .models import ClosedDate


def closed_reason(on):
    """Why the centre is closed on `on`, or None."""
    return ClosedDate.objects.filter(date=on).values_list('reason', flat=True).first()


def require_open(on):
    reason = closed_reason(on)
    if reason:
        raise ValidationError({'detail': f'Pusat tutup pada {on:%d/%m/%Y} ({reason}). Kehadiran tidak boleh direkod.'})
