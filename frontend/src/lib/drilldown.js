// Opening the list behind a figure. A link carries the filter in the address (and the number the figure showed, so
// the list can say whether it agrees): `#/students?status=ACTIVE&form=F5&from=ringkasan&expect=12`.
// The server decides which students match (students/drilldown.py), so the figure and its list cannot differ.
import { date, formLabel, monthLabel } from './format';

export const STUDENT_FILTERS = ['status', 'type', 'form', 'school_category', 'joined', 'left', 'as_at', 'stay', 'uninvoiced'];

// Where the person came from, for the "Dari ..." bar and the way back
const SOURCES = {
  ringkasan: { label: 'Ringkasan', href: '#/dashboard' },
  laporan: { label: 'Laporan', href: '#/reports' },
};
export const drillSource = (from) => SOURCES[from] ?? SOURCES.ringkasan;

const STATUS = { ACTIVE: 'Aktif', ON_HOLD: 'Ditangguh', INACTIVE: 'Tidak aktif', REGISTERED: 'Berdaftar', PENDING: 'Menunggu kelulusan' };
const TYPE = { MONTHLY: 'Bulanan', WALK_IN: 'Walk-in' };
const STAY = { lt3: '< 3 bulan', '3to6': '3 - 6 bulan', '6to12': '6 - 12 bulan', '1to2': '1 - 2 tahun', gt2: '> 2 tahun' };

// `#/students?...` for a figure. `expect` is the number the figure shows.
export function studentsHref(filters, { from = 'ringkasan', expect } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  params.set('from', from);
  if (expect !== undefined && expect !== null) params.set('expect', String(expect));
  return `#/students?${params}`;
}

// The student filters in the current address, or null when the list is opened plainly
export function readStudentDrill() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const filters = Object.fromEntries(STUDENT_FILTERS.filter((k) => params.get(k)).map((k) => [k, params.get(k)]));
  if (!Object.keys(filters).length) return null;
  const expect = params.get('expect');
  return { filters, from: params.get('from') || 'ringkasan', expect: expect === null ? null : Number(expect), key: JSON.stringify(filters) };
}

// The filters in words, one chip each
export function describeStudentFilters(f) {
  const chips = [];
  if (f.status) chips.push(STATUS[f.status] ?? f.status);
  if (f.type) chips.push(TYPE[f.type] ?? f.type);
  if (f.form) chips.push(formLabel(f.form));
  if (f.school_category) chips.push(f.school_category === 'NONE' ? 'Sekolah tanpa kategori' : `Sekolah ${f.school_category}`);
  if (f.joined) chips.push(`Daftar ${monthLabel(f.joined)}`);
  if (f.left) chips.push(`Berhenti ${monthLabel(f.left)}`);
  if (f.as_at) chips.push(`Pada ${date(f.as_at)}`);
  if (f.stay) chips.push(`Tempoh belajar ${STAY[f.stay] ?? f.stay}`);
  if (f.uninvoiced) chips.push(`Belum ada invois ${monthLabel(f.uninvoiced)}`);
  return chips;
}

// The last day of a month, as YYYY-MM-DD
export function monthEnd(year, month) {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
