import { useState } from 'react';
import { BarChart3, CalendarClock, Check, ChevronRight, UserPlus, Wallet } from 'lucide-react';
import { CURRENT_MONTH } from '../data/demo';
import { useStore } from '../store';
import { addMonths, arrearsCases, canApproveVoucher, invoiceBalance, invoiceStatus, timetableDay } from '../lib/domain';
import { CHECKLIST, monthLabel, rm, todayISO } from '../lib/format';
import { Button, Card, cx, PageHeader, Segmented, Stat } from './ui';
import DashboardDetailed from './DashboardDetailed';

// Simplified dashboards (default). Every dashboard answers two questions only:
//   1. Is everything okay?            → three tiles
//   2. What do I need to do now?      → one action list, most urgent first
// Detail lives on the module pages; rows here link to them.

// Each user picks the layout they prefer; remembered in this browser.
const VIEW_KEY = 'annur-dashboard-view';

function loadView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'detailed' ? 'detailed' : 'simple';
  } catch {
    return 'simple';
  }
}

export default function DashboardView({ role }) {
  const [view, setView] = useState(loadView);
  const toggle = (
    <Segmented
      value={view}
      onChange={(v) => {
        setView(v);
        try {
          localStorage.setItem(VIEW_KEY, v);
        } catch {
          // preference just won't persist
        }
      }}
      items={[
        { value: 'simple', label: 'Ringkas' },
        { value: 'detailed', label: 'Terperinci' },
      ]}
    />
  );

  if (view === 'detailed') return <DashboardDetailed role={role} toggle={toggle} />;
  if (role === 'MANAGEMENT') return <ManagementDashboard role={role} toggle={toggle} />;
  if (role === 'SUPERVISOR') return <SupervisorDashboard role={role} toggle={toggle} />;
  return <AdminDashboard toggle={toggle} />;
}

// ---- Shared -------------------------------------------------------------------

const TONE = { red: 0, amber: 1, blue: 2 };
const DOT = { red: 'bg-red-600', amber: 'bg-amber-500', blue: 'bg-sky-500' };

