"""The exam grade scale (A+ from 90, A from 80, ...). Management edits it in Data induk > Gred & jalur markah;
a mark saved from then on gets its grade from the edited scale. Results already saved keep the grade they were given."""

CATEGORY = '13_mark_band'
# Used if the list is empty or has no grade starting at 0, so every mark always has a grade
DEFAULT = [(90, 'A+'), (80, 'A'), (70, 'A-'), (65, 'B+'), (60, 'B'), (55, 'C+'), (50, 'C'), (45, 'D'), (40, 'E'), (0, 'G')]


def scale():
    """(minimum mark, grade) pairs, highest first."""
    from business_config.models import DynamicMasterData
    pairs = []
    for item in DynamicMasterData.objects.filter(category=CATEGORY, status='APPROVED'):
        meta = item.meta_info if isinstance(item.meta_info, dict) else {}
        try:
            floor = float(meta.get('min'))
        except (TypeError, ValueError):
            continue
        if 0 <= floor <= 100:
            pairs.append((floor, item.code))
    pairs.sort(key=lambda p: -p[0])
    return pairs if pairs and pairs[-1][0] == 0 else DEFAULT


def grade_for(mark):
    return next(grade for floor, grade in scale() if mark >= floor)
