// A parent's date of birth is the only thing kept; the age shown is worked out from it each time.
const PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Whole years from a date of birth (YYYY-MM-DD) to a day (default today); null when there is no usable date
export function ageOn(dob, today = localToday()) {
  const born = PARTS.exec(dob || '');
  const on = PARTS.exec(today || '');
  if (!born || !on) return null;
  const [by, bm, bd] = born.slice(1).map(Number);
  const [ty, tm, td] = on.slice(1).map(Number);
  const years = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return years >= 0 ? years : null;
}

export function ageText(dob, today) {
  const years = ageOn(dob, today);
  return years === null ? '' : `${years} tahun`;
}
