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

// Subjects a grade can take: those with at least one class opened for that grade
export function subjectsForForm(subjects, form, classes = []) {
  const offered = new Set(classes.filter((c) => c.form === form).map((c) => c.subject));
  return subjects.filter((s) => s.active && offered.has(s.code));
}

// Fee package group of a grade, chosen in master data (grade list); empty when none has been set yet
export function feeGroup(form, grades = []) {
  return grades.find((g) => g.code === form)?.fee_group || '';
}

// Smallest package of the grade's group; fewer subjects is a special case charged per subject.
// A group with a single package has no minimum.
export function minSubjects(form, tiers = [], grades = []) {
  const counts = tiers.filter((t) => t.category === feeGroup(form, grades)).map((t) => t.count).sort((a, b) => a - b);
  return counts.length > 1 ? counts[0] : 1;
}

// Same rule as the server: the exact package, otherwise the nearest package's per-subject rate
export function monthlyFee(form, count, tiers = [], grades = []) {
  if (count <= 0) return 0;
  const packages = tiers.filter((t) => t.category === feeGroup(form, grades)).sort((a, b) => a.count - b.count);
  if (!packages.length) return 0;
  const exact = packages.find((t) => t.count === count);
  if (exact) return exact.rate * exact.count;
  const nearest = count < packages[0].count ? packages[0] : packages[packages.length - 1];
  return count * nearest.rate;
}

export function invoiceBalance(inv) {
  return Math.max(0, inv.total - inv.discount - inv.paid);
}

// The server decides the status (including OVERDUE); the fallback covers previews
export function invoiceStatus(inv) {
  if (inv.status) return inv.status;
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


// ---- Invoices -----------------------------------------------------------------

export function discountAmount(rule, monthly) {
  const amount = rule.type === 'PERCENT' ? Math.round(monthly * rule.value) / 100 : rule.value;
  return Math.min(amount, monthly);
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
    .filter((s) => s.status === 'ACTIVE' || s.status === 'ON_HOLD')
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
