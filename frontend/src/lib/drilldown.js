// Opening the list behind a figure. A link carries the filter in the address, plus where it came from (`src`) and the
// number the figure showed (`expect`, with `unit` saying which total of the list it should equal), for example
// `#/students?status=ACTIVE&form=F5&src=ringkasan&expect=12`. The server decides which rows match
// (students/drilldown.py, billing/drilldown.py, expenses/drilldown.py, academic/drilldown.py), so a figure and its
// list cannot differ.
import { useEffect, useState } from 'react';
import { date, formLabel, monthLabel } from './format';

// The filters each list understands
export const STUDENT_FILTERS = ['status', 'type', 'form', 'school_category', 'joined', 'left', 'as_at', 'stay', 'uninvoiced', 'subject'];
export const INVOICE_FILTERS = ['status', 'month'];
export const RECEIPT_FILTERS = ['month', 'from', 'to'];
export const VOUCHER_FILTERS = ['status', 'month', 'from', 'to', 'category'];
export const CLASS_FILTERS = ['capacity', 'subject', 'form', 'id'];

// Where the person came from, for the "Dari ..." bar and the way back
const SOURCES = {
  ringkasan: { label: 'Ringkasan', href: '#/dashboard' },
  laporan: { label: 'Laporan', href: '#/reports' },
};
export const drillSource = (src) => SOURCES[src] ?? SOURCES.ringkasan;

// ---- addresses ---------------------------------------------------------------

// `unit`: which number the list reports must equal `expect`: count (default), total (receipts, vouchers), balance or billed (invoices)
function href(route, filters, { src = 'ringkasan', expect, unit = 'count', extra = {} } = {}) {
  const params = new URLSearchParams(Object.entries({ ...extra, ...filters }).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  params.set('src', src);
  if (expect !== undefined && expect !== null) {
    params.set('expect', String(expect));
    if (unit !== 'count') params.set('unit', unit);
  }
  return `#/${route}?${params}`;
}
export const studentsHref = (filters, opts) => href('students', filters, opts);
export const invoicesHref = (filters, opts) => href('billing', filters, { ...opts, extra: { tab: 'invoices' } });
export const receiptsHref = (filters, opts) => href('billing', filters, { ...opts, extra: { tab: 'receipts' } });
export const vouchersHref = (filters, opts) => href('vouchers', filters, opts);
export const classesHref = (filters, opts) => href('timetable', filters, opts);
// One voucher, opened on its own
export const voucherHref = (pvNumber, opts) => href('vouchers', {}, { ...opts, extra: { open: pvNumber } });

// ---- reading them ------------------------------------------------------------

// The filters in the current address that belong to this list, or null when the list is opened plainly
export function readDrill(keys) {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const filters = Object.fromEntries(keys.filter((k) => params.get(k)).map((k) => [k, params.get(k)]));
  if (!Object.keys(filters).length) return null;
  const expect = params.get('expect');
  return {
    filters, src: params.get('src') || 'ringkasan', expect: expect === null ? null : Number(expect), unit: params.get('unit') || 'count',
    key: JSON.stringify(filters),
  };
}

// The filter of a list opened from a figure, following the address (back, "Buang penapis", another figure)
export function useDrill(keys) {
  const id = keys.join(',');
  const [drill, setDrill] = useState(() => readDrill(keys));
  useEffect(() => {
    const update = () => setDrill(readDrill(keys));
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return drill;
}

// Asks the server which rows match a drill filter: { count, ids, ...totals }, or null while the answer is on its way.
// `fetcher` is a function of the filters returning that answer.
export function useMatching(drill, fetcher) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!drill) return undefined;
    let current = true;
    fetcher(drill.filters)
      .then((res) => { if (current) setResult({ key: drill.key, ...res, ids: new Set(res.ids) }); })
      .catch(() => { if (current) setResult({ key: drill.key, count: 0, ids: new Set() }); });
    return () => { current = false; };
  }, [drill]); // eslint-disable-line react-hooks/exhaustive-deps
  return drill && result?.key === drill.key ? result : null;
}

