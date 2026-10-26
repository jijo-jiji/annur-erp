// Centralized API client connecting to Django REST Framework backend on port 8180 (via Vite proxy /api)

const BASE_URL = '/api/v1';
const TOKEN_KEY = 'annur_auth_token';

// Session token (DRF TokenAuthentication). Storage can be unavailable in private mode.
export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (token) => {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* keep session in memory only */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
  },
};

export async function request(endpoint, options = {}) {
  const token = tokenStore.get();
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...options.headers,
    },
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, config);
    if (res.status === 401 && token) {
      // Token expired or revoked: send the user back to the login screen
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:logout'));
    }
    if (res.status === 204) return null;
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const err = new Error(errorData.detail || errorData.message || `Request failed with status ${res.status}`);
      err.data = errorData;
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } catch (error) {
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, error);
    throw error;
  }
}

// Uploaded files. Downloads need the login token, so files are fetched as blobs, not linked directly.
const authHeader = () => {
  const token = tokenStore.get();
  return token ? { Authorization: `Token ${token}` } : {};
};

// Server-generated PDFs (receipts, payslips) need the login token, so they are fetched then saved
export async function downloadPdf(path, filename) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`PDF tidak dapat dijana (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const filesApi = {
  list: (kind, objectId) => request(`/files/?kind=${kind}&object_id=${objectId}`),
  upload: async (kind, objectId, file, extra = {}) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('object_id', objectId);
    form.append('file', file);
    Object.entries(extra).forEach(([k, v]) => { if (v !== undefined && v !== null) form.append(k, v); });
    const res = await fetch(`${BASE_URL}/files/`, { method: 'POST', headers: authHeader(), body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.detail || (res.status === 413 ? 'Fail terlalu besar.' : `Muat naik gagal (${res.status})`));
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },
  remove: (id) => request(`/files/${id}/`, { method: 'DELETE' }),
  blob: async (id) => {
    const res = await fetch(`${BASE_URL}/files/${id}/download/`, { headers: authHeader() });
    if (!res.ok) throw new Error(`Fail tidak dapat dibuka (${res.status})`);
    return res.blob();
  },
};

// Endpoints the public forms use without signing in
export const publicApi = {
  subjects: (form = '') => request(`/public/subjects/?${new URLSearchParams({ form })}`),
  // School results form (#/keputusan): the student code and the last 4 digits of the IC prove who it is
  checkResults: (studentCode, icLast4) => request('/public/results/check/', {
    method: 'POST', body: JSON.stringify({ student_code: studentCode, ic_last4: icLast4 }),
  }),
  sendResults: async (fields, slip) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, typeof v === 'object' ? JSON.stringify(v) : v));
    if (slip) form.append('slip', slip);
    const res = await fetch(`${BASE_URL}/public/results/`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.detail || (res.status === 413 ? 'Fail terlalu besar.' : `Penghantaran gagal (${res.status})`));
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },
};

// 0. Authentication API

export const authApi = {
  login: (username, password) => request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  me: () => request('/auth/me/'),
  users: () => request('/auth/users/'),
  logout: () => request('/auth/logout/', { method: 'POST' }),
  changePassword: (oldPassword, newPassword) => request('/auth/change-password/', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  }),
};

// Login accounts (Management only)
export const accountsApi = {
  list: () => request('/auth/accounts/'),
  events: () => request('/auth/accounts/events/'),
  create: (body) => request('/auth/accounts/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/auth/accounts/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetPassword: (id, password) => request(`/auth/accounts/${id}/reset_password/`, { method: 'POST', body: JSON.stringify({ password }) }),
};

// 1. Dynamic Master Data API
export const masterDataApi = {
  getAll: (category = null, status = null) => {
    let query = [];
    if (category) query.push(`category=${encodeURIComponent(category)}`);
    if (status) query.push(`status=${encodeURIComponent(status)}`);
    const qStr = query.length > 0 ? `?${query.join('&')}` : '';
    return request(`/business-config/master-data/${qStr}`);
  },
  propose: (data) => request('/business-config/master-data/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  approve: (id, approverRole = 'Supervisor') => request(`/business-config/master-data/${id}/approve/`, {
    method: 'POST',
    body: JSON.stringify({ approved_by: approverRole }),
  }),
  update: (id, data) => request(`/business-config/master-data/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  reject: (id, reason = '', approverRole = 'Supervisor') => request(`/business-config/master-data/${id}/reject/`, {
    method: 'POST',
    body: JSON.stringify({ approved_by: approverRole, rejection_reason: reason }),
  }),
};

