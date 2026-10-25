"""The one way a telephone number is kept and shown in this system.

Stored: digits only, with the country code and no plus sign, for example 60133474009. A number from another country keeps its
plus sign (+6581234567): without it, it could not be told from a Malaysian number that lost its leading 0. WhatsApp links,
duplicate checks and search all depend on this one form, so every phone field is cleaned to it when it is saved.

Typed: staff may type or paste a number in any common style (013-347 4009, +6013-347 4009, 0133474009, 133474009 with the
leading 0 that Excel drops) and it is cleaned when they leave the box. What the box shows for a saved number is a setting
(PHONE_INPUT).

Shown: how a saved number reads on screens, printouts and exports is also a setting (PHONE_PREFIX, PHONE_SEPARATOR); the
default is +6013-347-4009. Changing a setting changes how numbers look; the stored numbers are never rewritten.

The browser has the same rules (frontend/src/lib/phone.js); both read core/phone_cases.json in their tests, so they cannot
drift apart."""
import re
from rest_framework import serializers

PREFIXES = {'plus60': '+60', '60': '60', '0': '0'}
SEPARATORS = {'dash': '-', 'space': ' ', 'none': ''}
INPUT_STYLES = ('60', '0', 'plus60')
TOLL_FREE = ('1300', '1700', '1800')  # dialled inside Malaysia only: not a number with a country code

HELP = 'Nombor telefon tidak sah. Contoh: 60133474009 atau 013-347 4009.'


def _valid_national(national):
    """A Malaysian number without the country code and without the leading 0."""
    if not national.isdigit():
        return False
    if national[0] == '1':  # mobile: 13 347 4009 (9 digits), 11 2345 6789 (10 digits)
        return len(national) in (9, 10) and not (len(national) == 10 and national.startswith(TOLL_FREE))
    if national[0] in '3456789':  # landline: 9 7441234 (8 digits), 3 2123 4567 (9 digits)
        return len(national) in (8, 9)
    return False


def normalize(raw):
    """The stored form of a number: '60133474009'. '' for an empty value, None when the text is not one number we understand."""
    text = str(raw if raw is not None else '').strip()
    if not text:
        return ''
    if re.search(r'[A-Za-z/;,]', text):  # two numbers, a note, an extension: not one number
        return None
    digits = re.sub(r'\D', '', text)
    if not digits:
        return None
    international = text.startswith('+') or text.startswith('(+')
    if text.startswith('00'):
        international, digits = True, digits[2:]
    if digits.startswith('60') and (international or len(digits) >= 10):
        return digits if _valid_national(digits[2:]) else None
    if international:  # another country: kept with its plus sign, as it was given
        return f'+{digits}' if 8 <= len(digits) <= 15 else None
    if digits.startswith('0'):  # 013-347 4009
        national = digits[1:]
        return '60' + national if _valid_national(national) else None
    # the leading 0 was lost on the way (Excel does this to every number)
    return '60' + digits if _valid_national(digits) else None


def _groups(national):
    head = 2 if national[0] in '18' else 1  # 13 / 11 mobile and 82-89 Sarawak and Sabah; 3-7 and 9 for the other landlines
    rest = national[head:]
    cuts = {8: (4, 4), 7: (3, 4), 6: (3, 3)}.get(len(rest))
    return [national[:head], *([rest[:cuts[0]], rest[cuts[0]:]] if cuts else [rest])]


def display(value, prefix='plus60', separator='dash'):
    """How a number reads. A number saved before this rule (013-347 4009) reads the same as a cleaned one; text that is not one number
    we understand (a toll-free number, a note) is shown as it is."""
    stored = normalize(value)
    if not stored:
        return str(value or '')
    if stored.startswith('+'):
        return stored  # another country: shown whole
    head, *rest = _groups(stored[2:])
    sep = SEPARATORS.get(separator, '-')
    return sep.join([PREFIXES.get(prefix, '+60') + head, *rest])


def to_input(value, style='60'):
    """What the box shows for a stored number: 60133474009, 0133474009 or +60133474009. Text being typed is left as it is."""
    value = str(value or '')
    if not value or normalize(value) != value or value.startswith('+'):
        return value  # text being typed, or a number from another country (which keeps its plus sign)
    if style == '0':
        return '0' + value[2:]
    return '+' + value if style == 'plus60' else value


def shown(value):
    """`display` with the centre's settings."""
    from . import thresholds
    current = thresholds.values()
    return display(value, current['phone_prefix'], current['phone_separator'])


def clean_for_save(value, current=None):
    """For serializers: the stored form of a typed value. A value that was already saved and is not changed passes through,
    so an old entry nobody can convert (a toll-free number, a note) does not block saving the rest of the record."""
    if value in (None, ''):
        return value
    cleaned = normalize(value)
    if cleaned is None:
        if current is not None and str(value).strip() == str(current).strip():
            return value
        raise serializers.ValidationError(HELP)
    return cleaned


class PhoneFieldsMixin:
    """Serializer mixin: every field named in `phone_fields` is saved in the stored form (see above)."""
    phone_fields = ()

    def to_internal_value(self, data):
        attrs = super().to_internal_value(data)
        errors = {}
        for name in self.phone_fields:
            if name not in attrs:
                continue
            try:
                attrs[name] = clean_for_save(attrs[name], getattr(self.instance, name, None) if self.instance is not None else None)
            except serializers.ValidationError as err:
                errors[name] = err.detail
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
