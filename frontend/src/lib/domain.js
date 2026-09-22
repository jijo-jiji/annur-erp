import { formShort, todayISO } from './format';
import { can } from './permissions';

export function nextNumber(existing, prefix, width) {
  const max = existing
    .filter((no) => no?.startsWith(prefix))
    .map((no) => Number(no.slice(prefix.length)) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

export function classLabel(c, subjects) {
  const subj = subjects?.find((s) => s.code === c.subject);
  return `${subj?.name ?? c.subject} ${formShort(c.form)} (${c.section})`;
}

export function classCode(c) {
  return `${c.form} ${c.subject} (${c.section}) ${c.teacher}`;
}

export function subjectsForForm(subjects, form) {
  const levels = form.startsWith('S')
    ? ['PRIMARY']
    : Number(form.slice(1)) >= 4
      ? ['UPPER_SEC', 'SECONDARY']
      : ['LOWER_SEC', 'SECONDARY'];
  return subjects.filter((s) => s.active && levels.includes(s.level));
}

export function tierCategory(form) {
  if (form === 'S5') return 'DARJAH_5';
  if (form === 'S6') return 'DARJAH_6';
  return 'SECONDARY';
}

export function minSubjects(form) {
  return form.startsWith('F') ? 4 : 1;
}

export function monthlyFee(form, count, tiers) {
  const category = tierCategory(form);
  if (category !== 'SECONDARY') {
    const tier = tiers.find((t) => t.category === category);
    return tier ? tier.rate * tier.count : 0;
  }
  if (count < 4) return 0;
  const exact = tiers.find((t) => t.category === 'SECONDARY' && t.count === count);
  if (exact) return exact.rate * exact.count;
  // More subjects than the largest package: charge at the lowest per-subject rate
  const rates = tiers.filter((t) => t.category === 'SECONDARY').map((t) => t.rate);
  return count * Math.min(...rates);
}

export function invoiceBalance(inv) {
  return Math.max(0, inv.total - inv.discount - inv.paid);
}

export function invoiceStatus(inv) {
  const bal = invoiceBalance(inv);
  if (bal === 0) return 'PAID';
  if (inv.paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

export function voucherTier(amount) {
  if (amount < 500) return 1;
  if (amount <= 3000) return 2;
  return 3;
}

// Which role may approve a pending voucher of this amount
export function voucherApprover(amount) {
  const tier = voucherTier(amount);
  return tier === 1 ? 'ADMIN' : tier === 2 ? 'SUPERVISOR' : 'MANAGEMENT';
}

export function canApproveVoucher(role, amount) {
  const tier = voucherTier(amount);
  return tier > 1 && can(role, `vouchers.approve.${tier}`);
}

// Weekday name used in the timetable (null on Sunday)
export function timetableDay(iso = todayISO()) {
  return ['', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'][new Date(`${iso}T00:00:00`).getDay()] || null;
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---- Students & families ------------------------------------------------------

export const familyKey = (s) => s.parent1?.phone;

export function preferredContact(s) {
  return s?.preferred === 2 && s.parent2?.phone ? s.parent2 : s?.parent1;
}

export function siblingsOf(student, students) {
  return students.filter((s) => s.id !== student.id && familyKey(s) === familyKey(student) && s.status !== 'TERMINATED');
}

const FORM_RANK = { F5: 7, F4: 6, F3: 5, F2: 4, F1: 3, S6: 2, S5: 1 };

// The sibling discount applies to every child except the eldest active one
export function isYoungerSibling(student, students) {
  const family = [student, ...siblingsOf(student, students)];
  if (family.length < 2) return false;
  const eldest = [...family].sort((a, b) => FORM_RANK[b.form] - FORM_RANK[a.form] || a.id.localeCompare(b.id))[0];
  return eldest.id !== student.id;
}

export function enrolledCounts(students) {
  const counts = {};
  for (const s of students) {
    if (s.status !== 'ACTIVE') continue;
    for (const id of s.classes) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

// ---- Invoices -----------------------------------------------------------------

export function discountAmount(rule, monthly) {
  return Math.round(rule.type === 'PERCENT' ? (monthly * rule.value) / 100 : rule.value);
}

export function discountsFor(student, students, rules, monthly) {
  const out = [];
  const sibling = rules.find((r) => r.id === 'SIBLING');
  if (sibling && isYoungerSibling(student, students)) out.push({ id: sibling.id, label: sibling.label, amount: discountAmount(sibling, monthly) });
  for (const id of student.discounts ?? []) {
    const rule = rules.find((r) => r.id === id);
    if (rule) out.push({ id, label: rule.label, amount: discountAmount(rule, monthly) });
  }
  return out;
}

export function buildInvoice({ no, student, students, month, tiers, settings, rules, withRegFee }) {
  const monthly = monthlyFee(student.form, student.classes.length, tiers);
  const discounts = discountsFor(student, students, rules, monthly);
  const regFee = withRegFee ? settings.regFee : 0;
  return {
    no,
    studentId: student.id,
    month,
    monthlyFee: monthly,
    regFee,
    discounts,
    discount: discounts.reduce((a, d) => a + d.amount, 0),
    total: monthly + regFee,
    paid: 0,
    dueDate: `${month}-${String(settings.dueDay).padStart(2, '0')}`,
    receipt: null,
  };
}

// Invoices past their due date that still have a balance
export function overdueInvoices(studentId, invoices, today = todayISO()) {
  return invoices
    .filter((i) => i.studentId === studentId && invoiceBalance(i) > 0 && i.dueDate < today)
    .sort((a, b) => a.month.localeCompare(b.month));
}

// Students who have reached the unpaid-months limit in the policy
export function arrearsCases(students, invoices, limit, today = todayISO()) {
  return students
    .filter((s) => s.status === 'ACTIVE' || s.status === 'SUSPENDED')
    .map((s) => {
      const overdue = overdueInvoices(s.id, invoices, today);
      return { student: s, overdue, months: new Set(overdue.map((i) => i.month)).size, amount: overdue.reduce((a, i) => a + invoiceBalance(i), 0) };
    })
    .filter((c) => c.months >= limit)
    .sort((a, b) => b.amount - a.amount);
}

// ---- Attendance & results -----------------------------------------------------

export function attendanceSummary(studentId, attendance, studentClasses) {
  let sessions = 0;
  let absent = 0;
  let late = 0;
  const absences = [];
  for (const rec of attendance) {
    if (!studentClasses.includes(rec.classId)) continue;
    if (rec.roster && !rec.roster.includes(studentId)) continue;
    sessions += 1;
    if (rec.absent.includes(studentId)) {
      absent += 1;
      absences.push(rec);
    } else if (rec.late.includes(studentId)) late += 1;
  }
  return { sessions, absent, late, rate: sessions ? Math.round(((sessions - absent) / sessions) * 100) : null, absences };
}

// SPM grading scale
const GRADES = [
  [90, 'A+'], [80, 'A'], [70, 'A-'], [65, 'B+'], [60, 'B'], [55, 'C+'], [50, 'C'], [45, 'D'], [40, 'E'], [0, 'G'],
];
export function grade(mark) {
  if (mark == null || mark === '') return '';
  return GRADES.find(([min]) => mark >= min)[1];
}