// 2. CRM Leads API
export const leadsApi = {
  getAll: () => request('/students/leads/'),
  create: (data) => request('/students/leads/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id, data) => request(`/students/leads/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  // CSV import: without commit the server only checks the rows (preview); with commit it creates the good ones
  import: (data) => request('/students/leads/import/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  // move / lost / activities: every stage change is written to the lead's activity log
  action: (id, name, data = {}) => request(`/students/leads/${id}/${name}/`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  activities: (id) => request(`/students/leads/${id}/activities/`),
  stats: (params = {}) => request(`/students/leads/stats/?${new URLSearchParams(params)}`),
  // The prospects a dashboard figure counts: { count, ids } (same rule as the figure)
  matching: (params = {}) => request(`/students/leads/matching/?${new URLSearchParams(params)}`),
};

// 3. Students API
export const studentsApi = {
  // Year-end move to the next grade; dryRun previews without saving
  promote: (dryRun, removeOldClasses) => request('/students/students/promote/', {
    method: 'POST',
    body: JSON.stringify({ dry_run: dryRun, remove_old_classes: removeOldClasses }),
  }),
  // Parent / student feedback (photos and videos are attachments of kind FEEDBACK)
  feedback: (params = {}) => request(`/students/feedback/?${new URLSearchParams(params)}`),
  addFeedback: (data) => request('/students/feedback/', { method: 'POST', body: JSON.stringify(data) }),
  deleteFeedback: (id) => request(`/students/feedback/${id}/`, { method: 'DELETE' }),
  getAll: () => request('/students/students/'),
  // The students a dashboard or report figure counts: { count, student_ids } (same rule as the figure)
  matching: (params = {}) => request(`/students/students/matching/?${new URLSearchParams(params)}`),
  create: (data) => request('/students/students/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id, data) => request(`/students/students/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  parentSelfRegister: (data) => request('/students/parent-self-register/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  // Lifecycle actions: approve, reject, enroll, drop, change_class, hold, resume, terminate, note
  action: (id, name, data = {}) => request(`/students/students/${id}/${name}/`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  history: (params = {}) => request(`/students/history/?${new URLSearchParams(params)}`),
  waitlist: () => request('/students/waitlist/'),
  waitlistAction: (id, name) => request(`/students/waitlist/${id}/${name}/`, { method: 'POST' }),
  results: (studentId) => request(`/students/results/?student=${studentId}`),
  addResult: (data) => request('/students/results/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  // One student's results for one school exam: rows [{ subject, mark, grade }]; an empty row removes that result
  saveResultGrid: (studentPk, year, term, rows) => request('/students/results/grid/', {
    method: 'POST', body: JSON.stringify({ student: studentPk, year, term, rows }),
  }),
  // Results sent on the public form, waiting for staff to check them
  resultSubmissions: (status = '') => request(`/students/result-submissions/?${new URLSearchParams(status ? { status } : {})}`),
  approveSubmission: (id, rows, note = '') => request(`/students/result-submissions/${id}/approve/`, {
    method: 'POST', body: JSON.stringify({ rows, note }),
  }),
  rejectSubmission: (id, note) => request(`/students/result-submissions/${id}/reject/`, {
    method: 'POST', body: JSON.stringify({ note }),
  }),
};

// Student attendance (per class, per day)
export const attendanceApi = {
  roster: (classId, date) => request(`/attendance/roster/?class_id=${classId}&date=${date}`),
  save: (data) => request('/attendance/roster/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  summary: (start, end, classId) => request(`/attendance/summary/?${new URLSearchParams(Object.entries({ start, end, class_id: classId }).filter(([, v]) => v))}`),
  // The recorded sessions of a period (one class with class_id): who was on the roster, absent and late
  sessions: (params = {}) => request(`/attendance/sessions/?${new URLSearchParams(params)}`),
  // QR self check-in (Phase I): the class's code, timing and live list; open the code today, or confirm the list
  checkin: (classId, date) => request(`/attendance/checkin/?class_id=${classId}&date=${date}`),
  checkinAction: (classId, date, action) => request('/attendance/checkin/', { method: 'POST', body: JSON.stringify({ class_id: classId, date, action }) }),
  // The key behind a classroom's printed check-in QR; renew stops the old QR
  roomKey: (roomId, renew = false) => request(`/academic/classrooms/${roomId}/checkin_key/`, { method: 'POST', body: JSON.stringify({ renew }) }),
};

// QR check-in from a student's phone, without a login (#/hadir)
export const publicCheckInApi = {
  room: (key) => request(`/public/checkin/room/${encodeURIComponent(key)}/`),
  code: (code, room) => request('/public/checkin/code/', { method: 'POST', body: JSON.stringify({ code, room: room || undefined }) }),
  mark: (body) => request('/public/checkin/mark/', { method: 'POST', body: JSON.stringify(body) }),
};

// 4. Billing API
export const billingApi = {
  getInvoices: () => request('/billing/invoices/'),
  // The invoices / receipts a dashboard or report figure counts: { count, ids, ...totals } (same rule as the figure)
  matchingInvoices: (params = {}) => request(`/billing/invoices/matching/?${new URLSearchParams(params)}`),
  matchingReceipts: (params = {}) => request(`/billing/receipts/matching/?${new URLSearchParams(params)}`),
  getReceipts: () => request('/billing/receipts/'),
  payInvoice: (invoiceId, paymentData) => request('/billing/receipts/', {
    method: 'POST',
    body: JSON.stringify({
      invoice: invoiceId,
      ...paymentData,
    }),
  }),
  // Other invoices (seminar etc.): student, description, monthly_fee (the amount), billing_month
  createInvoice: (data) => request('/billing/invoices/', { method: 'POST', body: JSON.stringify(data) }),
  deleteInvoice: (id) => request(`/billing/invoices/${id}/`, { method: 'DELETE' }),
  // apply_discount / apply_credit / remind
  invoiceAction: (id, name, data = {}) => request(`/billing/invoices/${id}/${name}/`, { method: 'POST', body: JSON.stringify(data) }),
  monthlyRun: (month, dryRun) => request('/billing/invoices/monthly_run/', {
    method: 'POST',
    body: JSON.stringify({ month, dry_run: dryRun }),
  }),
  getDiscounts: () => request('/billing/discounts/'),
  // Tutup kaunter harian: the day's receipts and its close; close it (Admin), verify or return it (Supervisor)
  cashClose: (day) => request(`/billing/cash-close/${day ? `?date=${day}` : ''}`),
  closeCounter: (data) => request('/billing/cash-close/', { method: 'POST', body: JSON.stringify(data) }),
  verifyClose: (day, note = '') => request('/billing/cash-close/verify/', { method: 'POST', body: JSON.stringify({ date: day, note }) }),
  returnClose: (day, note) => request('/billing/cash-close/return/', { method: 'POST', body: JSON.stringify({ date: day, note }) }),
  closeHistory: (month) => request(`/billing/cash-close/history/?month=${month}`),
  // Week 5: unpaid monthly fees for Supervisor to follow up, and what the parent said
  followUps: () => request('/billing/follow-ups/'),
  recordFollowUp: (id, data) => request(`/billing/follow-ups/${id}/record/`, { method: 'POST', body: JSON.stringify(data) }),
  calculateFees: (levelCategory, subjectCount, isNewStudent) => request('/billing/calculate-fees/', {
    method: 'POST',
    body: JSON.stringify({
      level_category: levelCategory,
      subject_count: subjectCount,
      is_new_student: isNewStudent,
    }),
  }),
};

// 5. Payment Vouchers & Expenses API
export const expensesApi = {
  getVendors: () => request('/expenses/vendors/'),
  getVouchers: () => request('/expenses/vouchers/'),
  matchingVouchers: (params = {}) => request(`/expenses/vouchers/matching/?${new URLSearchParams(params)}`),
  createVoucher: (data) => request('/expenses/vouchers/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateVoucher: (id, data) => request(`/expenses/vouchers/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  approveVoucher: (id, comment = '') => request(`/expenses/vouchers/${id}/approve/`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  }),
  rejectVoucher: (id, comment) => request(`/expenses/vouchers/${id}/reject/`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  }),
};

// 6. Academic & Timetable API
export const academicApi = {
  getClassrooms: () => request('/academic/classrooms/'),
  getTimeSlots: () => request('/academic/time-slots/'),
  getClosedDates: () => request('/academic/closed-dates/'),
  getTimetable: () => request('/academic/timetable/'),
  matchingClasses: (params = {}) => request(`/academic/timetable/matching/?${new URLSearchParams(params)}`),
  createClass: (data) => request('/academic/timetable/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateClass: (id, data) => request(`/academic/timetable/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  deleteClass: (id) => request(`/academic/timetable/${id}/`, { method: 'DELETE' }),
  getRescheduleLogs: () => request('/academic/reschedule-logs/'),
  // approve / reject (Supervisor) and verify (Management)
  rescheduleAction: (id, name, data = {}) => request(`/academic/reschedule-logs/${id}/${name}/`, { method: 'POST', body: JSON.stringify(data) }),
  // Supervisor's master-timetable changes waiting for Management
  getTimetableChanges: (status = '') => request(`/academic/timetable-changes/${status ? `?status=${status}` : ''}`),
  timetableChangeAction: (id, name, data = {}) => request(`/academic/timetable-changes/${id}/${name}/`, { method: 'POST', body: JSON.stringify(data) }),
  createRescheduleLog: (data) => request('/academic/reschedule-logs/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateRescheduleLog: (id, data) => request(`/academic/reschedule-logs/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  getHandouts: () => request('/academic/handouts/'),
  createHandout: (data) => request('/academic/handouts/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteHandout: (id) => request(`/academic/handouts/${id}/`, { method: 'DELETE' }),
  recordPrint: (id, copies) => request(`/academic/handouts/${id}/record_print/`, {
    method: 'POST',
    body: JSON.stringify({ copies }),
  }),
  // Phase G: who has a copy (from the class's attendance, plus copies given later)
  getHandout: (id) => request(`/academic/handouts/${id}/`),
  handoutRecipients: (id) => request(`/academic/handouts/${id}/recipients/`),
  giveHandout: (id, student, given = true) => request(`/academic/handouts/${id}/give/`, { method: 'POST', body: JSON.stringify({ student, given }) }),
  handoutsForStudent: (studentId) => request(`/academic/handouts/for_student/?student=${studentId}`),
};

// 7. Teachers & Staff HR API
// Teacher attendance per class session (all roles) and monthly pay (Supervisor / Management)
export const teacherPayApi = {
  roster: (date) => request(`/teachers/attendance/roster/?date=${date}`),
  saveRoster: (date, marks) => request('/teachers/attendance/roster/', {
    method: 'POST',
    body: JSON.stringify({ date, marks }),
  }),
  summary: (month) => request(`/teachers/attendance/summary/?month=${month}`),
  attendance: (params = {}) => request(`/teachers/attendance/?${new URLSearchParams(params)}`),
  // The sessions a teacher was paid for in a year or month, with the allowance they add up to (Laporan > Bayaran guru)
  paid: (params = {}) => request(`/teachers/attendance/paid/?${new URLSearchParams(params)}`),
  payments: (params = {}) => request(`/teachers/payments/?${new URLSearchParams(params)}`),
  calculate: (month) => request('/teachers/payments/calculate/', { method: 'POST', body: JSON.stringify({ month }) }),
  // adjust / verify / approve / reject / mark_paid
  action: (id, name, data = {}) => request(`/teachers/payments/${id}/${name}/`, { method: 'POST', body: JSON.stringify(data) }),
  sessions: (id) => request(`/teachers/payments/${id}/sessions/`),
};

export const staffApi = {
  getTeachers: () => request('/teachers/teachers/'),
  // The teachers a dashboard figure counts: { count, ids } (teacher codes; same rule as the figure)
  matchingTeachers: (params = {}) => request(`/teachers/teachers/matching/?${new URLSearchParams(params)}`),
  getComplaints: () => request('/teachers/complaints/'),
  createComplaint: (data) => request('/teachers/complaints/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateComplaint: (id, data) => request(`/teachers/complaints/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  getRateIncrements: () => request('/teachers/rate-increments/'),
  proposeRateIncrement: (data) => request('/teachers/rate-increments/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  approveRateIncrement: (id, comment = '') => request(`/teachers/rate-increments/${id}/approve/`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  }),
  rejectRateIncrement: (id, comment) => request(`/teachers/rate-increments/${id}/reject/`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  }),
  getStaff: () => request('/teachers/staff/'),
  getStaffAttendance: () => request('/teachers/staff-attendance/'),
  getLeaveRequests: () => request('/teachers/leave-requests/'),
  applyLeave: (data) => request('/teachers/leave-requests/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  approveLeave: (id, approverRole = 'Supervisor', remark = '') => request(`/teachers/leave-requests/${id}/approve/`, {
    method: 'POST',
    body: JSON.stringify({ approved_by: approverRole, supervisor_remark: remark }),
  }),
  rejectLeave: (id, approverRole = 'Supervisor', remark = '') => request(`/teachers/leave-requests/${id}/reject/`, {
    method: 'POST',
    body: JSON.stringify({ approved_by: approverRole, supervisor_remark: remark }),
  }),
  // Clocks the logged-in user's own staff record
  toggleClock: () => request('/teachers/staff-attendance/toggle_clock/', { method: 'POST' }),
};

// Staff HR: profiles, job history, corrections, KPI, records and reports
const send = (method, path, data) => request(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });
export const hrApi = {
  me: () => request('/teachers/staff/me/'),
  createStaff: (data) => send('POST', '/teachers/staff/', data),
  updateStaff: (id, data) => send('PATCH', `/teachers/staff/${id}/`, data),
  history: (id) => request(`/teachers/staff/${id}/history/`),
  addHistory: (id, data) => send('POST', `/teachers/staff/${id}/history/`, data),
  report: (month, year) => request(`/teachers/staff/report/?month=${month}&year=${year}`),
  attendance: (params = {}) => request(`/teachers/staff-attendance/?${new URLSearchParams(params)}`),
  correctAttendance: (data) => send('POST', '/teachers/staff-attendance/correct/', data),
  cancelLeave: (id) => send('DELETE', `/teachers/leave-requests/${id}/`),
  records: (staffId) => request(`/teachers/staff-records/?staff=${staffId}`),
  addRecord: (data) => send('POST', '/teachers/staff-records/', data),
  kpis: (params = {}) => request(`/teachers/staff-kpis/?${new URLSearchParams(params)}`),
  addKpi: (data) => send('POST', '/teachers/staff-kpis/', data),
  reviewKpi: (id, data) => send('POST', `/teachers/staff-kpis/${id}/review/`, data),
  deleteKpi: (id) => send('DELETE', `/teachers/staff-kpis/${id}/`),
};

// 8. Dashboard, Reports & Configuration API
export const dashboardApi = {
  getSummary: () => request('/dashboard/summary/'),
  getReports: (year) => request(`/reports/summary/?year=${encodeURIComponent(year)}`),
  getPricingTiers: () => request('/business-config/pricing-tiers/'),
  getTeacherRates: () => request('/business-config/teacher-rates/'),
  getSettings: () => request('/business-config/settings/'),
};

// Changes to setup data (subjects, ...): Admin proposes, Supervisor / Management decides
// Teacher private links (Phase F): Management makes and cancels them; the token is shown only when a link is made
export const teacherLinksApi = {
  list: () => request('/teachers/links/'),
  create: (data) => request('/teachers/links/', { method: 'POST', body: JSON.stringify(data) }),
  revoke: (id) => request(`/teachers/links/${id}/revoke/`, { method: 'POST', body: JSON.stringify({}) }),
};

// The form behind a teacher link, opened without a login (Phase F); files go up with the form
export const publicTeacherApi = {
  get: (token) => request(`/public/teacher-link/${encodeURIComponent(token)}/`),
  // The teacher's classes today with their check-in code and live list (Phase I); mark a pupil or confirm the list
  classes: (token) => request(`/public/teacher-link/${encodeURIComponent(token)}/classes/`),
  classAction: (token, classId, body) => request(`/public/teacher-link/${encodeURIComponent(token)}/classes/${classId}/`, { method: 'POST', body: JSON.stringify(body) }),
  send: async (token, fields, uploads = {}) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => (Array.isArray(v) ? v.forEach((x) => form.append(k, x)) : form.append(k, v ?? '')));
    Object.entries(uploads).forEach(([k, file]) => file && form.append(k, file));
    const res = await fetch(`${BASE_URL}/public/teacher-link/${encodeURIComponent(token)}/`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.detail || (res.status === 413 ? 'Fail terlalu besar.' : res.status === 429 ? 'Terlalu banyak cubaan. Cuba lagi sebentar lagi.' : `Penghantaran gagal (${res.status})`));
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },
};

// The bell: the signed-in person's own notifications (what waits for them, decisions on what they asked)
export const notificationsApi = {
  list: () => request('/notifications/'),
  read: (ids) => request('/notifications/read/', { method: 'POST', body: JSON.stringify({ ids }) }),
  readAll: () => request('/notifications/read/', { method: 'POST', body: JSON.stringify({ all: true }) }),
};

// The office's daily checklist: tick items through the day; Supervisor checks the day once
export const checklistApi = {
  get: (day) => request(`/checklist/${day ? `?date=${day}` : ''}`),
  tick: (day, code, done, note = '') => request('/checklist/tick/', { method: 'POST', body: JSON.stringify({ date: day, code, done, note }) }),
  check: (day, note = '') => request('/checklist/check/', { method: 'POST', body: JSON.stringify({ date: day, note }) }),
};

export const changeRequestApi = {
  // kind may name several kinds (RECEIPT,INVOICE); target narrows it to one record's requests
  list: (kind, target) => request(`/change-requests/?kind=${encodeURIComponent(kind)}${target ? `&target=${target}` : ''}`),
  create: (body) => request('/change-requests/', { method: 'POST', body: JSON.stringify(body) }),
  revise: (id, payload, note) => request(`/change-requests/${id}/`, { method: 'PATCH', body: JSON.stringify({ payload, note }) }),
  // changes: values the person deciding fills in (a new teacher's code and rate, from an applicant's form)
  approve: (id, comment = '', changes) => request(`/change-requests/${id}/approve/`, { method: 'POST', body: JSON.stringify({ comment, ...(changes ? { changes } : {}) }) }),
  reject: (id, comment) => request(`/change-requests/${id}/reject/`, { method: 'POST', body: JSON.stringify({ comment }) }),
  withdraw: (id) => request(`/change-requests/${id}/withdraw/`, { method: 'POST', body: JSON.stringify({}) }),
  acknowledge: () => request('/change-requests/acknowledge/', { method: 'POST', body: JSON.stringify({}) }),
};

export const configApi = {
  getSubjects: () => request('/business-config/subjects/'),
  updateSetting: (id, data) => request(`/business-config/settings/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  updateTeacherRate: (id, data) => request(`/business-config/teacher-rates/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};
