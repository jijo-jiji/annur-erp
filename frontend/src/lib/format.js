import { DEMO_TODAY, FORMS } from '../data/demo';

const MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

export const DAY_LABEL = {
  JUMAAT: 'Jumaat', SABTU: 'Sabtu', ISNIN: 'Isnin', SELASA: 'Selasa', RABU: 'Rabu', KHAMIS: 'Khamis',
};

export const ROLE_LABEL = {
  ADMIN: 'Admin Kaunter',
  SUPERVISOR: 'Supervisor Akademik',
  MANAGEMENT: 'Pengurusan',
  TEACHER: 'Guru',
  PARENT: 'Ibu Bapa / Pelajar',
};

export const STUDENT_STATUS = {
  ACTIVE: { label: 'Aktif', tone: 'green' },
  SUSPENDED: { label: 'Digantung', tone: 'amber' },
  TERMINATED: { label: 'Berhenti', tone: 'neutral' },
};

export const STREAM_LABEL = { SAINS: 'Sains', SASTERA: 'Sastera / Akaun', GENERAL: 'Umum', TERAS: 'Teras' };

export const LEVEL_LABEL = {
  UPPER_SEC: 'Menengah atas (T4–T5)',
  LOWER_SEC: 'Menengah rendah (T1–T3)',
  SECONDARY: 'Menengah (T1–T5)',
  PRIMARY: 'Rendah (D5–D6)',
};

export const TIER_CATEGORY_LABEL = {
  SECONDARY: 'Sekolah menengah',
  DARJAH_5: 'Darjah 5',
  DARJAH_6: 'Darjah 6',
};

export const PAYMENT_METHOD_LABEL = {
  CASH: 'Tunai',
  DUITNOW_QR: 'DuitNow QR',
  FPX: 'Perbankan dalam talian (FPX)',
  CARD: 'Kad debit / kredit',
  ONLINE: 'Bayaran dalam talian',
};

export const RESCHEDULE_REASON_LABEL = {
  PH: 'Cuti umum',
  MARKING: 'Guru menanda kertas',
  TIME: 'Pembetulan jadual',
  LEAVE: 'Guru cuti / kecemasan',
  EXTRA: 'Kelas tambahan',
  OTHER: 'Lain-lain',
};

export const CHECKLIST = [
  { key: 'L', label: 'Ledger' },
  { key: 'TEL', label: 'Kumpulan WhatsApp' },
  { key: 'SP', label: 'Senarai pelajar' },
  { key: 'AT', label: 'Kedatangan' },
  { key: 'SY', label: 'Sistem yuran' },
];

export function formLabel(id) {
  return FORMS.find((f) => f.id === id)?.label ?? id;
}

export function formShort(id) {
  if (!id) return '';
  return id.startsWith('F') ? `T${id.slice(1)}` : `D${id.slice(1)}`;
}

export function rm(value) {
  const n = Number(value) || 0;
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function dateLong(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  const day = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'][d.getDay()];
  return `${day}, ${date(iso)}`;
}

export function monthShort(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

export function date(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

export function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function time(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}.${String(m).padStart(2, '0')}`;
}

export function timeRange(start, end) {
  const [h] = end.split(':').map(Number);
  const period = h < 12 ? 'pg' : h < 19 ? 'ptg' : 'mlm';
  return `${time(start)}–${time(end)} ${period}`;
}

// Demo mode: the app runs on a fixed date (see DEMO_TODAY)
export function todayISO() {
  return DEMO_TODAY;
}

// Malaysian mobile number -> wa.me international format (012-345 6789 -> 60123456789)
export function waNumber(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('60') ? digits : `6${digits}`;
}

export function waLink(phone, text) {
  const num = waNumber(phone);
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${num}${q}`;
}

export function initials(name) {
  return name
    .replace(/\b(bin|binti|bt|b\.)\b/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
