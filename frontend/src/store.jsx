import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useApp } from './context/AppContext';
import {
  academicApi, attendanceApi, billingApi, changeRequestApi, configApi, dashboardApi, request, studentsApi,
} from './api/client';
import { setForms, todayISO } from './lib/format';

// Adapter between the server and the screens. Screens read data in one consistent shape
// (student.name, student.form, class.enrolled, invoice.paid, ...) and call actions here;
// every action goes to the API and the affected data is reloaded. Nothing is kept in the
// browser: the server is the only source of truth.

const StoreContext = createContext(null);

const num = (v) => Number(v) || 0;
const errorText = (err) => (err?.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '') || err?.message || 'Ralat.';

// ---- Server -> screen shapes ---------------------------------------------------

function toStudent(s, discountCodes) {
  return {
    pk: s.id,
    id: s.student_id,
    name: s.full_name,
    ic: s.ic_number,
    form: s.form_level,
    stream: s.stream,
    school: s.school_name,
    schoolCategory: s.school_category,
    phone: s.phone_number,
    email: s.email,
    address: s.address,
    parent1: { name: s.parent1_name, phone: s.parent1_phone, email: s.parent1_email, occupation: s.parent1_occupation, relation: s.parent1_relation, age: s.parent1_age },
    parent2: { name: s.parent2_name, phone: s.parent2_phone, email: s.parent2_email, occupation: s.parent2_occupation, relation: s.parent2_relation, age: s.parent2_age },
    preferred: s.preferred_contact === 'PARENT_2' ? 2 : 1,
    classes: s.enrolled_classes || [],
    waitingFor: s.waiting_for || [],
    type: s.student_type,
    status: s.status,
    joined: s.join_date,
    left: s.left_date,
    holdUntil: s.on_hold_until,
    source: s.lead_source,
    discounts: s.standing_discount && discountCodes[s.standing_discount] ? [discountCodes[s.standing_discount]] : [],
    specialFee: s.special_monthly_fee === null ? null : num(s.special_monthly_fee),
    specialFeeNote: s.special_fee_note,
    credit: num(s.credit_balance),
    registrationComment: s.registration_comment,
    decidedBy: s.registration_decided_by,
    walkIn: { description: s.walk_in_description, subjects: s.walk_in_subjects || [] },
    raw: s,
  };
}

function toClass(c, waiting) {
  return {
    id: c.id,
    code: c.class_code,
    day: c.day,
    start: c.start_time,
    end: c.end_time,
    subject: c.subject_details?.code,
    subjectPk: c.subject,
    form: c.form_level,
    section: c.section,
    teacher: c.teacher_details?.teacher_code || '',
    teacherPk: c.teacher,
    room: (c.classroom_name || '').replace(/^Bilik\s+/i, ''),
    roomPk: c.classroom,
    slotPk: c.slot,
    max: c.max_seats,
    enrolled: c.current_enrolled,
    waiting: waiting[c.id] ?? 0,
  };
}

// Teacher names are stored with the "Cikgu" title; screens add it themselves
const teacherName = (name) => (name || '').replace(/^Cikgu\s+/i, '');

function toTeacher(t) {
  return {
    pk: t.id,
    code: t.teacher_code,
    name: teacherName(t.full_name),
    type: t.teacher_type,
    subjects: (t.subjects_qualified_details || []).map((s) => s.name).join(', '),
    phone: t.phone_number,
    email: t.email,
    rate: t.rate_per_session === undefined ? null : num(t.rate_per_session), // hidden from Admin by the server
    since: t.joined_date ? Number(t.joined_date.slice(0, 4)) : null,
    joined: t.joined_date,
    active: t.is_active,
    permitExpiry: t.teaching_permit_expiry,
    bank: [t.bank_name, t.bank_account].filter(Boolean).join(' '),
    remarks: t.remarks,
    raw: t,
  };
}

const toSubject = (s) => ({ pk: s.id, code: s.code, name: s.name, level: s.level_category, stream: s.stream, active: s.is_active });

