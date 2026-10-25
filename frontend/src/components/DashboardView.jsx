import { ringgit, THRESHOLDS } from '../lib/thresholds';
import { useEffect, useState } from 'react';
import { BarChart3, CalendarClock, Check, ChevronRight, UserPlus, Wallet } from 'lucide-react';
import { dashboardApi } from '../api/client';
import { routeOf } from '../context/AppContext';
import { can } from '../lib/permissions';
import { attendanceHref, classesHref, invoicesHref, leadsHref, monthEnd, monthKey, receiptsHref, studentsHref, teachersHref, voucherHref, vouchersHref } from '../lib/drilldown';
import { CURRENT_MONTH, date, DAY_LABEL, monthLabel, rm } from '../lib/format';
import { Donut, STATUS_COLORS } from './Donut';
import { BarChart, HBarList, Legend, SERIES_COLORS } from './charts';
import { Badge, Button, Card, CardHeader, cx, EmptyState, PageHeader, Segmented, Stat } from './ui';

// Two layouts over the same server summary:
//   Ringkas     — is everything okay (three tiles) and what needs doing now (one list)
//   Terperinci  — every figure and chart for the role
// Each user picks the layout they prefer; remembered in this browser.
const VIEW_KEY = 'annur-dashboard-view';

function loadView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'detailed' ? 'detailed' : 'simple';
  } catch {
    return 'simple';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const INVOICE_STATUS = [
  ['PAID', 'Selesai bayar', STATUS_COLORS.good],
  ['PARTIAL', 'Sebahagian', STATUS_COLORS.warning],
  ['UNPAID', 'Belum bayar', STATUS_COLORS.serious],
  ['OVERDUE', 'Tertunggak', STATUS_COLORS.critical],
];

// What needs attention, most urgent first. Only what the role can act on or should know.
// Where each kind of change request is handled
const REQUEST_PAGES = {
  SUBJECT: { name: 'subjek', tab: 'settings', query: '' },
  VENDOR: { name: 'pembekal', tab: 'expenses', query: '?tab=vendors' },
  EXPENSE_CATEGORY: { name: 'kategori perbelanjaan', tab: 'expenses', query: '?tab=categories' },
  TEACHER: { name: 'guru', tab: 'teachers', query: '?tab=requests' },
  TIME_SLOT: { name: 'slot masa', tab: 'settings', query: '?tab=schedule' },
  CLASSROOM: { name: 'bilik darjah', tab: 'settings', query: '?tab=schedule' },
  CLOSED_DATE: { name: 'tarikh tutup', tab: 'settings', query: '?tab=schedule' },
  PRICING_TIER: { name: 'pakej yuran', tab: 'settings', query: '?tab=pricing' },
  DISCOUNT: { name: 'diskaun', tab: 'settings', query: '?tab=discounts' },
  EXPENSE_SUBCATEGORY: { name: 'subkategori perbelanjaan', tab: 'expenses', query: '?tab=categories' },
  RECEIPT: { name: 'resit', tab: 'billing', query: '?tab=corrections' },
  INVOICE: { name: 'invois', tab: 'billing', query: '?tab=corrections' },
};

function buildNotices(data, role) {
  const { classes, finance, approvals, attendance, teachers, staff, counter } = data;
  const approver = role !== 'ADMIN';
  const management = role === 'MANAGEMENT';
  const out = [];
  const add = (count, tone, title, tab, action = 'Lihat', detail, href) => {
    if (count) out.push({ key: `${tab}-${out.length}`, tone, title, href: href ?? `#/${routeOf(tab)}`, action, detail });
  };

  add(classes.over.length, 'red', `${classes.over.length} kelas melebihi had kerusi`, 'timetable', 'Lihat jadual', classes.over.map((c) => c.class_code).join(', '),
    classesHref({ capacity: 'over' }, { expect: classes.over.length }));
  if (management) {
    add(approvals.vouchers_pending_management, 'red', `${approvals.vouchers_pending_management} baucar melebihi ${ringgit(THRESHOLDS.voucher_tier2)} menunggu kelulusan anda`, 'expenses', 'Semak', undefined,
      vouchersHref({ status: 'PENDING_MANAGEMENT' }, { expect: approvals.vouchers_pending_management }));
  }
  attendance.low_classes.forEach((c) => add(1, 'red', `Kehadiran ${c.class_code} ${c.rate}% dalam ${attendance.window_days} hari lepas`, 'attendance', 'Lihat', `${c.present}/${c.total} kehadiran`,
    attendanceHref({ class_id: c.class_id, from: attendance.start, to: attendance.end }, { expect: c.rate, unit: 'rate' })));
  // Tutup kaunter harian: a day with takings left unclosed, a close sent back for a recount, a close to verify
  (counter?.unclosed_days || []).forEach((d) => add(1, 'red', `Kaunter ${date(d)} belum ditutup`, 'counter', 'Tutup kaunter', 'Ada resit pada hari itu', `#/counter?date=${d}`));
  add(counter?.returned, 'red', `${counter?.returned} tutup kaunter dikembalikan untuk dikira semula`, 'counter', 'Kira semula');
  if (approver) add(counter?.to_verify, 'amber', `${counter?.to_verify} tutup kaunter menunggu semakan anda`, 'counter', 'Semak');
  if (approver) add(approvals.fee_followups_open, 'amber', `${approvals.fee_followups_open} yuran perlu dihubungi (minggu 5)`, 'billing', 'Hubungi', 'Belum dibayar selepas peringatan minggu 2 hingga 4', '#/billing?tab=arrears');
  add(approvals.registrations_pending, 'amber', `${approvals.registrations_pending} pendaftaran pelajar menunggu kelulusan`, 'students', approver ? 'Luluskan' : 'Lihat', undefined, '#/students?tab=approvals');
  // these students, with the same rule the number uses
  add(approvals.monthly_invoices_pending, 'amber', `${approvals.monthly_invoices_pending} pelajar aktif belum ada invois ${monthLabel(CURRENT_MONTH)}`, 'billing', 'Jana invois', undefined,
    studentsHref({ uninvoiced: data.today.slice(0, 7) }, { expect: approvals.monthly_invoices_pending }));
  add(finance.outstanding > 0 ? 1 : 0, 'amber', `Tunggakan yuran ${rm(finance.outstanding)}`, 'billing', 'Susulan', undefined,
    invoicesHref({ status: 'OUTSTANDING' }, { expect: finance.outstanding, unit: 'balance' }));
  add(approvals.lead_followups_due, 'amber', `${approvals.lead_followups_due} prospek perlu susulan`, 'leads', 'Hubungi', 'Tarikh susulan hari ini atau lepas',
    leadsHref({ due: '1' }, { expect: approvals.lead_followups_due }));
  add(classes.full.length, 'amber', `${classes.full.length} kelas penuh`, 'timetable', 'Lihat jadual', undefined, classesHref({ capacity: 'full' }, { expect: classes.full.length }));
  // Change requests: what waits for this role, what the user asked, and decisions not yet read; each links to its page
  const requestNotices = (byKind, tone, text, action) => Object.entries(byKind || {}).forEach(([kind, n]) => {
    const page = REQUEST_PAGES[kind];
    if (n && page) out.push({ key: `cr-${tone}-${text(n, page.name)}`, tone, title: text(n, page.name), href: `#/${routeOf(page.tab)}${page.query}`, action });
  });
  requestNotices(approvals.change_requests_to_decide_by_kind, 'amber', (n, name) => `${n} permohonan perubahan ${name} menunggu kelulusan anda`, 'Semak');
  requestNotices(approvals.change_requests_mine_by_kind, 'blue', (n, name) => `${n} permohonan perubahan ${name} anda menunggu kelulusan`, 'Lihat');
  requestNotices(approvals.change_requests_unseen_by_kind, 'blue', (n, name) => `${n} keputusan baharu pada permohonan perubahan ${name} anda`, 'Lihat');
  if (approver) {
    add(approvals.vouchers_pending_supervisor, 'amber', `${approvals.vouchers_pending_supervisor} baucar ${ringgit(THRESHOLDS.voucher_tier1)} hingga ${ringgit(THRESHOLDS.voucher_tier2)} menunggu kelulusan`, 'expenses', 'Semak', undefined,
      vouchersHref({ status: 'PENDING_SUPERVISOR' }, { expect: approvals.vouchers_pending_supervisor }));
    add(approvals.reschedules_pending, 'amber', `${approvals.reschedules_pending} rekod batal / ganti kelas menunggu kelulusan`, 'reschedules', 'Luluskan');
    add(approvals.leave_pending, 'amber', `${approvals.leave_pending} permohonan cuti staf menunggu kelulusan`, 'staff_hr', 'Semak');
    add(approvals.master_data_pending, 'blue', `${approvals.master_data_pending} cadangan data induk menunggu kelulusan`, 'dynamic_master_data', 'Semak');
    add(approvals.teacher_pay_to_verify, 'blue', `${approvals.teacher_pay_to_verify} bayaran elaun guru menunggu pengesahan supervisor`, 'teacher_payroll', 'Sahkan');
    (staff?.contracts_ending || []).forEach((c) => add(1, c.days_left < 0 ? 'red' : 'amber',
      `Kontrak ${c.name} ${c.days_left < 0 ? `tamat ${-c.days_left} hari lepas` : `tamat dalam ${c.days_left} hari`}`, 'staff_hr', 'Lihat', date(c.contract_end)));
    teachers.permits_expiring.forEach((p) => add(1, p.days_left < 0 ? 'red' : 'amber',
      `Permit mengajar ${p.name} ${p.days_left < 0 ? 'telah luput' : `luput dalam ${p.days_left} hari`}`, 'teachers', 'Lihat', date(p.expiry),
      teachersHref({ code: p.code }, { expect: 1 })));
    (staff?.birthdays || []).forEach((b) => add(1, 'blue', `Hari lahir ${b.name} ${b.days_left === 0 ? 'hari ini' : `dalam ${b.days_left} hari`}`, 'staff_hr', 'Lihat'));
  } else {
    const waiting = approvals.vouchers_pending_supervisor + approvals.vouchers_pending_management;
    add(waiting, 'blue', `${waiting} baucar sedang menunggu kelulusan`, 'expenses', 'Lihat', undefined, vouchersHref({ status: 'PENDING' }, { expect: waiting }));
    add(approvals.reschedules_pending, 'blue', `${approvals.reschedules_pending} rekod batal / ganti kelas menunggu kelulusan supervisor`, 'reschedules');
    add(approvals.master_data_pending, 'blue', `${approvals.master_data_pending} cadangan data induk menunggu kelulusan`, 'dynamic_master_data');
  }
  if (management) {
    add(approvals.teacher_pay_to_approve, 'amber', `${approvals.teacher_pay_to_approve} bayaran elaun guru menunggu kelulusan anda`, 'teacher_payroll', 'Luluskan');
    add(approvals.timetable_changes_pending, 'amber', `${approvals.timetable_changes_pending} perubahan jadual induk menunggu kelulusan anda`, 'timetable', 'Semak');
    add(approvals.rate_increments_pending, 'amber', `${approvals.rate_increments_pending} cadangan kenaikan kadar guru menunggu kelulusan`, 'teachers', 'Semak');
    add(approvals.reschedules_to_verify, 'blue', `${approvals.reschedules_to_verify} kelas ganti / tambahan menunggu pengesahan anda`, 'reschedules', 'Sahkan');
  }
  add(approvals.teacher_pay_to_record, 'blue', `${approvals.teacher_pay_to_record} bayaran elaun guru diluluskan, belum direkod dibayar`, 'teacher_payroll', 'Rekod');
  add(approvals.waitlist_waiting, 'blue', `${approvals.waitlist_waiting} pelajar dalam senarai menunggu`, 'students', 'Lihat', undefined, '#/students?tab=waitlist');
  add(classes.near_full.length, 'blue', `${classes.near_full.length} kelas hampir penuh`, 'timetable', 'Lihat jadual', 'Baki dua kerusi atau kurang',
    classesHref({ capacity: 'near' }, { expect: classes.near_full.length }));

  const order = { red: 0, amber: 1, blue: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

const DOT = { red: 'bg-red-600', amber: 'bg-amber-500', blue: 'bg-sky-500' };

function ActionList({ items, limit }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? items.slice(0, limit) : items;
  return (
    <Card id="perlu-tindakan" className="scroll-mt-4">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Perlu tindakan</h2>
        <span className="text-[13px] text-gray-500">{items.length ? `${items.length} perkara` : 'Semua beres'}</span>
      </div>
      {items.length === 0 ? (
        <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-gray-500">
          <Check className="size-4 text-brand-600" /> Tiada tindakan tertunggak.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {shown.map((i) => (
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
      {limit && items.length > limit && (
        <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-gray-100 px-5 py-2.5 text-[13px] font-medium text-brand-700 hover:bg-gray-50">
          {all ? 'Tunjuk kurang' : `Tunjuk semua ${items.length} perkara`}
        </button>
      )}
    </Card>
  );
}

function growthHint(pct, fallback) {
  if (pct === null || pct === undefined) return fallback;
  return `${pct >= 0 ? '+' : ''}${pct}% berbanding bulan lepas`;
}

export default function DashboardView({ role }) {
  const [view, setView] = useState(loadView);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dashboardApi.getSummary()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [role]);

  if (error) return <Card><EmptyState title="Gagal memuat ringkasan">Sila muat semula halaman.</EmptyState></Card>;
  if (!data) return <p className="py-10 text-center text-sm text-gray-500">Memuatkan…</p>;

  const toggle = (
    <Segmented
      value={view}
      onChange={(v) => {
        setView(v);
        try {
          localStorage.setItem(VIEW_KEY, v);
        } catch {
          // the preference just won't persist
        }
      }}
      items={[
        { value: 'simple', label: 'Ringkas' },
        { value: 'detailed', label: 'Terperinci' },
      ]}
    />
  );
  const notices = buildNotices(data, role);
  const { students, finance, attendance, classes } = data;
  const thisMonth = data.today.slice(0, 7);
  const [thisYear, thisMonthNo] = thisMonth.split('-').map(Number);
  const lastMonth = thisMonthNo === 1 ? monthKey(thisYear - 1, 12) : monthKey(thisYear, thisMonthNo - 1);
  const collectedIn = (month, amount) => receiptsHref({ month }, { expect: amount, unit: 'total' });
  // A link to the students a figure counts; `expect` is the number the figure shows
  const sh = (filters, expect) => studentsHref(filters, { expect });
  const hintLink = (href, text) => <a href={href} className="relative z-10 hover:text-brand-700 hover:underline">{text}</a>;
  const approver = role !== 'ADMIN';
  const management = role === 'MANAGEMENT';

  const header = (
    <PageHeader
      title="Ringkasan"
      description={`Data semasa sehingga ${date(data.today)}`}
      actions={
        <>
          {toggle}
          {management ? (
            <Button as="a" href="#/reports" icon={BarChart3}>Laporan penuh</Button>
          ) : role === 'SUPERVISOR' ? (
            <Button as="a" href="#/reschedules" icon={CalendarClock}>Batal & ganti kelas</Button>
          ) : (
            <Button as="a" href="#/billing" icon={Wallet}>Rekod bayaran</Button>
          )}
          {can(role, 'students.edit') && (
            <Button as="a" href="#/students?new" variant="primary" icon={UserPlus}>Daftar pelajar</Button>
          )}
        </>
      }
    />
  );

  const attendanceStat = (
    <Stat
      label={`Kehadiran ${attendance.window_days} hari lepas`}
      value={attendance.rate === null ? '—' : `${attendance.rate}%`}
      hint={attendance.total ? `${attendance.present}/${attendance.total} kehadiran` : 'Belum direkodkan'}
      tone={attendance.rate !== null && attendance.rate < attendance.threshold ? 'red' : undefined}
      // the classes the rate is made from, with each class's own rate
      href={attendance.rate === null ? undefined : attendanceHref({ from: attendance.start, to: attendance.end }, { expect: attendance.rate, unit: 'rate' })}
    />
  );

  if (view === 'simple') {
    return (
      <>
        {header}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat
            label="Pelajar aktif"
            value={students.active}
            href={sh({ status: 'ACTIVE' }, students.active)}
            hint={<>{hintLink(sh({ joined: thisMonth }, students.new_this_month), `${students.new_this_month} baharu bulan ini`)} · {hintLink(sh({ status: 'ON_HOLD' }, students.on_hold), `${students.on_hold} ditangguh`)}</>}
          />
          <Stat
            label={`Kutipan ${monthLabel(CURRENT_MONTH)}`}
            value={rm(finance.collected_this_month)}
            href={collectedIn(thisMonth, finance.collected_this_month)}
            hint={<>
              {hintLink(receiptsHref({ from: data.today, to: data.today }, { expect: finance.collected_today, unit: 'total' }), `Hari ini ${rm(finance.collected_today)}`)}
              {' · '}
              {hintLink(invoicesHref({ status: 'OUTSTANDING' }, { expect: finance.outstanding, unit: 'balance' }), `tunggakan ${rm(finance.outstanding)}`)}
            </>}
          />
          {attendanceStat}
        </div>
        <ActionList items={notices} />
      </>
    );
  }

  const year = Number(data.today.slice(0, 4));
  const capacity = [
    ...classes.over.map((c) => ({ ...c, tone: 'red', text: `Lebih ${-c.available_seats}` })),
    ...classes.full.map((c) => ({ ...c, tone: 'amber', text: 'Penuh' })),
    ...classes.near_full.map((c) => ({ ...c, tone: 'neutral', text: `Baki ${c.available_seats}` })),
  ];
  const yearSeries = [
    { key: 'now', label: String(year), color: SERIES_COLORS.strong },
    { key: 'prev', label: String(year - 1), color: SERIES_COLORS.muted },
  ];
  const flowSeries = [
    { key: 'new', label: 'Baharu', color: SERIES_COLORS.strong },
    { key: 'left', label: 'Berhenti', color: STATUS_COLORS.critical },
  ];

  return (
    <>
      {header}

      {/* Counter figures: student counts and collection */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Jumlah pelajar" value={students.total} href={sh({ status: 'REGISTERED' }, students.total)} hint={`${students.active} aktif`} />
        <Stat label="Aktif bulanan" value={students.active_monthly} href={sh({ status: 'ACTIVE', type: 'MONTHLY' }, students.active_monthly)} />
        <Stat label="Walk-in aktif" value={students.walk_in} href={sh({ status: 'ACTIVE', type: 'WALK_IN' }, students.walk_in)} />
        <Stat label="Ditangguh" value={students.on_hold} href={sh({ status: 'ON_HOLD' }, students.on_hold)} />
        <Stat label="Tidak aktif" value={students.inactive} href={sh({ status: 'INACTIVE' }, students.inactive)} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Kutipan hari ini" value={rm(finance.collected_today)} href={receiptsHref({ from: data.today, to: data.today }, { expect: finance.collected_today, unit: 'total' })} />
        <Stat label="Kutipan bulan ini" value={rm(finance.collected_this_month)} href={collectedIn(thisMonth, finance.collected_this_month)} hint={management ? growthHint(finance.sales_growth_pct, 'Tiada data bulan lepas') : undefined} />
        <Stat label="Tunggakan yuran" value={rm(finance.outstanding)} href={invoicesHref({ status: 'OUTSTANDING' }, { expect: finance.outstanding, unit: 'balance' })} tone={finance.outstanding > 0 ? 'red' : undefined} />
        {attendanceStat}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActionList items={notices} limit={8} />
        <Card>
          <CardHeader title="Pelajar aktif mengikut tingkatan" description="Bulanan dan walk-in" />
          <div className="p-5"><Donut rows={students.by_form.map((f) => ({ label: f.label, value: f.count, href: sh({ status: 'ACTIVE', form: f.form }, f.count) }))} /></div>
        </Card>
      </div>

      {capacity.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Kapasiti kelas" description="Dikira daripada pendaftaran kelas sebenar" actions={<Button as="a" size="sm" href="#/timetable">Jadual</Button>} />
          <ul className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {capacity.map((c) => (
              <li key={c.id}>
                <a
                  href={classesHref({ id: c.id }, { expect: 1 })}
                  className={cx('block rounded-md border px-3 py-2.5 text-sm hover:border-brand-400', c.tone === 'red' ? 'border-red-200 bg-red-50/50' : 'border-gray-200')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-gray-900">{c.class_code}</p>
                    <Badge tone={c.tone}>{c.text}</Badge>
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    {DAY_LABEL[c.day] ?? c.day} {c.time} · <span className="tnum">{c.enrolled}/{c.max_seats}</span>{c.teacher ? ` · ${c.teacher}` : ''}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Supervisor analytics */}
      {approver && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Pelajar baharu bulan ini" value={students.new_this_month} href={sh({ joined: thisMonth }, students.new_this_month)} hint={growthHint(students.new_growth_pct, `Bulan lepas: ${students.new_last_month}`)} />
            <Stat label="Guru aktif" value={data.teachers.active} href={teachersHref({ status: 'ACTIVE' }, { expect: data.teachers.active })} hint={`${data.teachers.permanent} tetap · ${data.teachers.replacement} ganti`} />
            <Stat
              label="Permit hampir / telah luput"
              value={data.teachers.permits_expiring.length}
              href={data.teachers.permits_expiring.length ? teachersHref({ status: 'ACTIVE', permit: 'EXPIRING' }, { expect: data.teachers.permits_expiring.length }) : undefined}
              hint={data.teachers.permits_missing > 0
                ? hintLink(teachersHref({ status: 'ACTIVE', permit: 'MISSING' }, { expect: data.teachers.permits_missing }), `${data.teachers.permits_missing} guru tiada tarikh permit`)
                : undefined}
              tone={data.teachers.permits_expiring.length ? 'red' : undefined}
            />
            <Stat
              label="Perkara perlu tindakan"
              value={notices.length}
              href="#/dashboard"
              onOpen={(e) => { e.preventDefault(); document.getElementById('perlu-tindakan')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Jumlah pelajar mengikut bulan" description="Pelajar berdaftar pada akhir bulan" actions={<Legend series={yearSeries} />} />
              <div className="p-5">
                <BarChart
                  series={yearSeries}
                  data={MONTHS.map((label, i) => ({ label, values: { now: students.trend_this_year[i]?.total ?? 0, prev: students.trend_last_year[i]?.total ?? 0 } }))}
                  // a bar opens the students on the books on the last day of that month
                  hrefFor={(d, key, v) => sh({ as_at: monthEnd(key === 'now' ? year : year - 1, MONTHS.indexOf(d.label) + 1) }, v)}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Tempoh belajar" description="Sejak tarikh daftar" />
              <div className="p-5"><HBarList rows={students.period_of_stay.map((b) => ({ label: b.label, value: b.count, href: b.count ? sh({ stay: b.key }, b.count) : undefined }))} /></div>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Pelajar baharu dan berhenti" description={`Setiap bulan ${year}`} actions={<Legend series={flowSeries} />} />
              <div className="p-5">
                <BarChart
                  series={flowSeries}
                  data={MONTHS.map((label, i) => ({ label, values: { new: students.trend_this_year[i]?.new ?? 0, left: students.trend_this_year[i]?.left ?? 0 } }))}
                  hrefFor={(d, key, v) => sh({ [key === 'new' ? 'joined' : 'left']: monthKey(year, MONTHS.indexOf(d.label) + 1) }, v)}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Status pelajar" />
              <div className="p-5">
                <Donut rows={[
                  { label: 'Aktif', value: students.active, color: STATUS_COLORS.good, href: sh({ status: 'ACTIVE' }, students.active) },
                  { label: 'Ditangguh', value: students.on_hold, color: STATUS_COLORS.warning, href: sh({ status: 'ON_HOLD' }, students.on_hold) },
                  { label: 'Tidak aktif', value: students.inactive, color: '#94a3b8', href: sh({ status: 'INACTIVE' }, students.inactive) },
                ]} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Kategori sekolah" description="Pelajar aktif" />
              <div className="p-5"><Donut rows={students.by_school_category.map((c) => ({ label: c.category, value: c.count, href: sh({ status: 'ACTIVE', school_category: c.value }, c.count) }))} /></div>
            </Card>
            <SubjectsByForm rows={students.subjects_by_form} hrefFor={(form, x) => sh({ status: 'ACTIVE', form, subject: x.code }, x.count)} />
            {management && (
              <Card>
                <CardHeader title="Status kutipan invois" description="Semua invois" />
                <div className="p-5">
                  <Donut rows={INVOICE_STATUS.map(([status, label, color]) => {
                    const value = finance.collection_status.find((x) => x.status === status)?.count ?? 0;
                    return { label, color, value, href: value ? invoicesHref({ status }, { expect: value }) : undefined };
                  })} />
                </div>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Management: sales and spending */}
      {management && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Jualan dan perbelanjaan bulan ini" />
            <dl className="divide-y divide-gray-100 px-5 text-sm">
              {[
                ['Kutipan bulan ini', rm(finance.collected_this_month), collectedIn(thisMonth, finance.collected_this_month)],
                ['Kutipan bulan lepas', rm(finance.collected_last_month), collectedIn(lastMonth, finance.collected_last_month)],
                ['Perbelanjaan (baucar disahkan / diluluskan)', rm(finance.expenses_this_month), vouchersHref({ status: 'COUNTED', month: thisMonth }, { expect: finance.expenses_this_month, unit: 'total' })],
                ['Pertumbuhan jualan', growthHint(finance.sales_growth_pct, 'Tiada data bulan lepas'), collectedIn(thisMonth, finance.collected_this_month)],
              ].map(([k, v, to]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-gray-600">{k}</dt>
                  <dd className="font-medium text-gray-900 tnum">{to ? <a href={to} className="hover:text-brand-700 hover:underline">{v}</a> : v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Baucar menunggu kelulusan" actions={<Button as="a" size="sm" href="#/vouchers">Baucar</Button>} />
            {data.pending_vouchers.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-500">Tiada baucar menunggu.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.pending_vouchers.map((pv) => (
                  <li key={pv.id}>
                    <a href={voucherHref(pv.pv_number)} className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-gray-50">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{pv.pv_number} · {pv.vendor || '—'}</p>
                        <p className="text-[13px] text-gray-500">{pv.category} · {pv.status === 'PENDING_MANAGEMENT' ? 'kuasa pengurusan' : 'tahap supervisor'}</p>
                      </div>
                      <span className="font-medium tnum">{rm(pv.amount)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

// Subjects taken, one grade at a time
function SubjectsByForm({ rows, hrefFor }) {
  const [form, setForm] = useState(rows[0]?.form || '');
  const current = rows.find((f) => f.form === form) || rows[0];
  return (
    <Card>
      <CardHeader
        title="Subjek mengikut tingkatan"
        description="Bilangan pendaftaran kelas"
        actions={current && (
          <select
            aria-label="Tingkatan"
            value={current.form}
            onChange={(e) => setForm(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-600 focus:outline-none"
          >
            {rows.map((f) => <option key={f.form} value={f.form}>{f.label}</option>)}
          </select>
        )}
      />
      <div className="p-5">
        {current ? <Donut rows={current.subjects.map((x) => ({ label: x.subject, value: x.count, href: hrefFor?.(current.form, x) }))} /> : <p className="text-sm text-gray-500">Tiada pendaftaran kelas.</p>}
      </div>
    </Card>
  );
}
