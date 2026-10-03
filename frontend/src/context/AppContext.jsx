import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  authApi, tokenStore, masterDataApi, leadsApi, studentsApi, billingApi, expensesApi,
  academicApi, staffApi, dashboardApi, configApi
} from '../api/client';

const AppContext = createContext(null);

// Old screen ids -> routes in the new shell
const ROUTE_OF = {
  staff_hr: 'staff', expenses: 'vouchers', dynamic_master_data: 'master-data', reports_suite: 'reports',
  management_config: 'settings', parent_qr: 'parent-qr', teacher_attendance: 'teacher-attendance', teacher_payroll: 'payroll',
};
export const routeOf = (tab) => ROUTE_OF[tab] || tab;

export function AppProvider({ children, notify }) {
  // Session: user = { username, full_name, role } from the server
  const [user, setUser] = useState(null);
  // No saved token means there is no session to verify
  const [authChecked, setAuthChecked] = useState(() => !tokenStore.get());

  // Navigation & Toasts
  const [activeTab, setActiveTab] = useState('dashboard');
  const [draftRegistration, setDraftRegistration] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Core Data States
  const [masterData, setMasterData] = useState([]);
  const [students, setStudents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [reschedules, setReschedules] = useState([]);
  const [handouts, setHandouts] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [pricingTiers, setPricingTiers] = useState([]);

  // Stable identity so screens can use it in effect dependencies
  // Messages are shown by the shell's toast system
  const showToast = useCallback((message, type = 'success') => {
    notify?.(message, type);
  }, [notify]);

  // Initial Load from Django REST backend
  const refreshAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        masterRes, studentsRes, leadsRes, invoicesRes, receiptsRes,
        vouchersRes, vendorsRes, timetableRes, reschedulesRes, handoutsRes,
        teachersRes, staffRes, leavesRes, summaryRes, pricingRes,
        slotsRes, roomsRes, subjectsRes
      ] = await Promise.allSettled([
        masterDataApi.getAll(),
        studentsApi.getAll(),
        leadsApi.getAll(),
        billingApi.getInvoices(),
        billingApi.getReceipts(),
        expensesApi.getVouchers(),
        expensesApi.getVendors(),
        academicApi.getTimetable(),
        academicApi.getRescheduleLogs(),
        academicApi.getHandouts(),
        staffApi.getTeachers(),
        staffApi.getStaff(),
        staffApi.getLeaveRequests(),
        dashboardApi.getSummary(),
        dashboardApi.getPricingTiers(),
        academicApi.getTimeSlots(),
        academicApi.getClassrooms(),
        configApi.getSubjects(),
      ]);

      if (masterRes.status === 'fulfilled') setMasterData(masterRes.value || []);
      if (studentsRes.status === 'fulfilled') setStudents(studentsRes.value || []);
      if (leadsRes.status === 'fulfilled') setLeads(leadsRes.value || []);
      if (invoicesRes.status === 'fulfilled') setInvoices(invoicesRes.value || []);
      if (receiptsRes.status === 'fulfilled') setReceipts(receiptsRes.value || []);
      if (vouchersRes.status === 'fulfilled') setVouchers(vouchersRes.value || []);
      if (vendorsRes.status === 'fulfilled') setVendors(vendorsRes.value || []);
      if (timetableRes.status === 'fulfilled') setTimetable(timetableRes.value || []);
      if (reschedulesRes.status === 'fulfilled') setReschedules(reschedulesRes.value || []);
      if (handoutsRes.status === 'fulfilled') setHandouts(handoutsRes.value || []);
      if (teachersRes.status === 'fulfilled') setTeachers(teachersRes.value || []);
      if (staffRes.status === 'fulfilled') setStaff(staffRes.value || []);
      if (leavesRes.status === 'fulfilled') setLeaveRequests(leavesRes.value || []);
      if (summaryRes.status === 'fulfilled') setDashboardSummary(summaryRes.value || null);
      if (pricingRes.status === 'fulfilled') setPricingTiers(pricingRes.value || []);
      if (slotsRes.status === 'fulfilled') setTimeSlots(slotsRes.value || []);
      if (roomsRes.status === 'fulfilled') setClassrooms(roomsRes.value || []);
      if (subjectsRes.status === 'fulfilled') setSubjects(subjectsRes.value || []);
    } catch (err) {
      console.error('Failed to load system data from backend:', err);
      showToast('Gagal memuat turun data dari pelayan backend.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // Restore a saved session on page load
  useEffect(() => {
    if (!tokenStore.get()) return;
    authApi.me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setAuthChecked(true));
  }, []);

  // Any 401 from the API ends the session
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:logout', onExpired);
    return () => window.removeEventListener('auth:logout', onExpired);
  }, []);

  useEffect(() => {
    if (user) refreshAllData();
  }, [user, refreshAllData]);

  const login = async (username, password) => {
    const res = await authApi.login(username, password);
    tokenStore.set(res.token);
    setActiveTab('dashboard');
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Token may already be invalid; clear locally anyway
    }
    tokenStore.clear();
    setUser(null);
  };

  // Master Data Selectors & Actions
  const getMasterOptions = useCallback((category) => {
    return masterData
      .filter((item) => item.category === category && item.status === 'APPROVED')
      .map((item) => ({
        value: item.code,
        label: item.label,
        meta: item.meta_info,
        id: item.id,
      }));
  }, [masterData]);

  const proposeMasterData = async (payload) => {
    try {
      const created = await masterDataApi.propose(payload);
      setMasterData((prev) => [...prev, created]);
      showToast(created.status === 'APPROVED' ? `Data induk "${created.label}" ditambah.` : `Cadangan data induk "${created.label}" dihantar untuk kelulusan.`);
      return created;
    } catch (err) {
      showToast(err.message || 'Ralat semasa menghantar cadangan data induk.', 'error');
      throw err;
    }
  };

  const updateMasterData = async (id, data) => {
    try {
      const updated = await masterDataApi.update(id, data);
      setMasterData((prev) => prev.map((item) => (item.id === id ? updated : item)));
      showToast(`Data induk ${updated.code} dikemas kini.`);
      return updated;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat mengemas kini data induk.', 'error');
      throw err;
    }
  };

  const approveMasterData = async (id, approverRole = 'Supervisor') => {
    try {
      const updated = await masterDataApi.approve(id, approverRole);
      setMasterData((prev) => prev.map((item) => (item.id === id ? updated : item)));
      showToast(`Data induk "${updated.label}" berjaya diluluskan dan diaktifkan.`);
      return updated;
    } catch (err) {
      showToast(err.message || 'Ralat semasa meluluskan data induk.', 'error');
      throw err;
    }
  };

  const rejectMasterData = async (id, reason = '', approverRole = 'Supervisor') => {
    try {
      const updated = await masterDataApi.reject(id, reason, approverRole);
      setMasterData((prev) => prev.map((item) => (item.id === id ? updated : item)));
      showToast(`Cadangan data induk "${updated.label}" telah ditolak.`, 'info');
      return updated;
    } catch (err) {
      showToast(err.message || 'Ralat semasa menolak data induk.', 'error');
      throw err;
    }
  };

  // Student Actions
  // Students, seats, invoices and dashboard all change together after a lifecycle action
  const refreshStudents = useCallback(async () => {
    // Leads too: approving or rejecting a converted lead's registration moves the lead
    const [allStuds, allInvs, allClasses, summary, allLeads] = await Promise.all([
      studentsApi.getAll(),
      billingApi.getInvoices(),
      academicApi.getTimetable(),
      dashboardApi.getSummary(),
      leadsApi.getAll(),
    ]);
    setLeads(allLeads);
    setStudents(allStuds);
    setInvoices(allInvs);
    setTimetable(allClasses);
    setDashboardSummary(summary);
  }, []);

  const registerStudent = async (studentPayload) => {
    try {
      const newStudent = await studentsApi.create(studentPayload);
      await refreshStudents();
      const waitlisted = Object.values(newStudent.enrolment || {}).filter((r) => r === 'WAITLISTED').length;
      showToast(`${newStudent.full_name} (${newStudent.student_id}) didaftarkan dan menunggu kelulusan Supervisor.`
        + (waitlisted ? ` ${waitlisted} kelas penuh: dimasukkan ke senarai menunggu.` : ''));
      return newStudent;
    } catch (err) {
      showToast(err.message || 'Ralat semasa mendaftar pelajar.', 'error');
      throw err;
    }
  };

  // Runs a student lifecycle action (approve, drop, hold, ...) and refreshes affected data
  const studentAction = async (studentId, name, data, successMessage) => {
    try {
      const result = await studentsApi.action(studentId, name, data);
      await refreshStudents();
      if (successMessage) showToast(successMessage);
      return result;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object'
        ? Object.values(err.data).flat().join(' ')
        : '';
      showToast(detail || err.message || 'Ralat semasa mengemaskini pelajar.', 'error');
      throw err;
    }
  };

  // CRM Lead Actions
  const createLead = async (leadPayload) => {
    try {
      const newLead = await leadsApi.create(leadPayload);
      setLeads((prev) => [newLead, ...prev]);
      showToast(`Lead baru berjaya ditambah: ${newLead.student_name}`);
      return newLead;
    } catch (err) {
      showToast(err.message || 'Ralat semasa mencipta lead.', 'error');
      throw err;
    }
  };

  // Runs a lead action (move, lost, activities) and replaces the lead with the server's copy
  const leadAction = async (leadId, name, data, successMessage) => {
    try {
      const updated = await leadsApi.action(leadId, name, data);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
      if (successMessage) showToast(successMessage);
      return updated;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat semasa mengemaskini lead.', 'error');
      throw err;
    }
  };

  const updateLead = async (leadId, data) => {
    try {
      const updated = await leadsApi.update(leadId, data);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
      showToast(`Maklumat lead ${updated.student_name} disimpan.`);
      return updated;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat semasa menyimpan lead.', 'error');
      throw err;
    }
  };

  const convertLeadToStudent = async (leadId, extraData = {}) => {
    try {
      const result = await leadsApi.convertToStudent(leadId, extraData);
      // Refetch leads, students, invoices, summary
      const [allLeads, allStuds, allInvs, summary] = await Promise.all([
        leadsApi.getAll(),
        studentsApi.getAll(),
        billingApi.getInvoices(),
        dashboardApi.getSummary(),
      ]);
      setLeads(allLeads);
      setStudents(allStuds);
      setInvoices(allInvs);
      setDashboardSummary(summary);
      showToast(result.message || 'Lead berjaya ditukar menjadi pelajar rasmi!');
      return result;
    } catch (err) {
      showToast(err.message || 'Ralat semasa mendaftarkan lead.', 'error');
      throw err;
    }
  };

  // Billing Actions
  // Invoices, receipts and students (credit balances) change together
  const refreshBilling = useCallback(async () => {
    const [allInvs, allReceipts, allStuds, summary] = await Promise.all([
      billingApi.getInvoices(),
      billingApi.getReceipts(),
      studentsApi.getAll(),
      dashboardApi.getSummary(),
    ]);
    setInvoices(allInvs);
    setReceipts(allReceipts);
    setStudents(allStuds);
    setDashboardSummary(summary);
  }, []);

  // Runs an invoice action or billing call, refreshes billing, and shows the server's reason on failure
  const billingAction = async (call, successMessage) => {
    try {
      const result = await call();
      await refreshBilling();
      if (successMessage) showToast(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      return result;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat semasa mengemaskini invois.', 'error');
      throw err;
    }
  };

  const payInvoice = async (invoiceId, paymentPayload) => {
    try {
      const receipt = await billingApi.payInvoice(invoiceId, paymentPayload);
      // Refetch invoices, receipts, and dashboard summary
      const [allInvs, allRecs, summary] = await Promise.all([
        billingApi.getInvoices(),
        billingApi.getReceipts(),
        dashboardApi.getSummary(),
      ]);
      setInvoices(allInvs);
      setReceipts(allRecs);
      setDashboardSummary(summary);
      showToast(`Bayaran diterima! Resit Rasmi dikeluarkan: ${receipt.receipt_number}`);
      return receipt;
    } catch (err) {
      showToast(err.message || 'Ralat semasa merekod pembayaran.', 'error');
      throw err;
    }
  };

  // Payment Voucher Actions
  const createVoucher = async (voucherPayload) => {
    try {
      const newPv = await expensesApi.createVoucher(voucherPayload);
      const allVouchers = await expensesApi.getVouchers();
      setVouchers(allVouchers);
      showToast(`Baucar Bayaran berjaya dijana: ${newPv.pv_number} (${newPv.tier_level})`);
      return newPv;
    } catch (err) {
      showToast(err.message || 'Ralat semasa menjana baucar.', 'error');
      throw err;
    }
  };

  const approveVoucher = async (pvId, comment = '') => {
    try {
      const updated = await expensesApi.approveVoucher(pvId, comment);
      setVouchers((prev) => prev.map((v) => (v.id === pvId ? updated : v)));
      showToast(`Baucar ${updated.pv_number} telah diluluskan.`);
      return updated;
    } catch (err) {
      showToast(err.message || 'Ralat semasa meluluskan baucar.', 'error');
      throw err;
    }
  };

  const rejectVoucher = async (pvId, comment) => {
    try {
      const updated = await expensesApi.rejectVoucher(pvId, comment);
      setVouchers((prev) => prev.map((v) => (v.id === pvId ? updated : v)));
      showToast(`Baucar ${updated.pv_number} telah ditolak.`, 'info');
      return updated;
    } catch (err) {
      showToast(err.message || 'Ralat semasa menolak baucar.', 'error');
      throw err;
    }
  };

  // Staff HR: staff (with leave balances) and leave applications change together
  const refreshStaff = useCallback(async () => {
    const [allStaff, allLeaves] = await Promise.all([staffApi.getStaff(), staffApi.getLeaveRequests()]);
    setStaff(allStaff);
    setLeaveRequests(allLeaves);
  }, []);

  // Runs a staff HR call, refreshes staff and leave, and shows the server's reason on failure
  const staffAction = async (call, successMessage) => {
    try {
      const result = await call();
      await refreshStaff();
      const message = typeof successMessage === 'function' ? successMessage(result) : successMessage;
      if (message) showToast(message);
      return result;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat.', 'error');
      throw err;
    }
  };

  // Timetable Actions (Supervisor / Management)
  const refreshTimetable = async () => {
    const [allClasses, summary] = await Promise.all([academicApi.getTimetable(), dashboardApi.getSummary()]);
    setTimetable(allClasses);
    setDashboardSummary(summary);
  };

  const saveClass = async (classId, payload) => {
    try {
      const saved = classId
        ? await academicApi.updateClass(classId, payload)
        : await academicApi.createClass(payload);
      if (saved?.pending_change) {
        // Supervisor: the change waits for Management
        showToast(saved.message || 'Perubahan dihantar untuk kelulusan Management.', 'info');
        return saved;
      }
      await refreshTimetable();
      showToast(classId ? `Sesi ${saved.class_code} dikemaskini.` : `Sesi baharu ${saved.class_code} ditambah.`);
      return saved;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat menyimpan sesi kelas.', 'error');
      throw err;
    }
  };

  const deleteClass = async (classId, classCode) => {
    try {
      const res = await academicApi.deleteClass(classId);
      if (res?.pending_change) {
        showToast(`Permintaan padam ${classCode} dihantar untuk kelulusan Management.`, 'info');
        return res;
      }
      await refreshTimetable();
      showToast(`Sesi ${classCode} dipadam dari jadual.`, 'info');
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat memadam sesi kelas.', 'error');
      throw err;
    }
  };

  // Extra / Cancelled Class Log Actions
  const createReschedule = async (payload) => {
    try {
      const created = await academicApi.createRescheduleLog(payload);
      setReschedules((prev) => [created, ...prev]);
      showToast(created.supervisor_approved
        ? `Rekod gantian ${created.class_code} disimpan & diluluskan.`
        : `Rekod gantian ${created.class_code} dihantar untuk kelulusan Supervisor.`);
      return created;
    } catch (err) {
      showToast(err.message || 'Ralat merekod gantian kelas.', 'error');
      throw err;
    }
  };

  // approve / reject / verify an extra or cancelled class
  const rescheduleAction = async (logId, name, data, successMessage) => {
    try {
      const updated = await academicApi.rescheduleAction(logId, name, data);
      setReschedules((prev) => prev.map((r) => (r.id === logId ? updated : r)));
      if (successMessage) showToast(successMessage);
      return updated;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat mengemaskini gantian kelas.', 'error');
      throw err;
    }
  };

  const markRescheduleNotified = async (logId) => {
    try {
      const updated = await academicApi.updateRescheduleLog(logId, { whatsapp_notification_sent: true });
      setReschedules((prev) => prev.map((r) => (r.id === logId ? updated : r)));
      return updated;
    } catch (err) {
      showToast(err.message || 'Ralat mengemaskini status notis.', 'error');
      throw err;
    }
  };

  const refreshTeachers = async () => {
    setTeachers(await staffApi.getTeachers());
  };

  // Lesson Handout Actions
  const createHandout = async (handoutPayload) => {
    try {
      const newHnd = await academicApi.createHandout(handoutPayload);
      setHandouts((prev) => [newHnd, ...prev]);
      showToast(`Modul/Handout berjaya dimuat naik: ${newHnd.handout_id}`);
      return newHnd;
    } catch (err) {
      showToast(err.message || 'Ralat memuat naik handout.', 'error');
      throw err;
    }
  };

  const recordPrint = async (handoutId, copies) => {
    try {
      const updated = await academicApi.recordPrint(handoutId, copies);
      setHandouts((prev) => prev.map((h) => (h.id === handoutId ? updated : h)));
      showToast(`Cetakan direkod: ${copies} salinan untuk ${updated.handout_id}`);
      return updated;
    } catch (err) {
      showToast(err.message || 'Ralat merekod cetakan.', 'error');
      throw err;
    }
  };

  // Cross-Navigation Helper
  const navigateTo = (tabName, payload = null) => {
    if (payload) setDraftRegistration(payload);
    setActiveTab(tabName);
    window.location.hash = `/${routeOf(tabName)}`;
  };

  const value = {
    // Session
    user,
    currentRole: user?.role || null,
    authChecked,
    login,
    logout,

    // Navigation & Notifications
    activeTab,
    setActiveTab,
    navigateTo,
    showToast,
    draftRegistration,
    setDraftRegistration,
    isLoading,
    refreshAllData,

    // Data States
    masterData,
    students,
    leads,
    invoices,
    receipts,
    vouchers,
    vendors,
    timetable,
    timeSlots,
    classrooms,
    subjects,
    setSubjects,
    setPricingTiers,
    reschedules,
    handouts,
    teachers,
    staff,
    leaveRequests,
    dashboardSummary,
    pricingTiers,

    // Dynamic Master Data Operations
    getMasterOptions,
    proposeMasterData,
    approveMasterData,
    updateMasterData,
    rejectMasterData,

    // Operations
    registerStudent,
    refreshStudents,
    studentAction,
    createLead,
    leadAction,
    updateLead,
    convertLeadToStudent,
    payInvoice,
    billingAction,
    refreshBilling,
    createVoucher,
    approveVoucher,
    rejectVoucher,
    refreshStaff,
    staffAction,
    createHandout,
    recordPrint,
    saveClass,
    deleteClass,
    createReschedule,
    rescheduleAction,
    refreshTimetable,
    markRescheduleNotified,
    refreshTeachers,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
