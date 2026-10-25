"""Drop-down lists for suppliers and subjects, kept in Data induk so the centre can add or rename choices itself.

Defaults are loaded by the migration that introduced them and by `seed_data`; after that the centre owns them.
- Supply types: what a supplier provides. `meta_info.cat` is the expense category a new voucher to that
  supplier starts with (the person can still change it).
- Subject categories: how subjects are grouped on the registration forms. `meta_info.order` sets the order."""

SUPPLY_TYPE_CATEGORY = '25_supply_type'
SUBJECT_CATEGORY = '26_subject_category'

# (code, label, expense category it suggests)
SUPPLY_TYPE_DEFAULTS = [
    ('ALAT_TULIS', 'Alat tulis', 'ALAT_TULIS'),
    ('PERCETAKAN', 'Percetakan', 'ALAT_TULIS'),
    ('PAIP', 'Paip / plumbing', 'SELENGGARA'),
    ('ELEKTRIK', 'Elektrik & pendawaian', 'SELENGGARA'),
    ('PENYELENGGARAAN', 'Penyelenggaraan & aircond', 'SELENGGARA'),
    ('UTILITI', 'Utiliti', 'UTILITI'),
    ('MAKANAN', 'Makanan & jamuan', 'JAMUAN'),
    ('LAIN', 'Lain-lain', ''),
]

SUBJECT_CATEGORY_DEFAULTS = [
    ('TERAS', 'Teras'),
    ('SAINS', 'Sains'),
    ('SASTERA', 'Sastera / Akaun'),
    ('ELEKTIF', 'Elektif'),
]


def default_subject_category(stream):
    """A subject's category before anyone sets it: its stream when that is one of the defaults."""
    return stream if stream in ('TERAS', 'SAINS', 'SASTERA') else 'TERAS'
