// What each role may see and do in the interface. Screens call can(role, action) rather
// than checking role names, so changing a role's access only means editing this list.
// The server enforces the same rules on every request; this list only decides what is shown.

const STAFF_COMMON = [
  'dashboard',
  'search',
  'leads.view',
  'students.view',
  'students.edit', // register, add / drop subjects, hold, terminate, notes, feedback
  'timetable.view',
  'reschedules.view',
  'reschedules.create',
  'handouts.view',
  'attendance.take',
  'attendance.all',
  'results.view',
  'results.enter',
  'teachers.view',
  'teachers.attendance',
  'billing.view',
  'vouchers.view',
  'vouchers.create',
  'staff.view', // own clock-in and leave; approvers see everyone
  'masterdata.view',
  'qr.view',
];

export const PERMISSIONS = {
  ADMIN: [
    ...STAFF_COMMON,
    'settings.view', // Admin proposes subject changes; the rest of Settings is hidden
    'billing.record', // record payments, send receipts
    'billing.run', // monthly invoice run
    'billing.arrears', // payment follow-up
    'waitlist.view',
  ],
  SUPERVISOR: [
    ...STAFF_COMMON,
    'students.approve', // approve / reject registrations, special fee, standing discount
    'students.promote',
    'waitlist.view',
    'waitlist.manage', // enrol over capacity
    'teachers.pay', // rates, complaints, increments
    'payroll.view',
    'billing.record',
    'billing.run',
    'billing.arrears',
    'students.discounts',
    'reschedules.approve',
    'timetable.edit', // changes wait for Management
    'vouchers.approve.2', // RM500 – RM3,000
    'vendors.manage', // asks for vendor changes; Management approves
    'categories.manage', // asks for expense category changes; Management approves
    'teachers.manage', // asks to add a teacher or change active / inactive; Management approves
    'masterdata.approve',
    'staff.manage',
    'reports.view',
    'settings.view',
    'settings.advanced', // fee packages, discounts, policies
    'settings.pricing',
    'settings.discounts',
  ],
  MANAGEMENT: [
    ...STAFF_COMMON,
    'students.approve',
    'students.promote',
    'waitlist.view',
    'waitlist.manage',
    'teachers.pay',
    'payroll.view',
    'payroll.approve',
    'billing.record',
    'billing.run',
    'billing.arrears',
    'students.discounts',
    'reschedules.approve',
    'reschedules.verify',
    'timetable.edit',
    'timetable.approve',
    'vouchers.approve.2',
    'vouchers.approve.3', // above RM3,000
    'vendors.manage',
    'categories.manage',
    'teachers.manage',
    'masterdata.approve',
    'staff.manage',
    'staff.jobs', // job details, add staff
    'reports.view',
    'finance.summary', // collection & arrears totals
    'settings.view',
    'settings.advanced', // fee packages, discounts, policies
    'settings.pricing',
    'settings.policies',
    'settings.discounts',
  ],
};

export function can(role, action) {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

export const isApprover = (role) => role === 'SUPERVISOR' || role === 'MANAGEMENT';
