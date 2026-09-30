import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, TrendingUp, Bell } from 'lucide-react';
import { dashboardApi } from '../api/client';

const ROLE_LEVEL = { ADMIN: 1, SUPERVISOR: 2, MANAGEMENT: 3 };
const INVOICE_STATUS = { PAID: 'Selesai Bayar', PARTIAL: 'Sebahagian', UNPAID: 'Belum Bayar', OVERDUE: 'Tertunggak' };

const money = (v) => `RM ${Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Growth({ pct, emptyText = 'Tiada data bulan lepas' }) {
  if (pct === null || pct === undefined) return <span className="text-[11px] text-slate-400">{emptyText}</span>;
  const up = pct >= 0;
  return (
    <span className={`text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? '+' : ''}{pct}% berbanding bulan lepas
    </span>
  );
}

function Kpi({ label, value, note, tone = 'text-slate-900' }) {
  return (
    <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
      {note && <div>{note}</div>}
    </div>
  );
}

function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Bars({ rows, colorClass = 'bg-indigo-600' }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return <p className="text-xs text-slate-400">Tiada data.</p>;
  return (
    <div className="space-y-3 text-xs">
      {rows.map((r) => {
        const pct = Math.round((r.value / total) * 100);
        return (
          <div key={r.label}>
            <div className="flex justify-between mb-1 gap-2">
              <span className="font-semibold text-slate-700">{r.label}</span>
              <strong className="text-slate-900 whitespace-nowrap">{r.display ?? r.value} ({pct}%)</strong>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className={`${colorClass} h-full rounded-full`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

function LineChart({ series, height = 140 }) {
  const values = series.flatMap((s) => s.values.filter((v) => v !== null && v !== undefined));
  const max = Math.max(1, ...values);
  const width = 480;
  const pad = 24;
  const x = (i) => pad + (i * (width - pad * 2)) / 11;
  const y = (v) => height - pad - (v / max) * (height - pad * 2);
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={series.map((s) => s.label).join(', ')}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad} x2={width - pad} y1={y(max * f)} y2={y(max * f)} className="stroke-slate-100" />
            <text x={2} y={y(max * f) + 3} className="fill-slate-400" fontSize="9">{Math.round(max * f)}</text>
          </g>
        ))}
        {MONTHS.map((m, i) => <text key={m} x={x(i)} y={height - 6} textAnchor="middle" className="fill-slate-400" fontSize="9">{m}</text>)}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null || v === undefined ? null : `${x(i)},${y(v)}`)).filter(Boolean);
          return (
            <g key={s.label}>
              <polyline points={pts.join(' ')} fill="none" strokeWidth="2" className={s.stroke} />
              {s.values.map((v, i) => (v === null || v === undefined ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r="2.5" className={s.fill}><title>{`${s.label} ${MONTHS[i]}: ${v}`}</title></circle>
              )))}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
        {series.map((s) => <span key={s.label} className="flex items-center gap-1"><span className={`w-3 h-1.5 rounded ${s.swatch}`} />{s.label}</span>)}
      </div>
    </div>
  );
}

function ClassAlert({ c, tone }) {
  const styles = {
    over: 'bg-rose-50 border-rose-200',
    full: 'bg-amber-50/70 border-amber-200',
    near: 'bg-slate-50 border-slate-200',
  };
  return (
    <div className={`p-3 rounded-2xl border ${styles[tone]} text-xs`}>
      <div className="flex justify-between items-center gap-2">
        <span className="font-bold text-slate-900">{c.class_code}</span>
        <span className="font-black whitespace-nowrap">
          {c.enrolled}/{c.max_seats}{c.available_seats < 0 ? ` (${c.available_seats})` : ''}
        </span>
      </div>
      <p className="text-slate-600 text-[11px] mt-1">{c.day} {c.time}{c.room ? ` • ${c.room}` : ''}{c.teacher ? ` • ${c.teacher}` : ''}</p>
    </div>
  );
}

