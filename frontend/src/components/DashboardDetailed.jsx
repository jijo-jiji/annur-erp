import { ArrowRight, CalendarClock, Check, UserPlus, Wallet } from 'lucide-react';
import { CURRENT_MONTH, DAYS } from '../data/demo';
import { useStore } from '../store';
import { arrearsCases, canApproveVoucher, classLabel, invoiceBalance, invoiceStatus, preferredContact, timetableDay } from '../lib/domain';
import { can } from '../lib/permissions';
import { CHECKLIST, date, DAY_LABEL, monthLabel, RESCHEDULE_REASON_LABEL, rm, ROLE_LABEL, timeRange, todayISO, waLink } from '../lib/format';
import { Badge, Button, Card, CardHeader, cx, PageHeader, SeatMeter, Stat, useToast, WhatsAppIcon } from './ui';

// Detailed dashboards: every panel on one page. The simplified version lives in
// DashboardView.jsx; users switch between them with the Ringkas / Terperinci toggle.

const WEEKS_PER_MONTH = 4;
const LIST_MAX = 6;

export default function DashboardDetailed({ role, toggle }) {
  if (role === 'MANAGEMENT') return <ManagementDashboard role={role} toggle={toggle} />;
  if (role === 'SUPERVISOR') return <SupervisorDashboard role={role} toggle={toggle} />;
  return <AdminDashboard toggle={toggle} />;
}

// ---- Shared pieces ------------------------------------------------------------

function useDerived() {
  const store = useStore();
  const { students, invoices, classes, teachers } = store;
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]));
  const teacherName = (code) => teachers.find((t) => t.code === code)?.name ?? code;
  const unpaid = invoices.filter((i) => i.month <= CURRENT_MONTH && invoiceStatus(i) !== 'PAID');
  const overCapacity = classes.filter((c) => c.enrolled > c.max);
  return { ...store, studentById, teacherName, unpaid, overCapacity };
}

function LinkAction({ href, children }) {
  return (
    <a href={href} className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-900">
      {children} <ArrowRight className="size-4" />
    </a>
  );
}

function Empty({ children }) {
  return (
    <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-gray-500">
      <Check className="size-4 text-brand-600" /> {children}
    </p>
  );
}

function MoreLink({ href, count }) {
  if (count <= LIST_MAX) return null;
  return (
    <a href={href} className="block border-t border-gray-100 px-5 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-gray-50">
      Lihat semua ({count})
    </a>
  );
}

function CapacityList({ limit = 6 }) {
  const { classes, subjects, teacherName } = useDerived();
  const rows = [...classes].sort((a, b) => b.enrolled / b.max - a.enrolled / a.max).slice(0, limit);
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{classLabel(c, subjects)}</p>
            <p className="text-[13px] text-gray-500">
              {DAY_LABEL[c.day]}, {timeRange(c.start, c.end)} · Cikgu {teacherName(c.teacher)}
            </p>
          </div>
          {c.enrolled > c.max && <Badge tone="red">Lebih {c.enrolled - c.max}</Badge>}
          {c.enrolled === c.max && <Badge tone="amber">Penuh</Badge>}
          <SeatMeter enrolled={c.enrolled} max={c.max} />
        </li>
      ))}
    </ul>
  );
}

function VoucherApprovals({ role }) {
  const { vouchers, updateVoucher } = useStore();
  const notify = useToast();
  const mine = vouchers.filter((v) => v.status === 'PENDING' && canApproveVoucher(role, v.amount));
  if (!mine.length) return null;
  const decide = (v, status) => {
    updateVoucher(v.no, { status, approvedBy: ROLE_LABEL[role] });
    notify(`${v.no} ${status === 'APPROVED' ? 'diluluskan' : 'ditolak'}.`, status === 'APPROVED' ? 'success' : 'info');
  };
  return mine.map((v) => (
    <li key={v.no} className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">
          {v.no} · {v.vendor}
        </p>
        <p className="text-[13px] text-gray-500">{v.description}</p>
      </div>
      <span className="text-sm font-semibold tnum">{rm(v.amount)}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => decide(v, 'APPROVED')}>
          Lulus
        </Button>
        <Button size="sm" variant="danger" onClick={() => decide(v, 'REJECTED')}>
          Tolak
        </Button>
      </div>
    </li>
  ));
}

