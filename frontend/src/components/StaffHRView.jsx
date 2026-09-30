import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Plus, X, Download, Cake, FileWarning } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { staffApi, hrApi } from '../api/client';
import { today, downloadCsv } from './studentShared';
import StaffProfileModal, { EMPLOYMENT, LEAVE_LABELS } from './StaffProfileModal';

const LEAVE_STATUS = {
  PENDING: { label: 'Menunggu', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Diluluskan', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Ditolak', cls: 'bg-rose-100 text-rose-800' },
};
const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white';
const hhmm = (t) => (t ? String(t).slice(0, 5) : '-');
const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} min` : `${m} min`);

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AttendanceTable({ rows }) {
  if (rows.length === 0) return <p className="text-slate-400">Tiada rekod kehadiran bulan ini.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Tarikh</th><th className="px-3">Masuk</th><th className="px-3">Keluar</th><th className="px-3">Lewat</th><th className="px-3">Balik awal</th><th className="px-3">Catatan</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 px-3">{r.date}</td>
              <td className="px-3">{hhmm(r.clock_in)}</td>
              <td className="px-3">{hhmm(r.clock_out)}</td>
              <td className={`px-3 ${r.late_minutes ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{r.late_minutes ? mins(r.late_minutes) : '-'}</td>
              <td className={`px-3 ${r.early_minutes ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>{r.early_minutes ? mins(r.early_minutes) : '-'}</td>
              <td className="px-3 text-slate-500">{r.note}{r.corrected_by && <span className="text-[10px]"> (dibetulkan {r.corrected_by})</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StaffHRView({ currentRole }) {
  const { staff, leaveRequests, staffAction, refreshStaff } = useApp();
  const isApprover = currentRole === 'SUPERVISOR' || currentRole === 'MANAGEMENT';
  const isManagement = currentRole === 'MANAGEMENT';
  const [tab, setTab] = useState('attendance');
  const [me, setMe] = useState(undefined); // undefined = loading, null = not linked
  const [viewStaff, setViewStaff] = useState('');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [records, setRecords] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [profileId, setProfileId] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff]);
  const loadMe = useCallback(() => hrApi.me().then(setMe).catch(() => setMe(null)), []);
  useEffect(() => { loadMe(); }, [loadMe]);

  // Whose attendance is shown: own record, or any staff for Supervisor / Management
  const shownStaff = isApprover && viewStaff ? Number(viewStaff) : me?.id;
  const loadRecords = useCallback(() => {
    if (!shownStaff) { setRecords([]); return; }
    hrApi.attendance({ staff: shownStaff, month }).then(setRecords).catch(() => setRecords([]));
  }, [shownStaff, month]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const loadReport = useCallback(() => {
    if (!isApprover) return;
    hrApi.report(month, month.slice(0, 4)).then(setReport).catch(() => setReport(null));
  }, [isApprover, month]);
  useEffect(() => { if (tab === 'reports') loadReport(); }, [tab, loadReport]);

  const todayRecord = me && shownStaff === me.id ? records.find((r) => r.date === today()) : null;

  const run = async (call, message, after) => {
    setBusy(true);
    try {
      const res = await staffAction(call, message);
      setDialog(null);
      after?.();
      return res;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  };

  const open = (type, preset = {}) => { setDialog(type); setForm(preset); };
  const leaves = isApprover ? leaveRequests : leaveRequests.filter((l) => me && l.staff === me.id);
  const pendingCount = leaves.filter((l) => l.status === 'PENDING').length;
  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${tab === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
  );
  const balanceCards = isApprover ? activeStaff : activeStaff.filter((s) => me && s.id === me.id);

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Staf: Kehadiran, Cuti & Profil</h2>
          <p className="text-slate-500">Clock in/out untuk diri sendiri; lewat dan balik awal dikira daripada waktu kerja setiap staf. Maklumat kerja diisi oleh Management.</p>
        </div>
        <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-slate-200">
          {tabBtn('attendance', 'Perakam Waktu')}
          {tabBtn('leave', `Cuti${pendingCount ? ` (${pendingCount} menunggu)` : ''}`)}
          {tabBtn('directory', `Direktori (${activeStaff.length})`)}
          {isApprover && tabBtn('reports', 'Laporan & KPI')}
        </div>
      </div>

      {tab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 h-fit">
            {me === null ? (
              <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">Akaun anda belum dipautkan kepada rekod staf, jadi anda tidak boleh clock in. Management boleh memautkan akaun dalam profil staf (Maklumat Kerja → Akaun log masuk).</p>
            ) : me && (
              <>
                <div className="font-bold text-slate-900">{me.name}</div>
                <div className="text-slate-500">Waktu kerja {hhmm(me.work_start)} – {hhmm(me.work_end)}</div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5"><Clock className="w-4 h-4 text-indigo-600" /> Hari ini ({today()})</div>
                  <div>Masuk: <strong>{hhmm(todayRecord?.clock_in)}</strong>{todayRecord?.late_minutes > 0 && <span className="text-rose-600"> (lewat {mins(todayRecord.late_minutes)})</span>}</div>
                  <div>Keluar: <strong>{hhmm(todayRecord?.clock_out)}</strong></div>
                </div>
                <button disabled={busy || Boolean(todayRecord?.clock_out)}
                  onClick={() => run(() => staffApi.toggleClock(), (r) => r.message, () => { setViewStaff(''); loadRecords(); })}
                  className={`w-full py-3 rounded-xl font-bold text-white disabled:opacity-50 cursor-pointer ${todayRecord && !todayRecord.clock_out ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  {todayRecord?.clock_out ? 'Selesai hari ini' : todayRecord ? 'Clock Out' : 'Clock In'}
                </button>
              </>
            )}
            {isApprover && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="block font-semibold text-slate-700">Lihat rekod staf
                  <select value={viewStaff} onChange={(e) => setViewStaff(e.target.value)} className={`${input} mt-1`}>
                    <option value="">{me ? 'Rekod saya' : 'Pilih staf'}</option>
                    {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <button onClick={() => open('correct', { staff: viewStaff || me?.id || '', date: today(), clock_in: '', clock_out: '', note: '' })}
                  className="w-full py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Betulkan / rekod masa</button>
              </div>
            )}
          </div>
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">Rekod {staff.find((s) => s.id === shownStaff)?.name || ''}</h3>
              <input type="month" aria-label="Bulan" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200" />
            </div>
            <AttendanceTable rows={records} />
          </div>
        </div>
      )}

      {tab === 'leave' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {balanceCards.map((s) => (
              <div key={s.id} className="p-4 bg-white rounded-2xl border border-slate-200">
                <div className="font-bold text-slate-900">{s.name}</div>
                <div className="text-slate-500 mb-2">{s.role}</div>
                <div className="grid grid-cols-4 gap-1 text-center">
                  {Object.entries(s.leave_balances || {}).map(([k, v]) => (
                    <div key={k} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200" title={`${LEAVE_LABELS[k]}: layak ${v.entitled ?? '-'}, diguna ${v.used}`}>
                      <div className="text-[10px] text-slate-500">{k}</div>
                      <div className={`font-black ${v.balance !== null && v.balance <= 0 ? 'text-rose-600' : 'text-slate-900'}`}>{v.balance ?? v.used}</div>
                      <div className="text-[9px] text-slate-400">{v.balance === null ? 'diguna' : `/${v.entitled}`}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Permohonan Cuti</h3>
              {(me || isApprover) && (
                <button onClick={() => open('leave', { staff: me?.id || activeStaff[0]?.id || '', leave_type: 'AL', start_date: today(), end_date: today(), reason: '' })}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Mohon Cuti</button>
              )}
            </div>
            {leaves.length === 0 ? <p className="text-slate-400">Tiada permohonan.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Staf</th><th className="px-3">Jenis</th><th className="px-3">Tarikh</th><th className="px-3">Hari kerja</th><th className="px-3">Sebab</th><th className="px-3">Status</th><th className="px-3 text-right">Tindakan</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaves.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 px-3 font-semibold">{l.staff_name}<div className="text-[10px] text-slate-400 font-normal">{l.leave_id} • mohon {String(l.applied_at).slice(0, 10)}</div></td>
                        <td className="px-3">{LEAVE_LABELS[l.leave_type]}</td>
                        <td className="px-3 whitespace-nowrap">{l.start_date} - {l.end_date}</td>
                        <td className="px-3">{l.days_count}</td>
                        <td className="px-3 text-slate-600">{l.reason}{l.supervisor_remark && <div className="text-[10px] text-slate-400">{l.supervisor_remark}</div>}</td>
                        <td className="px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${LEAVE_STATUS[l.status]?.cls}`}>{LEAVE_STATUS[l.status]?.label}</span></td>
                        <td className="px-3 text-right">
                          {l.status === 'PENDING' && (
                            <div className="inline-flex gap-1.5">
                              {isApprover && <button onClick={() => open('reject', { leave: l, remark: '' })} className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 font-semibold cursor-pointer">Tolak</button>}
                              {isApprover && <button onClick={() => open('approve', { leave: l, remark: '' })} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer">Luluskan</button>}
                              {me && l.staff === me.id && <button onClick={() => run(() => hrApi.cancelLeave(l.id), 'Permohonan dibatalkan.')} className="px-2.5 py-1 rounded-lg border border-slate-200 font-semibold cursor-pointer">Batal</button>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'directory' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex justify-end">
            {isManagement && <button onClick={() => open('new', { name: '', phone: '', role: '', department: 'Pentadbiran & Khidmat Pelanggan', employment_type: 'PERMANENT', join_date: today() })}
              className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Tambah Staf</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-3 px-3">ID</th><th className="px-3">Nama</th><th className="px-3">Jawatan</th><th className="px-3">Jenis</th><th className="px-3">Telefon</th><th className="px-3">Mula Kerja</th><th className="px-3">Kontrak Tamat</th><th className="px-3">Akaun</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((s) => (
                  <tr key={s.id} onClick={() => setProfileId(s.id)} className={`cursor-pointer hover:bg-slate-50 ${s.is_active ? '' : 'text-slate-400'}`}>
                    <td className="py-2.5 px-3 font-bold text-indigo-700">{s.staff_id}</td>
                    <td className="px-3 font-semibold">{s.name}{!s.is_active && ' (tidak aktif)'}</td>
                    <td className="px-3">{s.role}<div className="text-[10px] text-slate-400">{s.department}</div></td>
                    <td className="px-3">{s.employment_type_label}</td>
                    <td className="px-3">{s.phone}</td>
                    <td className="px-3">{s.join_date || '-'}</td>
                    <td className="px-3">{s.contract_end || '-'}</td>
                    <td className="px-3">{s.username || <span className="text-amber-700">belum dipautkan</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">Klik staf untuk profil penuh: maklumat peribadi, waris kecemasan, maklumat kerja, sejarah, KPI dan rekod.</p>
        </div>
      )}

      {tab === 'reports' && isApprover && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <label className="font-semibold text-slate-700 flex items-center gap-2">Bulan <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200" /></label>
          </div>
          {!report ? <p className="text-slate-400">Memuatkan…</p> : (
            <>
              {(report.alerts.contracts_ending.length > 0 || report.alerts.birthdays.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {report.alerts.contracts_ending.map((c) => (
                    <div key={c.code} className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2"><FileWarning className="w-4 h-4 shrink-0" />
                      Kontrak {c.name} {c.days_left < 0 ? `tamat ${-c.days_left} hari lepas` : `tamat dalam ${c.days_left} hari`} ({c.contract_end})</div>
                  ))}
                  {report.alerts.birthdays.map((b) => (
                    <div key={b.code} className="p-3 rounded-xl bg-pink-50 border border-pink-200 text-pink-900 flex items-center gap-2"><Cake className="w-4 h-4 shrink-0" />
                      Hari lahir {b.name} {b.days_left === 0 ? 'hari ini' : `dalam ${b.days_left} hari`} ({b.date})</div>
                  ))}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Laporan Kehadiran Bulanan</h3>
                    <p className="text-slate-500">Hingga {report.attendance.until}. Cuti yang diluluskan tidak dikira sebagai tidak hadir.</p>
                  </div>
                  <button onClick={() => downloadCsv(`kehadiran-staf-${month}.csv`, ['ID', 'Nama', 'Hari Kerja', 'Hadir', 'Cuti', 'Tidak Hadir', 'Lewat (kali)', 'Lewat (minit)', 'Balik Awal (kali)', 'Balik Awal (minit)', 'Kehadiran %'],
                    report.attendance.rows.map((r) => [r.code, r.name, r.working_days, r.present, r.leave_days, r.absent, r.late, r.late_minutes, r.early, r.early_minutes, r.attendance_pct ?? '']))}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> CSV</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Staf</th><th className="px-3">Waktu</th><th className="px-3">Hari kerja</th><th className="px-3">Hadir</th><th className="px-3">Cuti</th><th className="px-3">Tidak hadir</th><th className="px-3">Lewat</th><th className="px-3">Balik awal</th><th className="px-3">Kehadiran</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.attendance.rows.map((r) => (
                        <tr key={r.staff_id}>
                          <td className="py-2 px-3 font-semibold">{r.name}</td>
                          <td className="px-3">{hhmm(r.work_start)}–{hhmm(r.work_end)}</td>
                          <td className="px-3">{r.working_days}</td>
                          <td className="px-3">{r.present}</td>
                          <td className="px-3">{r.leave_days}</td>
                          <td className={`px-3 ${r.absent ? 'text-rose-600 font-semibold' : ''}`}>{r.absent}</td>
                          <td className="px-3">{r.late ? `${r.late} kali (${mins(r.late_minutes)})` : '-'}</td>
                          <td className="px-3">{r.early ? `${r.early} kali (${mins(r.early_minutes)})` : '-'}</td>
                          <td className="px-3 font-bold">{r.attendance_pct === null ? '-' : `${r.attendance_pct}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Cuti {report.leave.year}: diguna / baki</h3>
                    <button onClick={() => downloadCsv(`cuti-staf-${report.leave.year}.csv`, ['ID', 'Nama', 'AL Layak', 'AL Guna', 'AL Baki', 'MC Layak', 'MC Guna', 'MC Baki', 'EL Layak', 'EL Guna', 'EL Baki', 'UL Guna'],
                      report.leave.rows.map((r) => [r.code, r.name, r.leave.AL.entitled, r.leave.AL.used, r.leave.AL.balance, r.leave.MC.entitled, r.leave.MC.used, r.leave.MC.balance, r.leave.EL.entitled, r.leave.EL.used, r.leave.EL.balance, r.leave.UL.used]))}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1 cursor-pointer"><Download className="w-3.5 h-3.5" /> CSV</button>
                  </div>
                  <table className="w-full text-left">
                    <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-1">Staf</th><th>AL</th><th>MC</th><th>EL</th><th>UL</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.leave.rows.map((r) => (
                        <tr key={r.staff_id}><td className="py-1.5 font-semibold">{r.name}</td>
                          {['AL', 'MC', 'EL'].map((k) => <td key={k}>{r.leave[k].used}/{r.leave[k].entitled} <span className="text-slate-400">(baki {r.leave[k].balance})</span></td>)}
                          <td>{r.leave.UL.used}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Pencapaian KPI {report.kpi.year}</h3>
                  {report.kpi.rows.length === 0 ? <p className="text-slate-400">Tiada KPI ditetapkan. Tetapkan KPI dalam profil staf (Direktori).</p> : (
                    <table className="w-full text-left">
                      <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-1">Staf</th><th>KPI</th><th>Disemak</th><th>Pencapaian</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.kpi.rows.map((r) => (
                          <tr key={r.staff_id}><td className="py-1.5 font-semibold">{r.name}</td><td>{r.kpis}</td><td>{r.reviewed}</td>
                            <td className="font-bold">{r.achievement_pct === null ? '-' : `${r.achievement_pct}%`}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p className="text-[11px] text-slate-400">Pencapaian = purata skor KPI yang telah disemak, mengikut pemberat.</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {dialog === 'leave' && (
        <Modal title="Permohonan Cuti" onClose={() => setDialog(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(() => staffApi.applyLeave({ ...form, staff: Number(form.staff) }), (l) => `Permohonan ${l.leave_id} dihantar (${l.days_count} hari kerja).`); }} className="space-y-3">
            <label className="block font-semibold text-slate-700">Staf
              <select required disabled={!isApprover} value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })} className={`${input} mt-1`}>
                {(isApprover ? activeStaff : activeStaff.filter((s) => me && s.id === me.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block font-semibold text-slate-700">Jenis cuti
              <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })} className={`${input} mt-1`}>
                {Object.entries(LEAVE_LABELS).map(([k, v]) => {
                  const bal = staff.find((s) => s.id === Number(form.staff))?.leave_balances?.[k];
                  return <option key={k} value={k}>{v}{bal && bal.balance !== null ? ` (baki ${bal.balance})` : ''}</option>;
                })}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="font-semibold text-slate-700">Dari<input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={`${input} mt-1`} /></label>
              <label className="font-semibold text-slate-700">Hingga<input type="date" required min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={`${input} mt-1`} /></label>
            </div>
            <p className="text-slate-500">Hanya hari bekerja staf dikira.</p>
            <label className="block font-semibold text-slate-700">Sebab
              <textarea required rows="2" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={`${input} mt-1`} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer disabled:opacity-60">Hantar</button>
            </div>
          </form>
        </Modal>
      )}

      {['approve', 'reject'].includes(dialog) && (
        <Modal title={dialog === 'approve' ? 'Luluskan Cuti' : 'Tolak Cuti'} onClose={() => setDialog(null)}>
          <p className="text-slate-600">{form.leave.staff_name} • {LEAVE_LABELS[form.leave.leave_type]} • {form.leave.start_date} - {form.leave.end_date} ({form.leave.days_count} hari)</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const call = dialog === 'approve' ? staffApi.approveLeave : staffApi.rejectLeave;
            run(() => call(form.leave.id, currentRole, form.remark), dialog === 'approve' ? 'Cuti diluluskan.' : 'Cuti ditolak.');
          }} className="space-y-3">
            <label className="block font-semibold text-slate-700">{dialog === 'approve' ? 'Catatan (pilihan)' : 'Sebab penolakan *'}
              <textarea rows="2" required={dialog === 'reject'} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} className={`${input} mt-1`} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" disabled={busy} className={`px-4 py-2 rounded-xl text-white font-bold cursor-pointer ${dialog === 'approve' ? 'bg-emerald-600' : 'bg-rose-600'}`}>{dialog === 'approve' ? 'Luluskan' : 'Tolak'}</button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === 'correct' && (
        <Modal title="Betulkan / Rekod Masa" onClose={() => setDialog(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(() => hrApi.correctAttendance({ ...form, staff: Number(form.staff) }), 'Masa kehadiran disimpan.', loadRecords); }} className="space-y-3">
            <label className="block font-semibold text-slate-700">Staf
              <select required value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })} className={`${input} mt-1`}>
                <option value="">Pilih staf</option>
                {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="font-semibold text-slate-700">Tarikh<input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${input} mt-1`} /></label>
              <label className="font-semibold text-slate-700">Masuk<input type="time" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} className={`${input} mt-1`} /></label>
              <label className="font-semibold text-slate-700">Keluar<input type="time" value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} className={`${input} mt-1`} /></label>
            </div>
            <label className="block font-semibold text-slate-700">Sebab pembetulan *
              <input required placeholder="cth. terlupa clock-out" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={`${input} mt-1`} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer">Simpan</button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === 'new' && (
        <Modal title="Tambah Staf" onClose={() => setDialog(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(() => hrApi.createStaff(form), (s) => `Staf ${s.staff_id} ditambah. Lengkapkan profil dalam Direktori.`); }} className="space-y-3">
            <label className="block font-semibold text-slate-700">Nama *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} /></label>
            <label className="block font-semibold text-slate-700">Telefon *<input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} mt-1`} /></label>
            <label className="block font-semibold text-slate-700">Jawatan *<input required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={`${input} mt-1`} /></label>
            <label className="block font-semibold text-slate-700">Jabatan<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={`${input} mt-1`} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="font-semibold text-slate-700">Jenis
                <select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} className={`${input} mt-1`}>{EMPLOYMENT.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
              </label>
              <label className="font-semibold text-slate-700">Tarikh mula<input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} className={`${input} mt-1`} /></label>
            </div>
            <p className="text-slate-500">ID staf dijana automatik.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer">Simpan</button>
            </div>
          </form>
        </Modal>
      )}

      {profileId && <StaffProfileModal staffId={profileId} currentRole={currentRole} onClose={() => { setProfileId(null); refreshStaff(); loadMe(); }} />}
    </div>
  );
}