export default function DashboardView({ onNavigate, currentRole = 'ADMIN' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const level = ROLE_LEVEL[currentRole] || 1;

  useEffect(() => {
    let cancelled = false;
    dashboardApi.getSummary()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [currentRole]);

  if (error) {
    return <div className="p-8 bg-white rounded-3xl border border-rose-200 text-sm text-rose-700">Gagal memuat data dashboard. Sila muat semula halaman.</div>;
  }
  if (!data) {
    return <div className="p-8 text-sm text-slate-500">Memuatkan dashboard…</div>;
  }

  const { students, finance, classes, teachers, approvals, attendance } = data;
  const capacityCount = classes.over.length + classes.full.length + classes.near_full.length;

  // Notification centre: only items that actually need attention
  const notices = [];
  if (classes.over.length) notices.push({ tone: 'danger', text: `${classes.over.length} kelas melebihi had kerusi`, tab: 'timetable' });
  if (classes.full.length) notices.push({ tone: 'warning', text: `${classes.full.length} kelas penuh`, tab: 'timetable' });
  if (classes.near_full.length) notices.push({ tone: 'info', text: `${classes.near_full.length} kelas hampir penuh (baki ≤ 2 kerusi)`, tab: 'timetable' });
  if (finance.outstanding > 0) notices.push({ tone: 'warning', text: `Tunggakan yuran ${money(finance.outstanding)}`, tab: 'billing' });
  if (approvals.registrations_pending) notices.push({ tone: 'warning', text: `${approvals.registrations_pending} pendaftaran pelajar menunggu kelulusan`, tab: 'students' });
  if (approvals.monthly_invoices_pending) notices.push({ tone: 'warning', text: `${approvals.monthly_invoices_pending} pelajar aktif belum ada invois bulan ini (Kutipan Yuran → Invois Bulanan)`, tab: 'billing' });
  if (approvals.teacher_pay_to_verify) notices.push({ tone: 'info', text: `${approvals.teacher_pay_to_verify} gaji guru menunggu pengesahan Supervisor`, tab: 'teacher_payroll' });
  if (level >= 3 && approvals.teacher_pay_to_approve) notices.push({ tone: 'warning', text: `${approvals.teacher_pay_to_approve} gaji guru menunggu kelulusan Management`, tab: 'teacher_payroll' });
  if (approvals.teacher_pay_to_record) notices.push({ tone: 'info', text: `${approvals.teacher_pay_to_record} gaji guru diluluskan, belum direkod dibayar`, tab: 'teacher_payroll' });
  if (approvals.lead_followups_due) notices.push({ tone: 'warning', text: `${approvals.lead_followups_due} lead perlu susulan (lebih seminggu sejak tindakan terakhir)`, tab: 'leads' });
  if (approvals.waitlist_waiting) notices.push({ tone: 'info', text: `${approvals.waitlist_waiting} pelajar dalam senarai menunggu kelas penuh`, tab: 'students' });
  attendance.low_classes.forEach((c) => notices.push({
    tone: 'danger',
    text: `Kehadiran ${c.class_code} ${c.rate}% (${c.present}/${c.total}) dalam ${attendance.window_days} hari lepas`,
    tab: 'attendance',
  }));
  if (level >= 2) {
    if (approvals.vouchers_pending_supervisor) notices.push({ tone: 'warning', text: `${approvals.vouchers_pending_supervisor} baucar RM500-RM3,000 menunggu kelulusan`, tab: 'expenses' });
    if (approvals.leave_pending) notices.push({ tone: 'warning', text: `${approvals.leave_pending} permohonan cuti staf menunggu kelulusan`, tab: 'staff_hr' });
    if (approvals.master_data_pending) notices.push({ tone: 'info', text: `${approvals.master_data_pending} cadangan data induk menunggu kelulusan`, tab: 'dynamic_master_data' });
    if (approvals.reschedules_pending) notices.push({ tone: 'info', text: `${approvals.reschedules_pending} rekod gantian kelas menunggu kelulusan`, tab: 'reschedules' });
    (data.staff?.contracts_ending || []).forEach((c) => notices.push({
      tone: c.days_left < 0 ? 'danger' : 'warning',
      text: `Kontrak ${c.name} ${c.days_left < 0 ? `tamat ${-c.days_left} hari lepas` : `tamat dalam ${c.days_left} hari`} (${c.contract_end})`,
      tab: 'staff_hr',
    }));
    (data.staff?.birthdays || []).forEach((b) => notices.push({
      tone: 'info',
      text: `Hari lahir ${b.name} ${b.days_left === 0 ? 'hari ini' : `dalam ${b.days_left} hari`} (${b.date})`,
      tab: 'staff_hr',
    }));
    teachers.permits_expiring.forEach((p) => notices.push({
      tone: p.days_left < 0 ? 'danger' : 'warning',
      text: `Permit mengajar ${p.name} ${p.days_left < 0 ? 'telah luput' : `luput dalam ${p.days_left} hari`} (${p.expiry})`,
      tab: 'teachers',
    }));
  } else {
    const waiting = approvals.vouchers_pending_supervisor + approvals.vouchers_pending_management;
    if (waiting) notices.push({ tone: 'info', text: `${waiting} baucar sedang menunggu kelulusan`, tab: 'expenses' });
    if (approvals.reschedules_pending) notices.push({ tone: 'info', text: `${approvals.reschedules_pending} rekod gantian menunggu kelulusan Supervisor`, tab: 'reschedules' });
    if (approvals.master_data_pending) notices.push({ tone: 'info', text: `${approvals.master_data_pending} cadangan data induk menunggu kelulusan`, tab: 'dynamic_master_data' });
  }
  if (level >= 3) {
    if (approvals.vouchers_pending_management) notices.push({ tone: 'danger', text: `${approvals.vouchers_pending_management} baucar melebihi RM3,000 menunggu kelulusan Management`, tab: 'expenses' });
    if (approvals.rate_increments_pending) notices.push({ tone: 'warning', text: `${approvals.rate_increments_pending} cadangan kenaikan kadar guru menunggu kelulusan`, tab: 'teachers' });
  }
  const toneStyles = {
    danger: 'bg-rose-50 border-rose-200 text-rose-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-slate-50 border-slate-200 text-slate-700',
  };
  const ToneIcon = { danger: AlertTriangle, warning: AlertTriangle, info: Info };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Dashboard</h2>
        <p className="text-xs text-slate-500">Data semasa sehingga {data.today}</p>
      </div>

      {/* Admin KPIs (j-status.doc: dashboard items 1-5) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Jumlah Pelajar" value={students.total} note={<span className="text-[11px] text-slate-400">{students.active} aktif</span>} />
        <Kpi label="Aktif Bulanan" value={students.active_monthly} tone="text-indigo-700" />
        <Kpi label="Walk-in Aktif" value={students.walk_in} />
        <Kpi label="Ditangguh (On Hold)" value={students.on_hold} tone="text-amber-600" />
        <Kpi label="Tidak Aktif" value={students.inactive} tone="text-slate-500" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Kutipan Hari Ini" value={money(finance.collected_today)} tone="text-purple-700" />
        <Kpi label="Kutipan Bulan Ini" value={money(finance.collected_this_month)} note={level >= 3 && <Growth pct={finance.sales_growth_pct} />} />
        <Kpi label="Tunggakan Yuran" value={money(finance.outstanding)} tone={finance.outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'} />
        <Kpi label={`Kehadiran ${attendance.window_days} Hari`} value={attendance.rate === null ? '-' : `${attendance.rate}%`}
          tone={attendance.rate !== null && attendance.rate < attendance.threshold ? 'text-rose-600' : 'text-slate-900'}
          note={<span className="text-[11px] text-slate-400">{attendance.total ? `${attendance.present}/${attendance.total} kehadiran` : 'Belum direkodkan'}</span>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Pusat Notifikasi"
          subtitle={level >= 2 ? 'Tugasan, kelulusan dan amaran' : 'Tugasan dan status kelulusan'}
          action={<Bell className="w-4 h-4 text-indigo-600" />}
        >
          {notices.length === 0 ? (
            <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Tiada tindakan tertunggak.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {notices.map((n, i) => {
                const Icon = ToneIcon[n.tone];
                return (
                  <button
                    key={i}
                    onClick={() => onNavigate(n.tab)}
                    className={`w-full text-left p-3 rounded-xl border flex items-start gap-2 hover:shadow-sm transition cursor-pointer ${toneStyles[n.tone]}`}
                  >
                    <Icon className="w-4 h-4 shrink-0 mt-px" />
                    <span className="font-semibold">{n.text}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Pelajar Aktif Mengikut Tingkatan" subtitle="Aktif (bulanan & walk-in)">
          <Bars rows={students.by_form.map((f) => ({ label: f.label, value: f.count }))} />
        </Card>
      </div>

      {capacityCount > 0 && (
        <Card
          title="Kapasiti Kelas"
          subtitle="Dikira daripada pendaftaran kelas sebenar"
          action={<button onClick={() => onNavigate('timetable')} className="text-xs text-indigo-600 font-bold hover:underline">Jadual →</button>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classes.over.map((c) => <ClassAlert key={c.id} c={c} tone="over" />)}
            {classes.full.map((c) => <ClassAlert key={c.id} c={c} tone="full" />)}
            {classes.near_full.map((c) => <ClassAlert key={c.id} c={c} tone="near" />)}
          </div>
        </Card>
      )}

      {/* Supervisor analytics (j-status.doc: items 8-16) */}
      {level >= 2 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi
              label="Pelajar Baharu Bulan Ini"
              value={students.new_this_month}
              note={<Growth pct={students.new_growth_pct} emptyText={`Bulan lepas: ${students.new_last_month}`} />}
            />
            <Kpi label="Guru Aktif" value={teachers.active} note={<span className="text-[11px] text-slate-400">{teachers.permanent} tetap, {teachers.replacement} ganti</span>} />
            <Kpi label="Permit Hampir / Telah Luput" value={teachers.permits_expiring.length} tone={teachers.permits_expiring.length ? 'text-amber-600' : 'text-slate-900'}
              note={teachers.permits_missing > 0 && <span className="text-[11px] text-slate-400">{teachers.permits_missing} guru tiada tarikh permit</span>} />
            <Kpi label="Menunggu Kelulusan Anda"
              value={approvals.registrations_pending + approvals.vouchers_pending_supervisor + approvals.leave_pending + approvals.master_data_pending + approvals.reschedules_pending + (level >= 3 ? approvals.vouchers_pending_management + approvals.rate_increments_pending : 0)}
              tone="text-blue-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card title="Jumlah Pelajar Mengikut Bulan" subtitle="Pelajar berdaftar pada akhir bulan" className="lg:col-span-2">
              <LineChart series={[
                { label: String(new Date().getFullYear()), values: students.trend_this_year.map((m) => m.total), stroke: 'stroke-indigo-600', fill: 'fill-indigo-600', swatch: 'bg-indigo-600' },
                { label: String(new Date().getFullYear() - 1), values: students.trend_last_year.map((m) => m.total), stroke: 'stroke-slate-400', fill: 'fill-slate-400', swatch: 'bg-slate-400' },
              ]} />
            </Card>
            <Card title="Tempoh Belajar" subtitle="Pelajar berdaftar, sejak tarikh daftar">
              <Bars rows={students.period_of_stay.map((b) => ({ label: b.label, value: b.count }))} colorClass="bg-purple-600" />
            </Card>
            <Card title="Pelajar Baharu vs Berhenti" subtitle={`Setiap bulan ${new Date().getFullYear()}`} className="lg:col-span-2">
              <LineChart series={[
                { label: 'Baharu', values: students.trend_this_year.map((m) => m.new), stroke: 'stroke-emerald-600', fill: 'fill-emerald-600', swatch: 'bg-emerald-600' },
                { label: 'Berhenti', values: students.trend_this_year.map((m) => m.left), stroke: 'stroke-rose-500', fill: 'fill-rose-500', swatch: 'bg-rose-500' },
              ]} />
            </Card>
            <Card title="Status Pelajar" subtitle="Aktif, ditangguh, tidak aktif">
              <Bars rows={[
                { label: 'Aktif', value: students.active },
                { label: 'Ditangguh', value: students.on_hold },
                { label: 'Tidak Aktif', value: students.inactive },
              ]} colorClass="bg-blue-600" />
            </Card>
            <Card title="Kategori Sekolah" subtitle="Pelajar aktif">
              <Bars rows={students.by_school_category.map((c) => ({ label: c.category, value: c.count }))} colorClass="bg-teal-600" />
            </Card>
            <Card title="Subjek Mengikut Tingkatan" subtitle="Bilangan pendaftaran kelas">
              {students.subjects_by_form.length === 0 ? (
                <p className="text-xs text-slate-400">Tiada pendaftaran kelas.</p>
              ) : (
                <div className="space-y-3 text-xs max-h-72 overflow-y-auto pr-1">
                  {students.subjects_by_form.map((f) => (
                    <div key={f.form}>
                      <div className="font-bold text-slate-800 mb-1">{f.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {f.subjects.map((s) => (
                          <span key={s.subject} className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-semibold">
                            {s.subject}: {s.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Management (j-status.doc: sales growth, collection status) */}
      {level >= 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="Status Kutipan Invois" subtitle="Semua invois">
            <Bars
              rows={finance.collection_status.map((c) => ({
                label: INVOICE_STATUS[c.status] || c.status,
                value: c.count,
                display: `${c.count} invois`,
              }))}
              colorClass="bg-emerald-600"
            />
          </Card>
          <Card title="Jualan & Perbelanjaan Bulan Ini" action={<TrendingUp className="w-4 h-4 text-indigo-600" />}>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span>Kutipan bulan ini</span><strong>{money(finance.collected_this_month)}</strong></div>
              <div className="flex justify-between"><span>Kutipan bulan lepas</span><strong>{money(finance.collected_last_month)}</strong></div>
              <div className="flex justify-between"><span>Perbelanjaan (baucar disahkan/diluluskan)</span><strong>{money(finance.expenses_this_month)}</strong></div>
              <div className="pt-2"><Growth pct={finance.sales_growth_pct} /></div>
            </div>
          </Card>
          <Card
            title="Baucar Menunggu Kelulusan"
            action={<button onClick={() => onNavigate('expenses')} className="text-xs text-indigo-600 font-bold hover:underline">Baucar →</button>}
          >
            {data.pending_vouchers.length === 0 ? (
              <p className="text-xs text-slate-400">Tiada baucar menunggu.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {data.pending_vouchers.map((pv) => (
                  <div key={pv.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex justify-between gap-2 font-bold text-slate-900">
                      <span>{pv.pv_number} • {pv.vendor || '-'}</span>
                      <span>{money(pv.amount)}</span>
                    </div>
                    <p className="text-slate-500 mt-0.5">{pv.category}{pv.status === 'PENDING_MANAGEMENT' ? ' • Kuasa Management' : ' • Tahap Supervisor'}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {level >= 3 && (
        <p className="text-[11px] text-slate-400">
          Belum dijejak oleh sistem: hari lahir staf (tiada tarikh lahir dalam rekod staf).
        </p>
      )}
    </div>
  );
}