function RescheduleApprovals() {
  const { reschedules, classes, subjects, teacherName, updateReschedule } = useDerived();
  const notify = useToast();
  return reschedules
    .filter((r) => !r.approved)
    .map((r) => {
      const c = classes.find((x) => x.id === r.classId);
      return (
        <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {c && classLabel(c, subjects)} · Cikgu {c && teacherName(c.teacher)}
            </p>
            <p className="text-[13px] text-gray-500">
              {r.extra ? `Kelas tambahan ${date(r.replacement)}` : `${date(r.cancelled)} → ${date(r.replacement)}`} · {r.remarks || RESCHEDULE_REASON_LABEL[r.reason]}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              updateReschedule(r.id, { approved: true });
              notify('Gantian kelas disahkan.');
            }}
          >
            Sahkan
          </Button>
        </li>
      );
    });
}

// Waiting students for classes that now have a free seat
function WaitlistOffers({ role }) {
  const { waitlist, classes, subjects, students, enrollFromWaitlist } = useStore();
  const notify = useToast();
  if (!waitlist.length) return null;
  const offers = waitlist
    .map((w) => ({ ...w, cls: classes.find((c) => c.id === w.classId), student: students.find((s) => s.id === w.studentId) }))
    .filter((w) => w.cls && w.cls.enrolled < w.cls.max && w.student?.status === 'ACTIVE');
  return (
    <Card>
      <CardHeader
        title="Senarai menunggu"
        description={offers.length ? 'Kerusi telah kosong — tawarkan kepada pelajar yang menunggu.' : `${waitlist.length} pelajar menunggu kerusi kosong.`}
        actions={<LinkAction href="#/timetable">Jadual</LinkAction>}
      />
      {offers.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">Tiada kerusi kosong buat masa ini.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {offers.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{w.student.name}</p>
                <p className="text-[13px] text-gray-500">
                  {classLabel(w.cls, subjects)} · {w.cls.max - w.cls.enrolled} kerusi kosong · menunggu sejak {date(w.added)}
                </p>
              </div>
              {can(role, 'waitlist.manage') && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    enrollFromWaitlist(w.id);
                    notify(`${w.student.name} dimasukkan ke ${classLabel(w.cls, subjects)}.`);
                  }}
                >
                  Masukkan ke kelas
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ArrearsCard() {
  const { students, invoices, settings, arrearsWarnings } = useStore();
  const cases = arrearsCases(students, invoices, settings.unpaidMonthsLimit);
  if (!cases.length) return null;
  return (
    <Card>
      <CardHeader
        title={`Tertunggak ${settings.unpaidMonthsLimit} bulan atau lebih`}
        description="Mengikut polisi, pelajar boleh diberhentikan selepas amaran."
        actions={<LinkAction href="#/billing?tab=arrears">Urus</LinkAction>}
      />
      <ul className="divide-y divide-gray-100">
        {cases.slice(0, LIST_MAX).map(({ student: s, amount, months }) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
            <div className="min-w-0">
              <a href={`#/students/${s.id}?tab=fees`} className="font-medium text-gray-900 hover:underline">
                {s.name}
              </a>
              <p className="text-[13px] text-gray-500">
                {months} bulan · {s.status === 'SUSPENDED' ? 'digantung' : arrearsWarnings[s.id] ? `amaran ${date(arrearsWarnings[s.id])}` : 'belum diberi amaran'}
              </p>
            </div>
            <span className="font-medium text-red-700 tnum">{rm(amount)}</span>
          </li>
        ))}
      </ul>
      <MoreLink href="#/billing?tab=arrears" count={cases.length} />
    </Card>
  );
}

// ---- Admin Kaunter ------------------------------------------------------------

function AdminDashboard({ toggle }) {
  const { students, classes, subjects, studentById, teacherName, unpaid, attendance } = useDerived();
  const active = students.filter((s) => s.status === 'ACTIVE');
  const incomplete = active.filter((s) => CHECKLIST.some((c) => !s.checklist[c.key]));
  const newQr = students.filter((s) => s.source === 'QR' && !s.checklist.SY);
  const unpaidNow = unpaid.filter((i) => i.month === CURRENT_MONTH).sort((a, b) => invoiceBalance(b) - invoiceBalance(a));
  const unpaidTotal = unpaidNow.reduce((a, i) => a + invoiceBalance(i), 0);

  // Today's classes, or the next teaching day if there are none today
  const today = timetableDay();
  let day = today && classes.some((c) => c.day === today) ? today : null;
  if (!day) {
    const order = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'];
    const start = today ? order.indexOf(today) + 1 : 0;
    day = [...order.slice(start), ...order.slice(0, start)].find((d) => classes.some((c) => c.day === d));
  }
  const dayClasses = classes.filter((c) => c.day === day).sort((a, b) => a.start.localeCompare(b.start));
  const takenToday = (c) => attendance.find((a) => a.classId === c.id && a.date === todayISO());

  const reminder = (inv) => {
    const s = studentById[inv.studentId];
    const p = preferredContact(s);
    return waLink(
      p?.phone,
      `Assalamualaikum ${p?.name}. Peringatan mesra: yuran ${monthLabel(inv.month)} bagi ${s?.name} berjumlah ${rm(invoiceBalance(inv))} belum dijelaskan (tarikh akhir ${date(inv.dueDate)}). Terima kasih.`,
    );
  };

  return (
    <>
      <PageHeader
        title="Ringkasan kaunter"
        description={`Tugasan kaunter · ${monthLabel(CURRENT_MONTH)}`}
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Pelajar aktif" value={active.length} hint={`${students.filter((s) => s.joined.startsWith(CURRENT_MONTH)).length} baharu bulan ini`} />
        <Stat label="Invois belum bayar" value={unpaidNow.length} hint={`${monthLabel(CURRENT_MONTH)} · ${rm(unpaidTotal)}`} tone={unpaidNow.length ? 'red' : undefined} />
        <Stat label="Pendaftaran QR baharu" value={newQr.length} hint="Menunggu pengesahan" />
        <Stat label="Semakan belum lengkap" value={incomplete.length} hint="Rekod pejabat pelajar" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title={`Yuran ${monthLabel(CURRENT_MONTH)} belum dikutip`}
              description={`${unpaidNow.length} invois · ${rm(unpaidTotal)}`}
              actions={<LinkAction href="#/billing">Yuran & resit</LinkAction>}
            />
            {unpaidNow.length === 0 ? (
              <Empty>Semua yuran telah dikutip.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                {unpaidNow.slice(0, LIST_MAX).map((inv) => (
                  <li key={inv.no} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{studentById[inv.studentId]?.name}</p>
                      <p className="text-[13px] text-gray-500">
                        {inv.no} · tarikh akhir {date(inv.dueDate)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-red-700 tnum">{rm(invoiceBalance(inv))}</span>
                    <div className="flex gap-2">
                      <Button as="a" size="sm" href={reminder(inv)} target="_blank" rel="noreferrer" title="Hantar peringatan WhatsApp">
                        <WhatsAppIcon className="size-3.5" /> Peringatan
                      </Button>
                      <Button as="a" size="sm" variant="primary" href={`#/billing?pay=${inv.no}`}>
                        Rekod bayaran
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <MoreLink href="#/billing" count={unpaidNow.length} />
          </Card>

          <ArrearsCard />
          <WaitlistOffers role="ADMIN" />

          <Card>
            <CardHeader
              title="Semakan pejabat belum lengkap"
              description="Kemas kini rekod lejar, kumpulan WhatsApp, senarai pelajar, kedatangan dan sistem yuran."
              actions={<LinkAction href="#/students">Pelajar</LinkAction>}
            />
            {incomplete.length === 0 ? (
              <Empty>Semua rekod pelajar lengkap.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                {incomplete.slice(0, LIST_MAX).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <a href={`#/students/${s.id}`} className="text-sm font-medium text-gray-900 hover:underline">
                        {s.name}
                      </a>
                      <p className="text-[13px] text-gray-500">
                        {s.id}
                        {s.source === 'QR' && ' · daftar melalui QR'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CHECKLIST.filter((c) => !s.checklist[c.key]).map((c) => (
                        <Badge key={c.key} tone="amber">
                          {c.label}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <MoreLink href="#/students" count={incomplete.length} />
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader
            title={day === today ? `Kelas hari ini (${DAY_LABEL[day]})` : `Kelas seterusnya: ${DAY_LABEL[day]}`}
            description={day === today ? `${dayClasses.length} kelas` : 'Tiada kelas hari ini'}
          />
          <ul className="divide-y divide-gray-100">
            {dayClasses.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{classLabel(c, subjects)}</p>
                  <p className="truncate text-[13px] text-gray-500">
                    {timeRange(c.start, c.end)} · Cikgu {teacherName(c.teacher)} · {c.room}
                  </p>
                </div>
                {day === today &&
                  (takenToday(c) ? (
                    <Badge tone="green">Hadir {c.enrolled - takenToday(c).absent.length}</Badge>
                  ) : (
                    <a href={`#/attendance?class=${c.id}`} className="text-[13px] font-medium text-brand-700 hover:underline">
                      Ambil
                    </a>
                  ))}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

// ---- Supervisor Akademik --------------------------------------------------------

function SupervisorDashboard({ role, toggle }) {
  const { classes, teachers, reschedules, vouchers, overCapacity } = useDerived();
  const pendingReschedules = reschedules.filter((r) => !r.approved);
  const myVouchers = vouchers.filter((v) => v.status === 'PENDING' && canApproveVoucher(role, v.amount));
  const load = teachers
    .map((t) => ({ ...t, count: classes.filter((c) => c.teacher === t.code).length }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const maxLoad = Math.max(...load.map((t) => t.count));

  return (
    <>
      <PageHeader
        title="Ringkasan akademik"
        description="Kapasiti kelas, gantian kelas dan beban guru minggu ini"
        actions={
          <>
            {toggle}
            <Button as="a" href="#/reschedules" icon={CalendarClock}>
              Batal & ganti kelas
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Kelas mingguan" value={classes.length} hint={`${DAYS.length} hari mengajar`} />
        <Stat label="Kelas melebihi had" value={overCapacity.length} hint="Pertimbang buka seksyen baharu" tone={overCapacity.length ? 'red' : undefined} />
        <Stat label="Gantian belum disahkan" value={pendingReschedules.length} hint="Menunggu anda" />
        <Stat label="Baucar menunggu anda" value={myVouchers.length} hint="RM500 hingga RM3,000" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Perlu pengesahan anda" />
            {pendingReschedules.length + myVouchers.length === 0 ? (
              <Empty>Tiada perkara menunggu pengesahan.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                <RescheduleApprovals />
                <VoucherApprovals role={role} />
              </ul>
            )}
          </Card>

          <WaitlistOffers role={role} />

          <Card>
            <CardHeader title="Kapasiti kelas" description="Kelas paling penuh minggu ini." actions={<LinkAction href="#/timetable">Jadual penuh</LinkAction>} />
            <CapacityList limit={8} />
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader title="Beban guru minggu ini" description="Bilangan kelas setiap guru." actions={<LinkAction href="#/teachers">Guru</LinkAction>} />
          <ul className="space-y-3 px-5 py-4">
            {load.map((t) => (
              <li key={t.code} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-gray-800">Cikgu {t.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(t.count / maxLoad) * 100}%` }} />
                </div>
                <span className="w-4 text-right text-xs font-medium text-gray-600 tnum">{t.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

// ---- Pengurusan -----------------------------------------------------------------

function ManagementDashboard({ role, toggle }) {
  const { invoices, vouchers, classes, teachers, subjects, reschedules, studentById, unpaid, overCapacity } = useDerived();
  const month = invoices.filter((i) => i.month === CURRENT_MONTH);
  const billed = month.reduce((a, i) => a + i.total - i.discount, 0);
  const collected = month.reduce((a, i) => a + i.paid, 0);
  const outstanding = unpaid.reduce((a, i) => a + invoiceBalance(i), 0);
  const pct = billed ? Math.round((collected / billed) * 100) : 0;
  const allowance = teachers.reduce((a, t) => a + classes.filter((c) => c.teacher === t.code).length * WEEKS_PER_MONTH * t.rate, 0);
  const expenses = vouchers
    .filter((v) => v.date.startsWith(CURRENT_MONTH) && (v.status === 'APPROVED' || v.status === 'VERIFIED'))
    .reduce((a, v) => a + v.amount, 0);
  const myVouchers = vouchers.filter((v) => v.status === 'PENDING' && canApproveVoucher(role, v.amount));
  const pendingReschedules = reschedules.filter((r) => !r.approved);

  return (
    <>
      <PageHeader title="Ringkasan pengurusan" description={`Prestasi kewangan dan operasi · ${monthLabel(CURRENT_MONTH)}`} actions={toggle} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Kutipan ${monthLabel(CURRENT_MONTH)}`} value={rm(collected)} hint={`${pct}% daripada ${rm(billed)}`} />
        <Stat label="Tunggakan yuran" value={rm(outstanding)} hint={`${unpaid.length} invois`} tone={outstanding ? 'red' : undefined} />
        <Stat label="Anggaran elaun guru" value={rm(allowance)} hint={`${classes.length} kelas × ${WEEKS_PER_MONTH} minggu`} />
        <Stat label="Baucar menunggu anda" value={myVouchers.length} hint={rm(myVouchers.reduce((a, v) => a + v.amount, 0))} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Kewangan bulan ini" actions={<LinkAction href="#/billing">Yuran & resit</LinkAction>} />
            <div className="px-5 py-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-gray-600">Yuran dikutip</span>
                <span className="font-medium tnum">
                  {rm(collected)} / {rm(billed)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
              </div>
              <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  ['Tunggakan', rm(outstanding), outstanding > 0],
                  ['Perbelanjaan diluluskan', rm(expenses)],
                  ['Anggaran elaun guru', rm(allowance)],
                ].map(([k, v, red]) => (
                  <div key={k} className="rounded-md border border-gray-200 px-4 py-3">
                    <dt className="text-[13px] text-gray-500">{k}</dt>
                    <dd className={cx('mt-1 text-lg font-semibold tnum', red ? 'text-red-700' : 'text-gray-900')}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {unpaid.length > 0 && (
              <>
                <p className="border-t border-gray-200 px-5 pb-1 pt-3 text-xs font-medium text-gray-500">Tunggakan terbesar</p>
                <ul className="divide-y divide-gray-100">
                  {[...unpaid]
                    .sort((a, b) => invoiceBalance(b) - invoiceBalance(a))
                    .slice(0, LIST_MAX)
                    .map((i) => (
                      <li key={i.no} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <span className="text-gray-900">
                          {studentById[i.studentId]?.name} <span className="text-gray-500">· {monthLabel(i.month)}</span>
                        </span>
                        <span className="font-medium text-red-700 tnum">{rm(invoiceBalance(i))}</span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Perlu kelulusan anda" actions={<LinkAction href="#/vouchers">Baucar bayaran</LinkAction>} />
            {myVouchers.length === 0 ? (
              <Empty>Tiada baucar menunggu kelulusan.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                <VoucherApprovals role={role} />
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <ArrearsCard />
          <Card>
            <CardHeader title="Operasi" actions={<LinkAction href="#/timetable">Jadual</LinkAction>} />
            <div className="space-y-4 px-5 py-4 text-sm">
              <div>
                <p className="font-medium text-gray-900">{overCapacity.length} kelas melebihi had kerusi</p>
                <ul className="mt-1 space-y-0.5 text-[13px] text-gray-600">
                  {overCapacity.map((c) => (
                    <li key={c.id}>
                      {classLabel(c, subjects)} — {c.enrolled}/{c.max}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <p className="font-medium text-gray-900">{pendingReschedules.length} gantian kelas belum disahkan</p>
                <p className="mt-1 text-[13px] text-gray-600">Disahkan oleh supervisor akademik.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