function toInvoice(i) {
  const discount = num(i.discount_amount);
  return {
    pk: i.id,
    no: i.invoice_number,
    studentId: i.student_code,
    studentPk: i.student,
    month: (i.billing_month || '').slice(0, 7),
    type: i.invoice_type,
    typeLabel: i.invoice_type_label,
    description: i.description,
    monthlyFee: num(i.monthly_fee),
    regFee: num(i.registration_fee),
    discounts: discount ? [{ id: i.discount || 'D', label: i.discount_remarks || 'Diskaun', amount: discount }] : [],
    discount,
    // Screens work out the balance as total - discount - paid
    total: num(i.total_payable) + discount,
    paid: num(i.total_paid),
    creditApplied: num(i.credit_applied),
    balance: num(i.balance_due),
    status: i.status,
    dueDate: i.due_date,
    receipt: i.latest_receipt,
    followUpWeek: i.follow_up_week,
    reminders: i.reminder_count,
    lastReminder: i.last_reminder_at,
    studentCredit: num(i.student_credit),
    phone: i.preferred_phone,
    parentName: i.parent_name,
    studentName: i.student_name,
  };
}

const toReceipt = (r) => ({
  pk: r.id,
  no: r.receipt_number,
  invoiceNo: r.invoice_number,
  invoicePk: r.invoice,
  studentName: r.student_name,
  amount: num(r.amount_paid),
  overpaid: num(r.overpaid_amount),
  date: r.payment_date,
  method: r.payment_method,
  type: r.payment_type,
  month: (r.payment_month || '').slice(0, 7),
  ref: r.reference_number,
  notes: r.notes,
  by: r.received_by,
});

// Server statuses grouped the way the voucher screens show them
const VOUCHER_STATUS = {
  DRAFT: 'PENDING', VERIFIED_ADMIN: 'VERIFIED', PENDING_SUPERVISOR: 'PENDING', PENDING_MANAGEMENT: 'PENDING',
  APPROVED_SUPERVISOR: 'APPROVED', APPROVED_MANAGEMENT: 'APPROVED', REJECTED: 'REJECTED',
};

const toVoucher = (v) => ({
  pk: v.id,
  no: v.pv_number,
  date: v.date,
  vendor: v.vendor_name || '-',
  vendorPk: v.vendor,
  vendorTin: v.vendor_tin,
  vendorBank: v.vendor_bank,
  category: v.category,
  subcategory: v.subcategory,
  method: v.payment_method,
  ref: v.ref_number,
  amount: num(v.amount),
  description: v.items_description,
  remarks: v.remarks,
  status: VOUCHER_STATUS[v.status] || v.status,
  rawStatus: v.status,
  tier: v.tier_level,
  preparedBy: v.prepared_by,
  approvedBy: v.approved_by,
  comment: v.approval_comment,
});

const toReschedule = (r) => ({
  id: r.id,
  classId: r.timetable_class,
  classCode: r.class_code,
  cancelled: r.tarikh_batal,
  replacement: r.tarikh_ganti,
  extra: r.is_extra_class,
  reason: r.reason_type,
  remarks: r.remarks,
  status: r.status,
  approved: r.status === 'APPROVED',
  rejected: r.status === 'REJECTED',
  decidedBy: r.decided_by,
  comment: r.decision_comment,
  verifiedBy: r.verified_by,
  recordedBy: r.recorded_by,
  notified: r.whatsapp_notification_sent,
});

const toTier = (t) => ({ id: t.id, category: t.level_category, label: t.group_label || '', count: t.subject_count, rate: num(t.price_per_subject) });

const toDiscount = (d) => ({
  pk: d.id,
  id: d.code,
  label: d.name,
  type: d.mode === 'PERCENT' ? 'PERCENT' : 'FIXED',
  value: num(d.value),
  recurring: d.recurring,
  auto: false,
  active: d.is_active,
  validFrom: d.valid_from,
  validUntil: d.valid_until,
  maxUses: d.max_uses,
  used: d.used_count,
});

