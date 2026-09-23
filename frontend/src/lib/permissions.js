// What each role may see and do. Screens call can(role, action) rather than
// checking role names, so changing a role's access only means editing this list.
// NOTE: this only controls the UI. Once the backend is connected, the API must
// enforce the same rules on every request.

const STAFF_COMMON = [
  'dashboard',
  'search',
  'students.view',
  'timetable.view',
  'reschedules.view',
  'reschedules.create',
  'vouchers.view',
  'qr.view',
  'attendance.take',
  'attendance.all', // any class, not only own
  'results.view',
];

export const PERMISSIONS = {
  ADMIN: [
    ...STAFF_COMMON,
    'students.edit', // register students, office checklist
    'billing.view',
    'billing.record', // record payments, send receipts
    'billing.run', // monthly invoice run
    'billing.arrears', // warn / suspend under the unpaid-months rule
    'students.discounts',
    'waitlist.manage',
    'vouchers.create',
  ],
  SUPERVISOR: [
    ...STAFF_COMMON,
    'teachers.view',
    'billing.view', // read-only
    'reschedules.approve',
    'results.enter',
    'waitlist.manage',
    'vouchers.approve.2', // RM500 – RM3,000
    'settings.view',
    'settings.subjects',
  ],
  MANAGEMENT: [
    ...STAFF_COMMON,
    'students.edit',
    'teachers.view',
    'teachers.pay', // allowance rates, estimates, payslips
    'billing.view',
    'billing.record',
    'billing.run',
    'billing.arrears',
    'students.discounts',
    'waitlist.manage',
    'results.enter',
    'reports.view',
    'finance.summary', // collection & arrears totals
    'reschedules.approve',
    'vouchers.create',
    'vouchers.approve.2',
    'vouchers.approve.3', // above RM3,000
    'settings.view',
    'settings.subjects',
    'settings.pricing',
    'settings.policies',
    'settings.discounts',
  ],
  // Teachers only see their own classes
  TEACHER: ['teacher.home', 'attendance.take', 'results.view', 'results.enter'],
  PARENT: ['portal.view'],
};

export function can(role, action) {
  return PERMISSIONS[role]?.includes(action) ?? false;
}