// items: [{ key, count, tone, title, detail, href, action, done }]
// Items with count 0 are "all clear" and are summarised in one quiet line.
function ActionList({ items }) {
  const open = items.filter((i) => i.count > 0).sort((a, b) => TONE[a.tone] - TONE[b.tone]);
  const clear = items.filter((i) => i.count === 0);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Perlu tindakan</h2>
        <span className="text-[13px] text-gray-500">{open.length ? `${open.length} perkara` : 'Semua beres'}</span>
      </div>
      {open.length === 0 ? (
        <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-gray-500">
          <Check className="size-4 text-brand-600" /> Tiada tindakan tertunggak.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {open.map((i) => (
            <li key={i.key}>
              <a href={i.href} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50">
                <span className={cx('size-2 shrink-0 rounded-full', DOT[i.tone])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{i.title}</p>
                  {i.detail && <p className="truncate text-[13px] text-gray-500">{i.detail}</p>}
                </div>
                <span className="hidden shrink-0 text-sm font-medium text-brand-700 group-hover:text-brand-900 sm:inline">{i.action}</span>
                <ChevronRight className="size-4 shrink-0 text-gray-400 group-hover:text-gray-600" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
      {clear.length > 0 && (
        <p className="flex items-start gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3 text-[13px] text-gray-500">
          <Check className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
          <span>{clear.map((i) => i.done).join(' · ')}</span>
        </p>
      )}
    </Card>
  );
}

function useCommon() {
  const store = useStore();
  const { students, invoices, classes, attendance, waitlist, settings } = store;
  const today = todayISO();
  const active = students.filter((s) => s.status === 'ACTIVE');
  const monthInv = invoices.filter((i) => i.month === CURRENT_MONTH);
  const unpaidMonth = monthInv.filter((i) => invoiceStatus(i) !== 'PAID');
  const arrears = arrearsCases(students, invoices, settings.unpaidMonthsLimit);
  const todayClasses = classes.filter((c) => c.day === timetableDay(today));
  const takenToday = todayClasses.filter((c) => attendance.some((a) => a.classId === c.id && a.date === today));
  const seatOffers = waitlist.filter((w) => {
    const c = classes.find((x) => x.id === w.classId);
    const s = students.find((x) => x.id === w.studentId);
    return c && c.enrolled < c.max && s?.status === 'ACTIVE';
  });
  const overCapacity = classes.filter((c) => c.enrolled > c.max);
  const newThisMonth = students.filter((s) => s.joined.startsWith(CURRENT_MONTH)).length;
  return { ...store, today, active, monthInv, unpaidMonth, arrears, todayClasses, takenToday, seatOffers, overCapacity, newThisMonth };
}

const plural = (n, word) => `${n} ${word}`;

// ---- Admin Kaunter ------------------------------------------------------------

function AdminDashboard({ toggle }) {
  const { active, monthInv, unpaidMonth, arrears, todayClasses, takenToday, seatOffers, newThisMonth, students, today, settings } = useCommon();
  const paidCount = monthInv.length - unpaidMonth.length;
  const incomplete = active.filter((s) => CHECKLIST.some((c) => !s.checklist[c.key]));
  const newQr = students.filter((s) => s.source === 'QR' && s.status === 'ACTIVE' && !s.checklist.SY);
  const dueDate = monthInv[0]?.dueDate;
  const overdue = dueDate && dueDate < today;

  const items = [
    {
      key: 'arrears', count: arrears.length, tone: 'red', action: 'Hantar amaran', href: '#/billing?tab=arrears',
      title: `${plural(arrears.length, 'pelajar')} tertunggak yuran ${settings.unpaidMonthsLimit} bulan atau lebih`,
      detail: arrears.slice(0, 3).map((c) => c.student.name).join(', ') + (arrears.length > 3 ? ` dan ${arrears.length - 3} lagi` : ''),
      done: 'Tiada tunggakan melebihi had',
    },
    {
      key: 'seats', count: seatOffers.length, tone: 'amber', action: 'Tawarkan', href: '#/timetable',
      title: `${plural(seatOffers.length, 'kerusi')} kosong untuk pelajar dalam senarai menunggu`,
      detail: 'Masukkan pelajar ke kelas dari jadual',
      done: 'Tiada kerusi untuk ditawarkan',
    },
    {
      key: 'unpaid', count: unpaidMonth.length, tone: overdue ? 'amber' : 'blue', action: 'Lihat', href: '#/billing',
      title: `${plural(unpaidMonth.length, 'invois')} ${monthLabel(CURRENT_MONTH)} belum dibayar`,
      detail: overdue ? 'Telah melepasi tarikh akhir — hantar peringatan dari halaman yuran' : 'Belum melepasi tarikh akhir',
      done: `Semua yuran ${monthLabel(CURRENT_MONTH)} dikutip`,
    },
    {
      key: 'attendance', count: todayClasses.length - takenToday.length, tone: 'blue', action: 'Ambil', href: '#/attendance',
      title: `${plural(todayClasses.length - takenToday.length, 'kelas')} hari ini belum diambil kedatangan`,
      done: todayClasses.length ? 'Kedatangan hari ini lengkap' : 'Tiada kelas hari ini',
    },
    {
      key: 'qr', count: newQr.length, tone: 'blue', action: 'Semak', href: '#/parent-qr',
      title: `${plural(newQr.length, 'pendaftaran')} QR baharu menunggu pengesahan`,
      done: 'Tiada pendaftaran QR baharu',
    },
    {
      key: 'checklist', count: incomplete.length, tone: 'blue', action: 'Lihat', href: '#/students',
      title: `${plural(incomplete.length, 'pelajar')} belum lengkap semakan pejabat`,
      detail: 'Ledger, kumpulan WhatsApp, senarai pelajar, kedatangan, sistem yuran',
      done: 'Semakan pejabat lengkap',
    },
  ];

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description={`${monthLabel(CURRENT_MONTH)} · kaunter`}
        actions={
          <>
            {toggle}
            <Button as="a" href="#/billing" icon={Wallet}>
              Rekod bayaran
            </Button>
            <Button as="a" href="#/students?new" variant="primary" icon={UserPlus}>
              Daftar pelajar
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Pelajar aktif" value={active.length} hint={`${newThisMonth} baharu bulan ini`} />
        <Stat
          label={`Yuran ${monthLabel(CURRENT_MONTH)} dijelaskan`}
          value={`${monthInv.length ? Math.round((paidCount / monthInv.length) * 100) : 0}%`}
          hint={`${paidCount} daripada ${monthInv.length} invois`}
        />
        <Stat label="Kedatangan hari ini" value={`${takenToday.length}/${todayClasses.length}`} hint="kelas telah diambil" />
      </div>
      <ActionList items={items} />
    </>
  );
}

// ---- Supervisor Akademik --------------------------------------------------------

function SupervisorDashboard({ role, toggle }) {
  const { classes, reschedules, vouchers, attendance, exams, results, overCapacity, seatOffers, todayClasses, takenToday, today } = useCommon();
  const pendingRes = reschedules.filter((r) => !r.approved);
  const myVouchers = vouchers.filter((v) => v.status === 'PENDING' && canApproveVoucher(role, v.amount));

  // attendance rate over the last 7 days
  const weekAgo = new Date(`${today}T00:00:00`);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const since = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;
  const recent = attendance.filter((a) => a.date >= since && a.date < today);
  let seats = 0;
  let absent = 0;
  for (const a of recent) {
    seats += a.roster?.length ?? classes.find((c) => c.id === a.classId)?.enrolled ?? 0;
    absent += a.absent.length;
  }
  const attRate = seats ? Math.round(((seats - absent) / seats) * 100) : null;

  const lastExam = [...exams].reverse().find((e) => results.some((r) => r.examId === e.id));
  const marks = lastExam ? results.filter((r) => r.examId === lastExam.id).flatMap((r) => Object.values(r.marks)) : [];
  const avg = marks.length ? Math.round(marks.reduce((a, b) => a + b, 0) / marks.length) : null;
  const full = classes.filter((c) => c.enrolled >= c.max).length;

  const items = [
    {
      key: 'over', count: overCapacity.length, tone: 'red', action: 'Lihat jadual', href: '#/timetable',
      title: `${plural(overCapacity.length, 'kelas')} melebihi had kerusi`,
      detail: 'Pertimbang membuka seksyen baharu',
      done: 'Tiada kelas melebihi had',
    },
    {
      key: 'reschedules', count: pendingRes.length, tone: 'amber', action: 'Sahkan', href: '#/reschedules',
      title: `${plural(pendingRes.length, 'pembatalan / gantian kelas')} menunggu pengesahan`,
      detail: 'Pelajar hanya dimaklumkan selepas disahkan',
      done: 'Tiada gantian kelas menunggu',
    },
    {
      key: 'vouchers', count: myVouchers.length, tone: 'amber', action: 'Semak', href: '#/vouchers',
      title: `${plural(myVouchers.length, 'baucar')} menunggu kelulusan anda`,
      detail: myVouchers.map((v) => `${v.vendor} ${rm(v.amount)}`).join(', '),
      done: 'Tiada baucar menunggu kelulusan',
    },
    {
      key: 'seats', count: seatOffers.length, tone: 'blue', action: 'Tawarkan', href: '#/timetable',
      title: `${plural(seatOffers.length, 'kerusi')} kosong untuk pelajar dalam senarai menunggu`,
      done: 'Tiada kerusi untuk ditawarkan',
    },
    {
      key: 'attendance', count: todayClasses.length - takenToday.length, tone: 'blue', action: 'Lihat', href: '#/attendance',
      title: `${plural(todayClasses.length - takenToday.length, 'kelas')} hari ini belum diambil kedatangan`,
      done: todayClasses.length ? 'Kedatangan hari ini lengkap' : 'Tiada kelas hari ini',
    },
  ];

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description="Akademik · minggu ini"
        actions={
          <>
            {toggle}
            <Button as="a" href="#/reschedules" icon={CalendarClock}>
              Batal & ganti kelas
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Kelas mingguan" value={classes.length} hint={`${full} penuh atau melebihi had`} />
        <Stat label="Kedatangan 7 hari lepas" value={attRate != null ? `${attRate}%` : '—'} hint={`${recent.length} sesi direkod`} />
        <Stat label={lastExam ? `Purata ${lastExam.name}` : 'Purata ujian'} value={avg != null ? `${avg}%` : '—'} hint={`${marks.length} keputusan`} />
      </div>
      <ActionList items={items} />
    </>
  );
}

// ---- Pengurusan -----------------------------------------------------------------

function ManagementDashboard({ role, toggle }) {
  const { invoices, vouchers, students, monthInv, arrears, overCapacity, active, newThisMonth } = useCommon();
  const billed = monthInv.reduce((a, i) => a + i.total - i.discount, 0);
  const collected = monthInv.reduce((a, i) => a + i.paid, 0);
  const outstanding = invoices.filter((i) => i.month <= CURRENT_MONTH).reduce((a, i) => a + invoiceBalance(i), 0);
  const myVouchers = vouchers.filter((v) => v.status === 'PENDING' && canApproveVoucher(role, v.amount));
  const nextMonth = addMonths(CURRENT_MONTH, 1);
  const nextRunDone = invoices.some((i) => i.month === nextMonth);
  const leftThisMonth = students.filter((s) => s.left?.startsWith(CURRENT_MONTH)).length;

  const items = [
    {
      key: 'vouchers', count: myVouchers.length, tone: 'amber', action: 'Semak', href: '#/vouchers',
      title: `${plural(myVouchers.length, 'baucar')} menunggu kelulusan anda`,
      detail: `${rm(myVouchers.reduce((a, v) => a + v.amount, 0))} · ${myVouchers.map((v) => v.vendor).join(', ')}`,
      done: 'Tiada baucar menunggu kelulusan',
    },
    {
      key: 'arrears', count: arrears.length, tone: 'red', action: 'Lihat', href: '#/billing?tab=arrears',
      title: `${plural(arrears.length, 'pelajar')} tertunggak melebihi had`,
      detail: `${rm(arrears.reduce((a, c) => a + c.amount, 0))} tertunggak · kaunter mengurus amaran`,
      done: 'Tiada tunggakan melebihi had',
    },
    {
      key: 'capacity', count: overCapacity.length, tone: 'amber', action: 'Lihat jadual', href: '#/timetable',
      title: `${plural(overCapacity.length, 'kelas')} melebihi had kerusi`,
      detail: 'Permintaan tinggi — pertimbang membuka seksyen baharu',
      done: 'Kapasiti kelas terkawal',
    },
    {
      key: 'run', count: nextRunDone ? 0 : 1, tone: 'blue', action: 'Jana', href: '#/billing',
      title: `Invois ${monthLabel(nextMonth)} belum dijana`,
      detail: `Jana sebelum 1 ${monthLabel(nextMonth).split(' ')[0]}`,
      done: `Invois ${monthLabel(nextMonth)} telah dijana`,
    },
  ];

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description={`${monthLabel(CURRENT_MONTH)} · pengurusan`}
        actions={
          <>
            {toggle}
            <Button as="a" href="#/reports" icon={BarChart3}>
              Laporan penuh
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={`Kutipan ${monthLabel(CURRENT_MONTH)}`} value={rm(collected)} hint={`${billed ? Math.round((collected / billed) * 100) : 0}% daripada ${rm(billed)}`} />
        <Stat label="Tunggakan" value={rm(outstanding)} hint="Semua bulan sehingga kini" tone={outstanding ? 'red' : undefined} />
        <Stat label="Pelajar aktif" value={active.length} hint={`${newThisMonth} baharu · ${leftThisMonth} berhenti bulan ini`} />
      </div>
      <ActionList items={items} />
    </>
  );
}
