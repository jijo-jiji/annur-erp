import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CURRENT_MONTH } from './data/demo';
import { createDemoData } from './data/generate';
import { todayISO } from './lib/format';
import { buildInvoice, enrolledCounts, nextNumber, voucherTier } from './lib/domain';

const STORAGE_KEY = 'annur-demo-v2';
const StoreContext = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore corrupt / unavailable storage
  }
  return createDemoData();
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(load);
  const ref = useRef(data);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full / disabled: demo still works in memory
    }
  }, [data]);

  // Apply a pure transition to the latest state (chains correctly across
  // back-to-back calls) and let actions return what they created.
  const commit = useCallback((fn) => {
    ref.current = fn(ref.current);
    setData(ref.current);
  }, []);

  const actions = useMemo(() => {
    const invoiceArgs = (d) => ({ tiers: d.pricingTiers, settings: d.settings, rules: d.discounts });

    return {
      registerStudent(form, { source = 'KAUNTER', waitlist = [] } = {}) {
        const d = ref.current;
        const id = nextNumber(d.students.map((s) => s.id), 'AN-2026-', 3);
        const student = {
          ...form,
          id,
          type: 'MONTHLY',
          status: 'ACTIVE',
          joined: todayISO(),
          source,
          discounts: [],
          checklist: { L: false, TEL: false, SP: false, AT: false, SY: false },
        };
        const invoice = buildInvoice({
          no: nextNumber(d.invoices.map((i) => i.no), 'INV-2026-', 4),
          student,
          students: [...d.students, student],
          month: CURRENT_MONTH,
          withRegFee: true,
          ...invoiceArgs(d),
        });
        let wid = Math.max(0, ...d.waitlist.map((w) => w.id));
        const waits = waitlist.map((classId) => ({ id: ++wid, classId, studentId: id, added: todayISO() }));
        commit((d) => ({
          ...d,
          students: [student, ...d.students],
          invoices: [invoice, ...d.invoices],
          waitlist: [...d.waitlist, ...waits],
        }));
        return { student, invoice };
      },

      updateStudent(id, patch) {
        commit((d) => ({ ...d, students: d.students.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
      },

      recordPayment(invoiceNo, { amount, method, ref: payRef, date, by }) {
        const d = ref.current;
        const inv = d.invoices.find((i) => i.no === invoiceNo);
        const receipt = {
          no: nextNumber(d.receipts.map((r) => r.no), 'REC-2026-', 4),
          invoiceNo,
          amount,
          date,
          method,
          ref: payRef,
          by,
        };
        commit((d) => ({
          ...d,
          receipts: [receipt, ...d.receipts],
          invoices: d.invoices.map((i) => (i.no === invoiceNo ? { ...i, paid: i.paid + amount, receipt: receipt.no } : i)),
          // Paying fees completes the "SY" (sistem yuran) office checklist item
          students: d.students.map((s) => (s.id === inv?.studentId ? { ...s, checklist: { ...s.checklist, SY: true } } : s)),
        }));
        return receipt;
      },

      // Create a month's invoices for every active student who doesn't have one yet
      runMonthlyInvoices(month) {
        const d = ref.current;
        const have = new Set(d.invoices.filter((i) => i.month === month).map((i) => i.studentId));
        const created = [];
        let last = d.invoices.map((i) => i.no);
        for (const s of d.students) {
          if (s.status !== 'ACTIVE' || have.has(s.id) || s.classes.length === 0) continue;
          const no = nextNumber(last, 'INV-2026-', 4);
          last = [...last, no];
          created.push(buildInvoice({ no, student: s, students: d.students, month, withRegFee: false, ...invoiceArgs(d) }));
        }
        commit((d) => ({ ...d, invoices: [...[...created].reverse(), ...d.invoices] }));
        return created;
      },

      warnArrears(studentId) {
        commit((d) => ({ ...d, arrearsWarnings: { ...d.arrearsWarnings, [studentId]: todayISO() } }));
      },

      addReschedule(entry) {
        commit((d) => ({
          ...d,
          reschedules: [{ ...entry, id: Math.max(0, ...d.reschedules.map((r) => r.id)) + 1 }, ...d.reschedules],
        }));
      },

      updateReschedule(id, patch) {
        commit((d) => ({ ...d, reschedules: d.reschedules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
      },

      addVoucher(pv) {
        const d = ref.current;
        const [y, m] = pv.date.split('-');
        const tier = voucherTier(pv.amount);
        const created = {
          ...pv,
          no: nextNumber(d.vouchers.map((v) => v.no), `PV${y.slice(2)}-${m}`, 2),
          // Tier 1 is verified by the counter admin on entry; higher tiers wait for approval
          status: tier === 1 ? 'VERIFIED' : 'PENDING',
          approvedBy: tier === 1 ? pv.preparedBy : '',
        };
        commit((d) => ({ ...d, vouchers: [created, ...d.vouchers] }));
        return created;
      },

      updateVoucher(no, patch) {
        commit((d) => ({ ...d, vouchers: d.vouchers.map((v) => (v.no === no ? { ...v, ...patch } : v)) }));
      },

      addToWaitlist(classId, studentId) {
        commit((d) => ({
          ...d,
          waitlist: [...d.waitlist, { id: Math.max(0, ...d.waitlist.map((w) => w.id)) + 1, classId, studentId, added: todayISO() }],
        }));
      },

      removeFromWaitlist(id) {
        commit((d) => ({ ...d, waitlist: d.waitlist.filter((w) => w.id !== id) }));
      },

      // Move a waiting student into the class (replacing another section of the same subject)
      enrollFromWaitlist(id) {
        commit((d) => {
          const w = d.waitlist.find((x) => x.id === id);
          const cls = d.classes.find((c) => c.id === w.classId);
          return {
            ...d,
            waitlist: d.waitlist.filter((x) => x.id !== id),
            students: d.students.map((s) =>
              s.id === w.studentId
                ? { ...s, classes: [...s.classes.filter((cid) => d.classes.find((c) => c.id === cid)?.subject !== cls.subject), cls.id] }
                : s,
            ),
          };
        });
      },

      saveAttendance(record) {
        commit((d) => ({
          ...d,
          attendance: [...d.attendance.filter((a) => !(a.classId === record.classId && a.date === record.date)), record],
        }));
      },

      saveResults(record) {
        commit((d) => ({
          ...d,
          results: [...d.results.filter((r) => !(r.classId === record.classId && r.examId === record.examId)), record],
        }));
      },

      addSubject(subject) {
        commit((d) => ({ ...d, subjects: [...d.subjects, { ...subject, active: true }] }));
      },

      updateSubject(code, patch) {
        commit((d) => ({ ...d, subjects: d.subjects.map((s) => (s.code === code ? { ...s, ...patch } : s)) }));
      },

      saveTiers(pricingTiers) {
        commit((d) => ({ ...d, pricingTiers }));
      },

      saveSettings(settings) {
        commit((d) => ({ ...d, settings }));
      },

      saveDiscounts(discounts) {
        commit((d) => ({ ...d, discounts }));
      },

      reset() {
        commit(() => createDemoData());
      },
    };
  }, [commit]);

  const value = useMemo(() => {
    // Seat counts are always derived from the students actually enrolled
    const counts = enrolledCounts(data.students);
    const waiting = {};
    for (const w of data.waitlist) waiting[w.classId] = (waiting[w.classId] ?? 0) + 1;
    const classes = data.classes.map((c) => ({ ...c, enrolled: counts[c.id] ?? 0, waiting: waiting[c.id] ?? 0 }));
    return { ...data, classes, ...actions };
  }, [data, actions]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}