// Policy values kept as key / value rows on the server
const SETTING_KEYS = {
  regFee: 'REGISTRATION_FEE',
  sessionMinutes: 'SESSION_DURATION_MINUTES',
  classCapacity: 'DEFAULT_CLASS_CAPACITY',
  dueDay: 'MONTHLY_DUE_DAY',
  unpaidMonthsLimit: 'UNPAID_TERMINATION_MONTHS',
  noticeWeeks: 'WITHDRAWAL_NOTICE_WEEKS',
};
const SETTING_DEFAULTS = { regFee: 0, sessionMinutes: 90, classCapacity: 20, dueDay: 7, unpaidMonthsLimit: 2, noticeWeeks: 2 };

function toSettings(rows) {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = { ...SETTING_DEFAULTS };
  for (const [field, key] of Object.entries(SETTING_KEYS)) if (byKey[key] !== undefined) out[field] = num(byKey[key]);
  return out;
}

// Exam results are stored per student and subject; screens show them per exam and class
function toExamResults(rows, classes, students) {
  const exams = {};
  const marks = {}; // exam -> subjectPk -> studentPk -> mark
  for (const r of rows) {
    if (r.mark === null || r.mark === undefined) continue;
    const date = r.exam_date || '';
    if (!exams[r.exam_name] || date > exams[r.exam_name].date) exams[r.exam_name] = { id: r.exam_name, name: r.exam_name, date };
    ((marks[r.exam_name] ??= {})[r.subject] ??= {})[r.student] = r.mark;
  }
  const results = [];
  for (const exam of Object.values(exams)) {
    for (const c of classes) {
      const bySubject = marks[exam.id]?.[c.subjectPk];
      if (!bySubject) continue;
      const classMarks = {};
      for (const s of students) if (s.classes.includes(c.id) && bySubject[s.pk] !== undefined) classMarks[s.id] = bySubject[s.pk];
      if (Object.keys(classMarks).length) results.push({ examId: exam.id, classId: c.id, marks: classMarks });
    }
  }
  return { exams: Object.values(exams).sort((a, b) => a.date.localeCompare(b.date)), results };
}

// ---- Provider ------------------------------------------------------------------

