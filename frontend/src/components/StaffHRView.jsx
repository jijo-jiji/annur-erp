import { useCallback, useEffect, useState } from 'react';
import { Cake, Download, FileWarning, Plus, Users } from 'lucide-react';
import { hrApi, staffApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { date, dateLong, monthLabel, todayISO } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import FormModal from './FormModal';
import StaffProfileModal, { EMPLOYMENT, LEAVE_LABELS } from './StaffProfileModal';
import { Badge, Button, Card, CardHeader, cx, EmptyState, filterClass, inputClass, PageHeader, Table, Tabs, Td, Th } from './ui';

const LEAVE_STATUS = {
  PENDING: { label: 'Menunggu', tone: 'amber' },
  APPROVED: { label: 'Diluluskan', tone: 'green' },
  REJECTED: { label: 'Ditolak', tone: 'red' },
  CANCELLED: { label: 'Dibatalkan', tone: 'neutral' },
};
const hhmm = (t) => (t ? String(t).slice(0, 5) : '—');
const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} min` : `${m} min`);

function AttendanceTable({ rows }) {
  if (rows.length === 0) return <EmptyState title="Tiada rekod kehadiran bulan ini" />;
  return (
    <Table>
      <thead><tr><Th>Tarikh</Th><Th>Masuk</Th><Th>Keluar</Th><Th>Lewat</Th><Th>Balik awal</Th><Th>Catatan</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap">{date(r.date)}</Td>
            <Td className="tnum">{hhmm(r.clock_in)}</Td>
            <Td className="tnum">{hhmm(r.clock_out)}</Td>
            <Td className={r.late_minutes ? 'font-medium text-red-700' : 'text-gray-400'}>{r.late_minutes ? mins(r.late_minutes) : '—'}</Td>
            <Td className={r.early_minutes ? 'font-medium text-amber-700' : 'text-gray-400'}>{r.early_minutes ? mins(r.early_minutes) : '—'}</Td>
            <Td className="text-gray-600">{r.note}{r.corrected_by && <span className="text-xs text-gray-400"> (dibetulkan oleh {r.corrected_by})</span>}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// Staff clock in / out for themselves; Supervisor and Management see everyone, approve leave
// and read the monthly reports. Job details are filled in by Management in the staff profile.
export default function StaffHRView({ role }) {
  const { staff, leaveRequests, staffAction, refreshStaff } = useApp();
  const isApprover = role === 'SUPERVISOR' || role === 'MANAGEMENT';
  const isManagement = role === 'MANAGEMENT';
  const [tab, setTab] = useState('attendance');
  const [me, setMe] = useState(undefined); // undefined = loading, null = not linked to a staff record
  const [viewStaff, setViewStaff] = useState('');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [records, setRecords] = useState([]);
  const [dialog, setDialog] = useState(null); // { type, leave }
  const [profileId, setProfileId] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const active = staff.filter((s) => s.is_active);
  const loadMe = useCallback(() => hrApi.me().then(setMe).catch(() => setMe(null)), []);
  useEffect(() => { loadMe(); }, [loadMe]);

  // Whose attendance is shown: own record, or any staff for Supervisor / Management
  const shownStaff = isApprover && viewStaff ? Number(viewStaff) : me?.id;
  const loadRecords = useCallback(() => {
    if (!shownStaff) { setRecords([]); return; }
    hrApi.attendance({ staff: shownStaff, month }).then(setRecords).catch(() => setRecords([]));
  }, [shownStaff, month]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  useEffect(() => {
    if (tab !== 'reports' || !isApprover) return;
    hrApi.report(month, month.slice(0, 4)).then(setReport).catch(() => setReport(null));
  }, [tab, isApprover, month]);

  const todayRecord = me && shownStaff === me.id ? records.find((r) => r.date === todayISO()) : null;
  const leaves = isApprover ? leaveRequests : leaveRequests.filter((l) => me && l.staff === me.id);
  const pendingCount = leaves.filter((l) => l.status === 'PENDING').length;
  const balanceCards = isApprover ? active : active.filter((s) => me && s.id === me.id);
  const leaveStaff = isApprover ? active : balanceCards;
  const staffOptions = active.map((s) => ({ value: s.id, label: s.name }));

  const clock = async () => {
    setBusy(true);
    try {
      await staffAction(() => staffApi.toggleClock(), (r) => r.message);
      setViewStaff('');
      loadRecords();
    } catch {
      // the reason has already been shown
    } finally {
      setBusy(false);
    }
  };

  const monthPicker = <input type="month" aria-label="Bulan" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={filterClass} />;

  return (
    <>
      <PageHeader
        title="Staf: kehadiran & cuti"
        description="Clock in dan clock out untuk diri sendiri; lewat dan balik awal dikira daripada waktu kerja setiap staf."
      />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'attendance', label: 'Perakam waktu' },
          { value: 'leave', label: 'Cuti', count: pendingCount },
          { value: 'directory', label: 'Direktori', count: active.length },
          ...(isApprover ? [{ value: 'reports', label: 'Laporan & KPI' }] : []),
        ]}
      />

      {tab === 'attendance' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="self-start">
            <div className="space-y-4 p-5">
              {me === null ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                  Akaun anda belum dipautkan kepada rekod staf, jadi anda tidak boleh clock in. Pengurusan boleh memautkan akaun dalam profil staf (Maklumat kerja, Akaun log masuk).
                </p>
              ) : me && (
                <>
                  <div>
                    <p className="font-semibold text-gray-900">{me.name}</p>
                    <p className="text-[13px] text-gray-500">Waktu kerja {hhmm(me.work_start)} – {hhmm(me.work_end)}</p>
                  </div>
                  <dl className="rounded-md bg-gray-50 px-4 py-3 text-sm">
                    <p className="mb-1 text-[13px] font-medium text-gray-700">{dateLong(todayISO())}</p>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Masuk</dt>
                      <dd className="font-medium tnum">{hhmm(todayRecord?.clock_in)}{todayRecord?.late_minutes > 0 && <span className="font-normal text-red-700"> (lewat {mins(todayRecord.late_minutes)})</span>}</dd>
                    </div>
                    <div className="flex justify-between"><dt className="text-gray-600">Keluar</dt><dd className="font-medium tnum">{hhmm(todayRecord?.clock_out)}</dd></div>
                  </dl>
                  <Button
                    size="lg"
                    variant={todayRecord && !todayRecord.clock_out ? 'danger' : 'primary'}
                    className="w-full"
                    disabled={busy || Boolean(todayRecord?.clock_out)}
                    onClick={clock}
                  >
                    {todayRecord?.clock_out ? 'Selesai hari ini' : todayRecord ? 'Clock out' : 'Clock in'}
                  </Button>
                </>
              )}
              {isApprover && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <label className="block text-[13px] font-medium text-gray-700">
                    Lihat rekod staf
                    <select value={viewStaff} onChange={(e) => setViewStaff(e.target.value)} className={cx(inputClass, 'mt-1.5')}>
                      <option value="">{me ? 'Rekod saya' : 'Pilih staf'}</option>
                      {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  <Button className="w-full" onClick={() => setDialog({ type: 'correct' })}>Betulkan / rekod masa</Button>
                </div>
              )}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title={`Rekod ${staff.find((s) => s.id === shownStaff)?.name || ''}`} description={monthLabel(month)} actions={monthPicker} />
            <AttendanceTable rows={records} />
          </Card>
        </div>
      )}

      {tab === 'leave' && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {balanceCards.map((s) => (
              <Card key={s.id} className="p-4">
                <p className="font-medium text-gray-900">{s.name}</p>
                <p className="mb-3 text-[13px] text-gray-500">{s.role}</p>
                <dl className="grid grid-cols-4 gap-1.5 text-center">
                  {Object.entries(s.leave_balances || {}).map(([k, v]) => (
                    <div key={k} className="rounded-md bg-gray-50 px-1 py-2" title={`${LEAVE_LABELS[k]}: layak ${v.entitled ?? '—'}, diguna ${v.used}`}>
                      <dt className="text-xs text-gray-500">{k}</dt>
                      <dd className={cx('text-base font-semibold tnum', v.balance !== null && v.balance <= 0 ? 'text-red-700' : 'text-gray-900')}>{v.balance ?? v.used}</dd>
                      <p className="text-[11px] text-gray-400">{v.balance === null ? 'diguna' : `/ ${v.entitled}`}</p>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Permohonan cuti"
              actions={(me || isApprover) && <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'leave' })}>Mohon cuti</Button>}
            />
            {leaves.length === 0 ? <EmptyState title="Tiada permohonan" /> : (
              <Table>
                <thead>
                  <tr><Th>Staf</Th><Th>Jenis</Th><Th>Tarikh</Th><Th className="text-right">Hari kerja</Th><Th>Sebab</Th><Th>Status</Th><Th className="w-0"><span className="sr-only">Tindakan</span></Th></tr>
                </thead>
                <tbody>
                  {leaves.map((l) => (
                    <tr key={l.id} className="align-top">
                      <Td>
                        <p className="font-medium text-gray-900">{l.staff_name}</p>
                        <p className="text-[13px] text-gray-500">{l.leave_id} · mohon {date(String(l.applied_at).slice(0, 10))}</p>
                      </Td>
                      <Td className="whitespace-nowrap">{LEAVE_LABELS[l.leave_type]}</Td>
                      <Td className="whitespace-nowrap">{date(l.start_date)} – {date(l.end_date)}</Td>
                      <Td className="text-right tnum">{l.days_count}</Td>
                      <Td className="max-w-xs text-gray-600">{l.reason}{l.supervisor_remark && <p className="text-[13px] text-gray-400">{l.supervisor_remark}</p>}</Td>
                      <Td><Badge tone={LEAVE_STATUS[l.status]?.tone}>{LEAVE_STATUS[l.status]?.label ?? l.status}</Badge></Td>
                      <Td className="whitespace-nowrap">
                        {l.status === 'PENDING' && (
                          <div className="flex justify-end gap-1.5">
                            {isApprover && <Button size="sm" variant="danger" onClick={() => setDialog({ type: 'reject', leave: l })}>Tolak</Button>}
                            {isApprover && <Button size="sm" variant="primary" onClick={() => setDialog({ type: 'approve', leave: l })}>Luluskan</Button>}
                            {me && l.staff === me.id && <Button size="sm" onClick={() => staffAction(() => hrApi.cancelLeave(l.id), 'Permohonan dibatalkan.').catch(() => {})}>Batal</Button>}
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === 'directory' && (
        <Card>
          <CardHeader
            title="Direktori staf"
            description="Klik staf untuk profil penuh: maklumat peribadi, waris kecemasan, maklumat kerja, sejarah, KPI dan rekod."
            actions={isManagement && <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'new' })}>Tambah staf</Button>}
          />
          {staff.length === 0 ? <EmptyState icon={Users} title="Belum ada staf" /> : (
            <Table>
              <thead>
                <tr><Th>Staf</Th><Th>Jawatan</Th><Th>Jenis</Th><Th>Telefon</Th><Th>Mula kerja</Th><Th>Kontrak tamat</Th><Th>Akaun</Th></tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} onClick={() => setProfileId(s.id)} className={cx('cursor-pointer hover:bg-gray-50', !s.is_active && 'text-gray-400')}>
                    <Td>
                      <p className={cx('font-medium', s.is_active && 'text-gray-900')}>{s.name}{!s.is_active && ' (tidak aktif)'}</p>
                      <p className="text-[13px] text-gray-500">{s.staff_id}</p>
                    </Td>
                    <Td>{s.role}<p className="text-[13px] text-gray-500">{s.department}</p></Td>
                    <Td className="whitespace-nowrap">{s.employment_type_label}</Td>
                    <Td className="whitespace-nowrap">{s.phone}</Td>
                    <Td className="whitespace-nowrap">{date(s.join_date)}</Td>
                    <Td className="whitespace-nowrap">{date(s.contract_end)}</Td>
                    <Td>{s.username || <Badge tone="amber">Belum dipautkan</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'reports' && isApprover && (!report ? <p className="py-10 text-center text-sm text-gray-500">Memuatkan…</p> : (
        <div className="space-y-6">
          {(report.alerts.contracts_ending.length > 0 || report.alerts.birthdays.length > 0) && (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {report.alerts.contracts_ending.map((c) => (
                <li key={c.code} className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <FileWarning className="size-4 shrink-0" />
                  Kontrak {c.name} {c.days_left < 0 ? `tamat ${-c.days_left} hari lepas` : `tamat dalam ${c.days_left} hari`} ({date(c.contract_end)})
                </li>
              ))}
              {report.alerts.birthdays.map((b) => (
                <li key={b.code} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
                  <Cake className="size-4 shrink-0 text-brand-600" />
                  Hari lahir {b.name} {b.days_left === 0 ? 'hari ini' : `dalam ${b.days_left} hari`} ({b.date})
                </li>
              ))}
            </ul>
          )}

          <Card>
            <CardHeader
              title="Laporan kehadiran bulanan"
              description={`Hingga ${date(report.attendance.until)}. Cuti yang diluluskan tidak dikira sebagai tidak hadir.`}
              actions={
                <>
                  {monthPicker}
                  <Button size="sm" icon={Download} onClick={() => downloadCsv(`kehadiran-staf-${month}.csv`,
                    ['ID', 'Nama', 'Hari kerja', 'Hadir', 'Cuti', 'Tidak hadir', 'Lewat (kali)', 'Lewat (minit)', 'Balik awal (kali)', 'Balik awal (minit)', 'Kehadiran %'],
                    report.attendance.rows.map((r) => [r.code, r.name, r.working_days, r.present, r.leave_days, r.absent, r.late, r.late_minutes, r.early, r.early_minutes, r.attendance_pct ?? '']))}
                  >
                    Excel
                  </Button>
                </>
              }
            />
            <Table>
              <thead>
                <tr>
                  <Th>Staf</Th><Th>Waktu</Th><Th className="text-right">Hari kerja</Th><Th className="text-right">Hadir</Th><Th className="text-right">Cuti</Th>
                  <Th className="text-right">Tidak hadir</Th><Th>Lewat</Th><Th>Balik awal</Th><Th className="text-right">Kehadiran</Th>
                </tr>
              </thead>
              <tbody>
                {report.attendance.rows.map((r) => (
                  <tr key={r.staff_id}>
                    <Td className="font-medium text-gray-900">{r.name}</Td>
                    <Td className="whitespace-nowrap tnum">{hhmm(r.work_start)}–{hhmm(r.work_end)}</Td>
                    <Td className="text-right tnum">{r.working_days}</Td>
                    <Td className="text-right tnum">{r.present}</Td>
                    <Td className="text-right tnum">{r.leave_days}</Td>
                    <Td className={cx('text-right tnum', r.absent > 0 && 'font-medium text-red-700')}>{r.absent}</Td>
                    <Td className="whitespace-nowrap">{r.late ? `${r.late} kali (${mins(r.late_minutes)})` : '—'}</Td>
                    <Td className="whitespace-nowrap">{r.early ? `${r.early} kali (${mins(r.early_minutes)})` : '—'}</Td>
                    <Td className="text-right font-medium tnum">{r.attendance_pct === null ? '—' : `${r.attendance_pct}%`}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title={`Cuti ${report.leave.year}`}
                description="Diguna / layak, dan baki"
                actions={
                  <Button size="sm" icon={Download} onClick={() => downloadCsv(`cuti-staf-${report.leave.year}.csv`,
                    ['ID', 'Nama', 'AL layak', 'AL guna', 'AL baki', 'MC layak', 'MC guna', 'MC baki', 'EL layak', 'EL guna', 'EL baki', 'UL guna'],
                    report.leave.rows.map((r) => [r.code, r.name, r.leave.AL.entitled, r.leave.AL.used, r.leave.AL.balance, r.leave.MC.entitled, r.leave.MC.used, r.leave.MC.balance,
                      r.leave.EL.entitled, r.leave.EL.used, r.leave.EL.balance, r.leave.UL.used]))}
                  >
                    Excel
                  </Button>
                }
              />
              <Table>
                <thead><tr><Th>Staf</Th><Th>AL</Th><Th>MC</Th><Th>EL</Th><Th className="text-right">UL</Th></tr></thead>
                <tbody>
                  {report.leave.rows.map((r) => (
                    <tr key={r.staff_id}>
                      <Td className="font-medium text-gray-900">{r.name}</Td>
                      {['AL', 'MC', 'EL'].map((k) => (
                        <Td key={k} className="whitespace-nowrap tnum">{r.leave[k].used}/{r.leave[k].entitled} <span className="text-gray-400">(baki {r.leave[k].balance})</span></Td>
                      ))}
                      <Td className="text-right tnum">{r.leave.UL.used}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card>
              <CardHeader title={`Pencapaian KPI ${report.kpi.year}`} description="Purata skor KPI yang telah disemak, mengikut pemberat." />
              {report.kpi.rows.length === 0 ? <EmptyState title="Tiada KPI ditetapkan">Tetapkan KPI dalam profil staf (Direktori).</EmptyState> : (
                <Table>
                  <thead><tr><Th>Staf</Th><Th className="text-right">KPI</Th><Th className="text-right">Disemak</Th><Th className="text-right">Pencapaian</Th></tr></thead>
                  <tbody>
                    {report.kpi.rows.map((r) => (
                      <tr key={r.staff_id}>
                        <Td className="font-medium text-gray-900">{r.name}</Td>
                        <Td className="text-right tnum">{r.kpis}</Td>
                        <Td className="text-right tnum">{r.reviewed}</Td>
                        <Td className="text-right font-medium tnum">{r.achievement_pct === null ? '—' : `${r.achievement_pct}%`}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </div>
      ))}

      {dialog?.type === 'leave' && (
        <LeaveModal staffList={leaveStaff} allStaff={staff} defaultStaff={me?.id || leaveStaff[0]?.id || ''} canPick={isApprover} onClose={() => setDialog(null)} />
      )}
      {['approve', 'reject'].includes(dialog?.type) && (
        <FormModal
          title={dialog.type === 'approve' ? 'Luluskan cuti' : 'Tolak cuti'}
          description={`${dialog.leave.staff_name} · ${LEAVE_LABELS[dialog.leave.leave_type]} · ${date(dialog.leave.start_date)} – ${date(dialog.leave.end_date)} (${dialog.leave.days_count} hari)`}
          danger={dialog.type === 'reject'}
          submitLabel={dialog.type === 'approve' ? 'Luluskan' : 'Tolak'}
          initial={{ remark: '' }}
          fields={[{ name: 'remark', label: dialog.type === 'approve' ? 'Catatan (pilihan)' : 'Sebab penolakan', type: 'textarea', required: dialog.type === 'reject' }]}
          onSubmit={(v) => staffAction(
            () => (dialog.type === 'approve' ? staffApi.approveLeave : staffApi.rejectLeave)(dialog.leave.id, role, v.remark),
            dialog.type === 'approve' ? 'Cuti diluluskan.' : 'Cuti ditolak.',
          )}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'correct' && (
        <FormModal
          title="Betulkan / rekod masa"
          initial={{ staff: viewStaff || me?.id || '', date: todayISO(), clock_in: '', clock_out: '', note: '' }}
          fields={[
            { name: 'staff', label: 'Staf', type: 'select', required: true, options: staffOptions },
            { name: 'date', label: 'Tarikh', type: 'date', required: true },
            { name: 'clock_in', label: 'Masuk', type: 'time' },
            { name: 'clock_out', label: 'Keluar', type: 'time' },
            { name: 'note', label: 'Sebab pembetulan', required: true, hint: 'cth. terlupa clock out' },
          ]}
          onSubmit={(v) => staffAction(() => hrApi.correctAttendance({ ...v, staff: Number(v.staff) }), 'Masa kehadiran disimpan.').then(loadRecords)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'new' && (
        <FormModal
          title="Tambah staf"
          description="ID staf dijana secara automatik. Lengkapkan profil dalam Direktori selepas disimpan."
          initial={{ name: '', phone: '', role: '', department: 'Pentadbiran & Khidmat Pelanggan', employment_type: 'PERMANENT', join_date: todayISO() }}
          fields={[
            { name: 'name', label: 'Nama', required: true },
            { name: 'phone', label: 'Telefon', required: true },
            { name: 'role', label: 'Jawatan', required: true },
            { name: 'department', label: 'Jabatan' },
            { name: 'employment_type', label: 'Jenis pekerjaan', type: 'select', required: true, options: EMPLOYMENT.map((m) => ({ value: m.id, label: m.label })) },
            { name: 'join_date', label: 'Tarikh mula', type: 'date' },
          ]}
          onSubmit={(v) => staffAction(() => hrApi.createStaff(v), (s) => `Staf ${s.staff_id} ditambah.`)}
          onClose={() => setDialog(null)}
        />
      )}

      {profileId && <StaffProfileModal staffId={profileId} role={role} onClose={() => { setProfileId(null); refreshStaff(); loadMe(); }} />}
    </>
  );
}

// The leave type list shows the chosen staff member's balance, so it needs its own state
function LeaveModal({ staffList, allStaff, defaultStaff, canPick, onClose }) {
  const { staffAction } = useApp();
  const [who, setWho] = useState(defaultStaff);
  const balances = allStaff.find((s) => s.id === Number(who))?.leave_balances || {};
  return (
    <FormModal
      title="Permohonan cuti"
      description="Hanya hari bekerja staf dikira."
      submitLabel="Hantar"
      initial={{ staff: who, leave_type: 'AL', start_date: todayISO(), end_date: todayISO(), reason: '' }}
      fields={[
        ...(canPick ? [{ name: 'staff', label: 'Staf', type: 'select', required: true, options: staffList.map((s) => ({ value: s.id, label: s.name })) }] : []),
        {
          name: 'leave_type', label: 'Jenis cuti', type: 'select', required: true,
          options: Object.entries(LEAVE_LABELS).map(([k, v]) => ({ value: k, label: `${v}${balances[k] && balances[k].balance !== null ? ` (baki ${balances[k].balance})` : ''}` })),
        },
        { name: 'start_date', label: 'Dari', type: 'date', required: true },
        { name: 'end_date', label: 'Hingga', type: 'date', required: true },
        { name: 'reason', label: 'Sebab', type: 'textarea', required: true },
      ]}
      onChange={(v) => { if (String(v.staff) !== String(who)) setWho(v.staff); }}
      onSubmit={(v) => staffAction(() => staffApi.applyLeave({ ...v, staff: Number(v.staff) }), (l) => `Permohonan ${l.leave_id} dihantar (${l.days_count} hari kerja).`)}
      onClose={onClose}
    />
  );
}
