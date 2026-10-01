// Shared labels and helpers for the student screens


export const STATUS_META = {
  PENDING: { label: 'Menunggu Kelulusan', cls: 'bg-amber-100 text-amber-800' },
  ACTIVE: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-800' },
  ON_HOLD: { label: 'Ditangguh', cls: 'bg-blue-100 text-blue-800' },
  TERMINATED: { label: 'Tidak Aktif', cls: 'bg-slate-200 text-slate-700' },
  REJECTED: { label: 'Ditolak', cls: 'bg-rose-100 text-rose-800' },
};

export const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'G', 'TH'];

// Local date (toISOString would give yesterday's UTC date before 8am in Malaysia)
export const today = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function waLink(phone, text) {
  const digits = (phone || '').replace(/[^0-9]/g, '').replace(/^0/, '');
  return `https://wa.me/60${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function downloadCsv(filename, header, rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Same rule as the server (students/services.py monthly_fee): exact package, otherwise the
// nearest package's per-subject rate. Shown as an estimate; the invoice is raised on approval.
export function estimateMonthlyFee(pricingTiers, formLevel, subjectCount) {
  if (!subjectCount) return 0;
  const level = formLevel === 'S5' ? 'DARJAH_5' : formLevel === 'S6' ? 'DARJAH_6' : 'SECONDARY';
  const tiers = pricingTiers.filter((t) => t.level_category === level).sort((a, b) => a.subject_count - b.subject_count);
  if (!tiers.length) return 0;
  const exact = tiers.find((t) => t.subject_count === subjectCount);
  if (exact) return Number(exact.total_price);
  const nearest = subjectCount < tiers[0].subject_count ? tiers[0] : tiers[tiers.length - 1];
  return Number(nearest.price_per_subject) * subjectCount;
}