// ---- in words ----------------------------------------------------------------

const STUDENT_STATUS = { ACTIVE: 'Aktif', ON_HOLD: 'Ditangguh', INACTIVE: 'Tidak aktif', REGISTERED: 'Berdaftar', PENDING: 'Menunggu kelulusan' };
const TYPE = { MONTHLY: 'Bulanan', WALK_IN: 'Walk-in' };
const STAY = { lt3: '< 3 bulan', '3to6': '3 - 6 bulan', '6to12': '6 - 12 bulan', '1to2': '1 - 2 tahun', gt2: '> 2 tahun' };
const INVOICE_STATUS = { UNPAID: 'Belum bayar', PARTIAL: 'Sebahagian', PAID: 'Selesai bayar', OVERDUE: 'Tertunggak', OUTSTANDING: 'Belum selesai' };
const VOUCHER_STATUS = {
  VERIFIED_ADMIN: 'Disahkan kaunter', PENDING_SUPERVISOR: 'Menunggu supervisor', PENDING_MANAGEMENT: 'Menunggu pengurusan',
  APPROVED_SUPERVISOR: 'Diluluskan supervisor', APPROVED_MANAGEMENT: 'Diluluskan pengurusan', REJECTED: 'Ditolak',
  PENDING: 'Menunggu kelulusan', COUNTED: 'Dikira sebagai perbelanjaan',
};
const CAPACITY = { over: 'Melebihi had kerusi', full: 'Penuh', near: 'Hampir penuh' };

const period = (f) => {
  if (f.month) return `${monthLabel(f.month)}`;
  if (f.from && f.to) return f.from === f.to ? date(f.from) : `${date(f.from)} hingga ${date(f.to)}`;
  if (f.from) return `Dari ${date(f.from)}`;
  if (f.to) return `Hingga ${date(f.to)}`;
  return null;
};

// One chip per filter. `names` resolves codes the screen knows (subject names).
export function describeStudentFilters(f, names = {}) {
  const chips = [];
  if (f.status) chips.push(STUDENT_STATUS[f.status] ?? f.status);
  if (f.type) chips.push(TYPE[f.type] ?? f.type);
  if (f.form) chips.push(formLabel(f.form));
  if (f.subject) chips.push(names.subject?.(f.subject) ?? f.subject);
  if (f.school_category) chips.push(f.school_category === 'NONE' ? 'Sekolah tanpa kategori' : `Sekolah ${f.school_category}`);
  if (f.joined) chips.push(`Daftar ${monthLabel(f.joined)}`);
  if (f.left) chips.push(`Berhenti ${monthLabel(f.left)}`);
  if (f.as_at) chips.push(`Pada ${date(f.as_at)}`);
  if (f.stay) chips.push(`Tempoh belajar ${STAY[f.stay] ?? f.stay}`);
  if (f.uninvoiced) chips.push(`Belum ada invois ${monthLabel(f.uninvoiced)}`);
  return chips;
}

export function describeInvoiceFilters(f) {
  return [f.status && (INVOICE_STATUS[f.status] ?? f.status), f.month && `Dibilkan ${monthLabel(f.month)}`].filter(Boolean);
}

export function describeReceiptFilters(f) {
  const when = period(f);
  return when ? [`Dibayar ${when}`] : [];
}

export function describeVoucherFilters(f) {
  return [f.status && (VOUCHER_STATUS[f.status] ?? f.status), period(f), f.category].filter(Boolean);
}

export function describeClassFilters(f, names = {}) {
  const chips = [];
  if (f.id) chips.push('Satu kelas');
  if (f.capacity) chips.push(CAPACITY[f.capacity] ?? f.capacity);
  if (f.form) chips.push(formLabel(f.form));
  if (f.subject) chips.push(names.subject?.(f.subject) ?? f.subject);
  return chips;
}

// The last day of a month, as YYYY-MM-DD
export function monthEnd(year, month) {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
