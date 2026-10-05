// Grade (form) list: starts with the standard grades and is replaced by the master-data list
// once loaded (see store.jsx). Highest grade first, as drop-downs show it.
export const FORMS = [
  { id: 'F5', label: 'Tingkatan 5' },
  { id: 'F4', label: 'Tingkatan 4' },
  { id: 'F3', label: 'Tingkatan 3' },
  { id: 'F2', label: 'Tingkatan 2' },
  { id: 'F1', label: 'Tingkatan 1' },
  { id: 'S6', label: 'Darjah 6' },
  { id: 'S5', label: 'Darjah 5' },
];

export function setForms(grades) {
  if (!grades?.length) return;
  FORMS.splice(0, FORMS.length, ...[...grades].reverse().map((g) => ({ id: g.code, label: g.label, next: g.next, level: g.level })));
}

const MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

export const DAY_LABEL = {
  JUMAAT: 'Jumaat', SABTU: 'Sabtu', ISNIN: 'Isnin', SELASA: 'Selasa', RABU: 'Rabu', KHAMIS: 'Khamis',
};

export const ROLE_LABEL = {
  ADMIN: 'Admin Kaunter',
  SUPERVISOR: 'Supervisor',
  MANAGEMENT: 'Pengurusan',
};

export const STUDENT_STATUS = {
  PENDING: { label: 'Menunggu kelulusan', tone: 'blue' },
  ACTIVE: { label: 'Aktif', tone: 'green' },
  ON_HOLD: { label: 'Ditangguh', tone: 'amber' },
  TERMINATED: { label: 'Berhenti', tone: 'neutral' },
  REJECTED: { label: 'Ditolak', tone: 'red' },
};

export const STREAM_LABEL = { SAINS: 'Sains', SASTERA: 'Sastera / Akaun', GENERAL: 'Umum', TERAS: 'Teras' };

export const LEVEL_LABEL = {
  UPPER_SEC: 'Menengah atas (T4–T5)',
  LOWER_SEC: 'Menengah rendah (T1–T3)',
  SECONDARY: 'Menengah (T1–T5)',
  PRIMARY: 'Rendah (D5–D6)',
};

const TIER_GROUP_DEFAULT = {
  SECONDARY: 'Sekolah menengah',
  DARJAH_5: 'Darjah 5',
  DARJAH_6: 'Darjah 6',
  WALK_IN: 'Walk-in',
};
// Management names the groups they add; the seeded ones have a built-in name
export const tierGroupLabel = (group, tiers = []) =>
  tiers.find((t) => t.category === group && t.label)?.label || TIER_GROUP_DEFAULT[group] || group;

export const PAYMENT_METHOD_LABEL = {
  CASH: 'Tunai',
  DUITNOW_QR: 'DuitNow QR',
  ONLINE_BANKING: 'Perbankan dalam talian (FPX)',
  CARD: 'Kad debit / kredit',
};

export const PAYMENT_TYPE_LABEL = {
  MONTHLY: 'Yuran bulanan',
  REG_FEE: 'Yuran pendaftaran',
  SEMINAR: 'Seminar',
  OUTSTANDING: 'Tunggakan',
};

export const RESCHEDULE_REASON_LABEL = {
  PH: 'Cuti umum',
  MARKING_PAPER: 'Guru menanda kertas',
  TIME_MISTAKE: 'Pembetulan jadual',
  EMERGENCY_LEAVE: 'Guru cuti / kecemasan',
  EXTRA_SESSION: 'Kelas tambahan',
  OTHER: 'Lain-lain',
};

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

// Today's date in local time (toISOString would give yesterday's UTC date before 8am in Malaysia)
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const CURRENT_MONTH = todayISO().slice(0, 7);

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
  return (name || '?')
    .replace(/\b(bin|binti|bt|b\.)\b/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
