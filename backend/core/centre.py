"""The centre's own details (name, address, phone, WhatsApp, TIN, bank account), kept in one place.

Management edits them in Settings. The login page, receipts, vouchers, payslips and the messages
sent to parents all read them from here. The public ones (name, address, phone, WhatsApp, email)
can be read without logging in because the login page and the parents' registration page need them;
the TIN and bank details are for logged-in staff only."""
import re
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import SettingEvent
from .permissions import MANAGEMENT, display_name, require_role


def _text(maximum, required=False, label=''):
    def clean(value):
        value = ' '.join(str(value or '').split())
        if required and not value:
            raise ValueError(f'{label} diperlukan.')
        if len(value) > maximum:
            raise ValueError(f'{label} terlalu panjang (paling banyak {maximum} aksara).')
        return value
    return clean


def _phone(value):
    value = ' '.join(str(value or '').split())
    if not re.fullmatch(r'[0-9+()\- ]{7,30}', value):
        raise ValueError('Nombor telefon tidak sah, cth. 013-983 8085.')
    return value


def _whatsapp(value):
    """Digits with the country code and no plus sign, which is what WhatsApp links need: 013-983 8085 becomes 60139838085."""
    digits = re.sub(r'\D', '', str(value or ''))
    if digits.startswith('0'):
        digits = '6' + digits
    if not 9 <= len(digits) <= 15:
        raise ValueError('Nombor WhatsApp tidak sah, cth. 013-983 8085.')
    return digits


def _email(value):
    value = str(value or '').strip()
    if value:
        try:
            validate_email(value)
        except DjangoValidationError:
            raise ValueError('Alamat e-mel tidak sah.')
    return value


def _tin(value):
    value = ' '.join(str(value or '').split()).upper()
    if value and not re.fullmatch(r'[A-Z0-9\- ]{1,30}', value):
        raise ValueError('No. TIN hanya huruf, nombor dan sengkang (paling banyak 30 aksara).')
    return value


def _account(value):
    value = ' '.join(str(value or '').split())
    if value and not re.fullmatch(r'[0-9\- ]{1,30}', value):
        raise ValueError('No. akaun hanya nombor dan sengkang (paling banyak 30 aksara).')
    return value


# field -> the setting that stores it, its label, the shown-without-login flag, a default and a checker
FIELDS = {
    'name': ('CENTER_NAME', 'Nama pusat', True, 'Pusat Tuisyen An Nur', _text(100, True, 'Nama pusat')),
    'branch': ('CENTER_BRANCH', 'Cawangan', True, 'Telipot', _text(60, False, 'Cawangan')),
    'address': ('CENTER_ADDRESS', 'Alamat', True, 'Tingkat 1 & 2, PT 105, Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan', _text(250, True, 'Alamat')),
    'phone': ('CENTER_PHONE', 'Telefon', True, '013-983 8085', _phone),
    'whatsapp': ('CENTER_WHATSAPP', 'WhatsApp', True, '60139838085', _whatsapp),
    'email': ('CENTER_EMAIL', 'E-mel', True, '', _email),
    'tin': ('CENTER_TIN', 'No. TIN', False, '', _tin),
    'bank_name': ('CENTER_BANK_NAME', 'Bank', False, '', _text(60, False, 'Nama bank')),
    'bank_account': ('CENTER_BANK_ACCOUNT', 'No. akaun bank', False, '', _account),
    'bank_holder': ('CENTER_BANK_HOLDER', 'Nama pemegang akaun', False, '', _text(100, False, 'Nama pemegang akaun')),
}


def profile(public_only=False):
    """The centre's details; anything not saved yet shows the default."""
    keys = {spec[0]: name for name, spec in FIELDS.items()}
    from business_config.models import BusinessSetting
    saved = {keys[k]: v for k, v in BusinessSetting.objects.filter(key__in=keys).values_list('key', 'value')}
    return {name: saved.get(name, spec[3]) for name, spec in FIELDS.items() if not public_only or spec[2]}


@transaction.atomic
def save(values, user):
    from business_config.models import BusinessSetting
    unknown = [k for k in values if k not in FIELDS]
    if unknown:
        raise ValidationError({k: 'Medan tidak dikenali.' for k in unknown})
    cleaned, errors = {}, {}
    for name, value in values.items():
        try:
            cleaned[name] = FIELDS[name][4](value)
        except ValueError as err:
            errors[name] = str(err)
    if errors:
        raise ValidationError(errors)
    current = profile()
    for name, value in cleaned.items():
        if value == current[name]:
            continue
        key, label = FIELDS[name][0], FIELDS[name][1]
        BusinessSetting.objects.update_or_create(key=key, defaults={'value': value, 'description': f'{label} pusat'})
        SettingEvent.objects.create(key=key, label=label, old_value=current[name], new_value=value, by_name=display_name(user))
    return profile()


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def centre_public(request):
    """What the login page and the parents' registration page show. No TIN or bank details."""
    return Response(profile(public_only=True))


@api_view(['GET', 'PUT'])
def centre_profile(request):
    """Every staff role reads the full profile (receipts and vouchers print the TIN); Management changes it."""
    if request.method == 'PUT':
        require_role(request, MANAGEMENT)
        return Response(save(request.data, request.user))
    return Response(profile())


@api_view(['GET'])
def centre_events(request):
    require_role(request, MANAGEMENT)
    return Response([{
        'id': e.id, 'at': e.at, 'label': e.label, 'old': e.old_value, 'new': e.new_value, 'by': e.by_name,
    } for e in SettingEvent.objects.all()[:40]])