export function StoreProvider({ children }) {
  const app = useApp();
  const { user, showToast } = app;
  const [settingRows, setSettingRows] = useState([]);
  const [discountRows, setDiscountRows] = useState([]);
  const [waitlistRows, setWaitlistRows] = useState([]);
  const [sessionRows, setSessionRows] = useState([]);
  const [resultRows, setResultRows] = useState([]);
  const [grades, setGrades] = useState([]);

  const loaders = useMemo(() => ({
    settings: () => dashboardApi.getSettings().then(setSettingRows),
    discounts: () => billingApi.getDiscounts().then(setDiscountRows),
    waitlist: () => studentsApi.waitlist().then(setWaitlistRows),
    attendance: () => request(`/attendance/sessions/?start=${todayISO().slice(0, 4)}-01-01`).then(setSessionRows),
    results: () => request('/students/results/').then(setResultRows),
    grades: () => request('/business-config/grades/').then((rows) => { setForms(rows); setGrades(rows); }),
  }), []);

  const reload = useCallback((...names) => Promise.all(
    (names.length ? names : Object.keys(loaders)).map((n) => loaders[n]().catch(() => {})),
  ), [loaders]);

  useEffect(() => { if (user) reload(); }, [user, reload]);

  // Runs a server call, reloads what it affects and reports failures in plain words
  const act = useCallback(async (call, { reloads = [], refresh } = {}) => {
    try {
      const result = await call();
      await Promise.all([refresh?.(), reloads.length ? reload(...reloads) : null]);
      return result;
    } catch (err) {
      showToast(errorText(err), 'error');
      throw err;
    }
  }, [reload, showToast]);

  const data = useMemo(() => {
    const discountCodes = Object.fromEntries(discountRows.map((d) => [d.id, d.code]));
    const students = app.students.map((s) => toStudent(s, discountCodes));
    const waiting = {};
    const waitlist = waitlistRows.filter((w) => w.status === 'WAITING').map((w) => {
      waiting[w.timetable_class] = (waiting[w.timetable_class] ?? 0) + 1;
      return { id: w.id, classId: w.timetable_class, studentId: w.student_code, studentPk: w.student, added: (w.created_at || '').slice(0, 10) };
    });
    const classes = app.timetable.map((c) => toClass(c, waiting));
    const invoices = app.invoices.map(toInvoice);
    const arrearsWarnings = {};
    for (const i of invoices) if (i.lastReminder && (!arrearsWarnings[i.studentId] || i.lastReminder > arrearsWarnings[i.studentId])) arrearsWarnings[i.studentId] = i.lastReminder;
    return {
      students,
      classes,
      waitlist,
      invoices,
      arrearsWarnings,
      subjects: app.subjects.map(toSubject),
      teachers: app.teachers.map(toTeacher),
      receipts: app.receipts.map(toReceipt),
      vouchers: app.vouchers.map(toVoucher),
      vendors: app.vendors,
      reschedules: app.reschedules.map(toReschedule),
      pricingTiers: app.pricingTiers.map(toTier),
      settings: toSettings(settingRows),
      discounts: discountRows.map(toDiscount),
      attendance: sessionRows.map((s) => ({ classId: s.class_id, date: s.date, absent: s.absent, late: s.late, roster: s.roster, takenBy: s.taken_by, note: s.note, notes: s.notes })),
      ...toExamResults(resultRows, classes, students),
      grades,
      timeSlots: app.timeSlots,
      classrooms: app.classrooms,
    };
  }, [app.students, app.timetable, app.invoices, app.subjects, app.teachers, app.receipts, app.vouchers, app.vendors,
    app.reschedules, app.pricingTiers, app.timeSlots, app.classrooms, settingRows, discountRows, waitlistRows, sessionRows, resultRows, grades]);

  const actions = useMemo(() => {
    const studentPk = (code) => app.students.find((s) => s.student_id === code)?.id;
    const invoicePk = (no) => app.invoices.find((i) => i.invoice_number === no)?.id;
    const refreshStudents = () => app.refreshStudents();

    return {
      reload,

      // New registrations wait for Supervisor approval; the first invoice is raised on approval.
      // Full classes chosen as waiting-list are sent with the rest: the server queues them.
      async registerStudent(form, { waitlist = [] } = {}) {
        const created = await act(() => studentsApi.create({
          full_name: form.name, ic_number: form.ic, form_level: form.form, stream: form.stream || 'GENERAL',
          student_type: form.type || 'MONTHLY', school_name: form.school, school_category: form.schoolCategory || '', school_code: form.schoolCode || '',
          phone_number: form.phone || '', email: form.email || '', address: form.address || '', lead_source: form.source || 'WALKIN',
          parent1_name: form.parent1.name, parent1_phone: form.parent1.phone, parent1_occupation: form.parent1.occupation || '',
          parent1_relation: form.parent1.relation || 'Bapa', parent1_email: form.parent1.email || '', parent1_age: form.parent1.age || '',
          parent2_name: form.parent2?.name || '', parent2_phone: form.parent2?.phone || '', parent2_occupation: form.parent2?.occupation || '',
          parent2_relation: form.parent2?.relation || 'Ibu', parent2_email: form.parent2?.email || '', parent2_age: form.parent2?.age || '',
          preferred_contact: form.preferred === 2 ? 'PARENT_2' : 'PARENT_1',
          walk_in_description: form.walkInDescription || '', walk_in_subjects: form.walkInSubjects || [],
          saps_consent: form.saps ?? true,
          agree_terms_7th_payment: true, agree_terms_2months_auto_drop: true, agree_terms_2weeks_notice: true,
          class_ids: [...(form.classes || []), ...waitlist],
        }), { refresh: refreshStudents, reloads: ['waitlist'] });
        return { student: { id: created.student_id, pk: created.id, name: created.full_name }, enrolment: created.enrolment || {} };
      },

      // Profile fields only; status and classes change through studentAction
      updateStudent(code, patch) {
        return act(() => studentsApi.update(studentPk(code), patch), { refresh: refreshStudents });
      },

      // approve, reject, enroll, drop, change_class, hold, resume, terminate, note
      studentAction(code, name, payload = {}) {
        return act(() => studentsApi.action(studentPk(code), name, payload), { refresh: refreshStudents, reloads: ['waitlist'] });
      },

      recordPayment(invoiceNo, { amount, method, ref, date, type = 'MONTHLY', month, notes = '' }) {
        return act(async () => toReceipt(await billingApi.payInvoice(invoicePk(invoiceNo), {
          amount_paid: amount, payment_method: method, reference_number: ref || '', payment_date: date,
          payment_type: type, payment_month: type === 'MONTHLY' && month ? `${month}-01` : null, notes,
        })), { refresh: app.refreshBilling });
      },

      // dryRun lists who would be invoiced without saving
      async runMonthlyInvoices(month, dryRun = false) {
        return act(() => billingApi.monthlyRun(month, dryRun), dryRun ? {} : { refresh: app.refreshBilling });
      },

      invoiceAction(invoiceNo, name, payload = {}) {
        return act(() => billingApi.invoiceAction(invoicePk(invoiceNo), name, payload), { refresh: app.refreshBilling });
      },

      createOtherInvoice(studentCode, description, amount) {
        return act(() => billingApi.createInvoice({ student: studentPk(studentCode), description, monthly_fee: amount }), { refresh: app.refreshBilling });
      },

      // Records that a payment reminder went out for each of the student's unpaid invoices
      warnArrears(studentCode) {
        const open = app.invoices.filter((i) => i.student_code === studentCode && i.status !== 'PAID');
        return act(() => Promise.all(open.map((i) => billingApi.invoiceAction(i.id, 'remind'))), { refresh: app.refreshBilling });
      },

      addReschedule(entry) {
        return app.createReschedule({
          timetable_class: entry.classId, tarikh_batal: entry.cancelled || null, tarikh_ganti: entry.replacement || null,
          is_extra_class: Boolean(entry.extra), reason_type: entry.reason, remarks: entry.remarks || '', month_label: entry.monthLabel || '',
        });
      },

      // approve / reject (Supervisor) and verify (Management); `notified` marks the WhatsApp notice as sent
      rescheduleAction(id, name, comment = '') {
        return app.rescheduleAction(id, name, { comment });
      },
      markRescheduleNotified: (id) => app.markRescheduleNotified(id),

      addVoucher(pv) {
        return app.createVoucher({
          vendor: pv.vendorPk, date: pv.date, category: pv.category, subcategory: pv.subcategory || '',
          payment_method: pv.method || 'ONLINE_TRANSFER', ref_number: pv.ref || '', amount: pv.amount,
          items_description: pv.description, remarks: pv.remarks || '',
        });
      },
      approveVoucher: (no, comment = '') => app.approveVoucher(app.vouchers.find((v) => v.pv_number === no)?.id, comment),
      rejectVoucher: (no, comment) => app.rejectVoucher(app.vouchers.find((v) => v.pv_number === no)?.id, comment),

      // The server puts the student on the waiting list when the class is full
      addToWaitlist(classId, studentCode) {
        return act(() => studentsApi.action(studentPk(studentCode), 'enroll', { class_id: classId }), { refresh: refreshStudents, reloads: ['waitlist'] });
      },
      removeFromWaitlist(id) {
        return act(() => studentsApi.waitlistAction(id, 'cancel'), { reloads: ['waitlist'] });
      },
      enrollFromWaitlist(id) {
        return act(() => studentsApi.waitlistAction(id, 'enroll'), { refresh: refreshStudents, reloads: ['waitlist'] });
      },

      // record: { classId, date, roster: [codes], absent: [codes], late: [codes], note, notes: {code: text} }
      saveAttendance(record) {
        return act(() => attendanceApi.save({
          class_id: record.classId, date: record.date, note: record.note || '',
          marks: record.roster.map((code) => ({
            student: studentPk(code), present: !record.absent.includes(code), late: record.late.includes(code), note: record.notes?.[code] || '',
          })),
        }), { reloads: ['attendance'] });
      },

      // record: { classId, examName, examDate, marks: {code: mark} }
      saveResults(record) {
        return act(() => request('/students/results/bulk/', {
          method: 'POST',
          body: JSON.stringify({ class_id: record.classId, exam_name: record.examName, exam_date: record.examDate, marks: record.marks }),
        }), { reloads: ['results'] });
      },

      // Any kind of setup change by request (categories, ...): who waits and who decides is decided by the server
      submitChangeRequest({ kind, action, pk, values, note }) {
        return act(() => changeRequestApi.create({ kind, action, target_id: pk, payload: values, note }),
          { refresh: app.refreshAllData });
      },
      // Vendor details: Supervisor asks, Management approves (Management's own changes apply at once)
      submitVendor({ action, pk, values, note }) {
        return act(() => changeRequestApi.create({ kind: 'VENDOR', action, target_id: pk, payload: values, note }),
          { refresh: app.refreshAllData });
      },
      // Subjects change by request: Admin's wait for approval, Supervisor / Management's apply at once
      submitSubject({ action, pk, values, note }) {
        return act(() => changeRequestApi.create({ kind: 'SUBJECT', action, target_id: pk, payload: values, note }),
          { refresh: app.refreshAllData });
      },

      // Existing fee packages: rate per subject (the package total follows from it)
      saveTiers(tiers) {
        const changed = tiers.filter((t) => {
          const old = app.pricingTiers.find((x) => x.id === t.id);
          return old && num(old.price_per_subject) !== num(t.rate);
        });
        return act(() => Promise.all(changed.map((t) => configApi.updatePricingTier(t.id, { price_per_subject: t.rate, total_price: t.rate * t.count }))),
          { refresh: app.refreshAllData });
      },

      // Management can add any package group (e.g. Darjah 1-4), package and per-subject rate
      addTier({ group, label, count, rate }) {
        return act(() => configApi.createPricingTier({
          level_category: group, group_label: label || '', subject_count: count, price_per_subject: rate,
        }), { refresh: app.refreshAllData });
      },
      deleteTier(id) {
        return act(() => configApi.deletePricingTier(id), { refresh: app.refreshAllData });
      },
      renameTierGroup(group, label) {
        return act(() => Promise.all(app.pricingTiers.filter((t) => t.level_category === group)
          .map((t) => configApi.updatePricingTier(t.id, { group_label: label }))), { refresh: app.refreshAllData });
      },

      saveSettings(settings) {
        const rows = Object.entries(SETTING_KEYS)
          .map(([field, key]) => ({ row: settingRows.find((r) => r.key === key), value: settings[field] }))
          .filter(({ row, value }) => row && value !== undefined && num(row.value) !== num(value));
        return act(() => Promise.all(rows.map(({ row, value }) => configApi.updateSetting(row.id, { value: String(value) }))), { reloads: ['settings'] });
      },

      saveDiscount(d) {
        return act(() => billingApi.saveDiscount({
          ...(d.pk ? { id: d.pk } : {}), name: d.label, code: d.id, mode: d.type === 'PERCENT' ? 'PERCENT' : 'FIXED', value: d.value,
          recurring: d.recurring ?? true, is_active: d.active ?? true,
          valid_from: d.validFrom || null, valid_until: d.validUntil || null, max_uses: d.maxUses || null,
        }), { reloads: ['discounts'] });
      },
      deleteDiscount(d) {
        return act(() => billingApi.deleteDiscount(d.pk), { reloads: ['discounts'] });
      },

      saveClass: (pk, payload) => app.saveClass(pk, payload),
      deleteClass: (pk, code) => app.deleteClass(pk, code),
      timetableChanges: (status) => academicApi.getTimetableChanges(status),
    };
  }, [act, app, reload, settingRows]);

  const value = useMemo(() => ({ ...data, ...actions }), [data, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}
