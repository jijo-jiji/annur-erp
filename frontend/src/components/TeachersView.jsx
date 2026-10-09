import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, GraduationCap, Plus, Search } from 'lucide-react';
import { staffApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { navigate } from '../lib/nav';
import { classLabel } from '../lib/domain';
import { CURRENT_MONTH, date, DAY_LABEL, formShort, initials, monthLabel, rm, time, todayISO, waLink } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { THRESHOLDS } from '../lib/thresholds';
import ChangeRequestsPanel, { useChangeRequests } from './ChangeRequestsPanel';
import FormModal from './FormModal';
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, EmptyState, PageHeader, SearchInput, Stat, Table, Tabs, Td, Th, useToast, WhatsAppIcon } from './ui';

const WEEKS_PER_MONTH = 4;
const TEACHER_TYPES = [{ value: 'PERMANENT', label: 'Tetap (Permanent)' }, { value: 'REPLACEMENT', label: 'Sambilan (Part-time)' }];

// Years of teaching from the date they started (can be before joining the centre)
function experienceYears(since) {
  if (!since) return null;
  const years = Math.floor((new Date(`${todayISO()}T00:00:00`) - new Date(`${since}T00:00:00`)) / (365.25 * 86400000));
  return years >= 0 ? years : null;
}

// The teacher form; the code and the starting rate are set when the teacher is added. Later pay rises go through Kenaikan kadar.
function teacherFields(adding, subjectOptions) {
  return [
    ...(adding ? [{ name: 'teacher_code', label: 'Kod guru', required: true, hint: 'Singkatan nama, cth. NAK. Digunakan dalam kod kelas dan tidak boleh diubah.' }] : []),
    { name: 'full_name', label: 'Nama penuh', required: true },
    { name: 'phone_number', label: 'Telefon', required: true },
    { name: 'email', label: 'E-mel', type: 'email' },
    { name: 'teacher_type', label: 'Kategori guru', type: 'select', required: true, options: TEACHER_TYPES },
    ...(adding ? [{ name: 'rate_per_session', label: 'Kadar permulaan (RM / sesi)', type: 'number', min: '0', step: '0.01', required: true, hint: 'Kenaikan seterusnya melalui tab Kenaikan kadar supaya sejarah direkod.' }] : []),
    { name: 'bank_name', label: 'Bank' },
    { name: 'bank_account', label: 'No. akaun bank' },
    { name: 'subjects_qualified', label: 'Subjek yang boleh diajar', type: 'checkgroup', options: subjectOptions },
    { name: 'teaching_permit_expiry', label: 'Permit mengajar luput', type: 'date' },
    { name: 'joined_date', label: 'Tarikh sertai pusat', type: 'date' },
    { name: 'teaching_since', label: 'Mula mengajar', type: 'date', hint: 'Boleh sebelum sertai pusat ini. Pengalaman dikira daripada tarikh ini.' },
    { name: 'remarks', label: 'Catatan', type: 'textarea', hint: 'Sekolah, cadangan, kepakaran, pengalaman di pusat tuisyen lain.' },
    ...(adding ? [] : [{ name: 'is_active', label: 'Guru aktif', type: 'checkbox' }]),
  ];
}

const teacherInitial = (t) => ({
  teacher_code: '', full_name: t?.raw.full_name ?? '', phone_number: t?.raw.phone_number ?? '', email: t?.raw.email ?? '',
  teacher_type: t?.raw.teacher_type ?? 'PERMANENT', rate_per_session: '', bank_name: t?.raw.bank_name ?? '', bank_account: t?.raw.bank_account ?? '',
  subjects_qualified: t?.raw.subjects_qualified ?? [], teaching_permit_expiry: t?.raw.teaching_permit_expiry ?? '',
  joined_date: t?.raw.joined_date ?? '', teaching_since: t?.raw.teaching_since ?? '', remarks: t?.raw.remarks ?? '', is_active: t?.raw.is_active ?? true, note: '',
});

const TEACHER_REASON = { name: 'note', label: 'Sebab permohonan', type: 'textarea', required: true, hint: 'Pengurusan akan melihat sebab ini semasa membuat keputusan.' };
const SEVERITY = { LOW: { label: 'Rendah', tone: 'blue' }, MEDIUM: { label: 'Sederhana', tone: 'amber' }, HIGH: { label: 'Tinggi', tone: 'red' } };
const COMPLAINT_STATUS = { OPEN: 'Baru', IN_PROGRESS: 'Dalam tindakan', RESOLVED: 'Selesai' };
const INCREMENT_STATUS = { PENDING: { label: 'Menunggu Pengurusan', tone: 'amber' }, APPROVED: { label: 'Diluluskan', tone: 'green' }, REJECTED: { label: 'Ditolak', tone: 'red' } };

function permitInfo(expiry) {
  if (!expiry) return { state: 'MISSING', label: 'Tiada rekod' };
  const days = Math.ceil((new Date(`${expiry}T00:00:00`) - new Date(`${todayISO()}T00:00:00`)) / 86400000);
  if (days < 0) return { state: 'EXPIRED', label: `Luput ${date(expiry)}` };
  if (days <= THRESHOLDS.permit_warning_days) return { state: 'SOON', label: `Luput ${date(expiry)} (${days} hari)` };
  return { state: 'VALID', label: `Sah hingga ${date(expiry)}` };
}

export default function TeachersView({ role }) {
  // Rates, complaints and increments are for Supervisor and Management; the server leaves them out for Admin
  const showPay = can(role, 'teachers.pay');
  const canDecide = can(role, 'payroll.approve');
  const { teachers, classes, subjects, submitChangeRequest, days: DAYS } = useStore();
  const { refreshTeachers, refreshAllData } = useApp();
  const notify = useToast();
  const [view, setView] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]).get('tab') ?? 'directory');
  const [type, setType] = useState('ALL');
  const [inactive, setInactive] = useState(false);
  const [q, setQ] = useState('');
  const [complaints, setComplaints] = useState([]);
  const [increments, setIncrements] = useState([]);
  const [dialog, setDialog] = useState(null);
  // Adding a teacher and active / inactive changes: Supervisor asks, Management approves (Management's own apply at once)
  const canManage = can(role, 'teachers.manage');
  const direct = role === 'MANAGEMENT';
  const { requests: teacherRequests, load: loadTeacherRequests } = useChangeRequests('TEACHER');
  const [teacherDialog, setTeacherDialog] = useState(null); // { type: 'add' } | { type: 'edit' | 'active', teacher }
  const waitingFor = new Set(teacherRequests.filter((r) => r.status === 'PENDING' && r.action === 'UPDATE').map((r) => r.target_id));
  const subjectOptions = subjects.filter((s) => s.active).map((s) => ({ value: s.pk, label: s.name }));
  const saveTeacher = async (action, pk, values, note) => {
    const done = await submitChangeRequest({ kind: 'TEACHER', action, pk, values, note });
    notify(done.status === 'PENDING' ? 'Permohonan dihantar. Ia berkuat kuasa selepas diluluskan oleh Pengurusan.' : 'Maklumat guru disimpan.');
    await loadTeacherRequests();
  };

  const loadExtras = useCallback(() => {
    if (!showPay) return Promise.resolve();
    return Promise.all([staffApi.getComplaints(), staffApi.getRateIncrements()])
      .then(([c, i]) => { setComplaints(c); setIncrements(i); })
      .catch(() => notify('Gagal memuat aduan dan kenaikan kadar guru.', 'error'));
  }, [showPay, notify]);
  useEffect(() => { loadExtras(); }, [loadExtras]);

  // Runs a server call, then reloads; a failure is shown and re-thrown so the dialog stays open
  const run = async (call, message) => {
    try {
      await call();
      await loadExtras();
      if (message) notify(message);
    } catch (err) {
      const detail = err?.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      notify(detail || err?.message || 'Ralat menyimpan.', 'error');
      throw err;
    }
  };

  const taught = (code) => classes.filter((c) => c.teacher === code);
  const active = teachers.filter((t) => t.active);
  const needle = q.trim().toLowerCase();
  const rows = teachers
    .filter((t) => t.active !== inactive && (type === 'ALL' || t.type === type) && (!needle || `${t.name} ${t.code} ${t.subjects}`.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const count = (kind) => active.filter((t) => t.type === kind).length;
  const monthlyTotal = active.reduce((a, t) => a + taught(t.code).length * WEEKS_PER_MONTH * (t.rate || 0), 0);
  const avgRate = (kind) => {
    const list = active.filter((t) => t.type === kind);
    return list.length ? list.reduce((a, t) => a + (t.rate || 0), 0) / list.length : 0;
  };
  const permitAlerts = active.map((t) => ({ t, permit: permitInfo(t.permitExpiry) })).filter((x) => x.permit.state === 'SOON' || x.permit.state === 'EXPIRED');
  const teacherOptions = [...active].sort((a, b) => a.name.localeCompare(b.name));

  const exportCsv = () => downloadCsv('senarai-guru.csv',
    ['Kod', 'Nama', 'Kategori', 'Subjek', 'Tingkatan', 'Kelas seminggu', 'Telefon', 'Permit mengajar', ...(showPay ? ['Kadar sesi (RM)'] : [])],
    rows.map((t) => [t.code, t.name, t.type === 'PERMANENT' ? 'Tetap' : 'Ganti', t.subjects, [...new Set(taught(t.code).map((c) => formShort(c.form)))].sort().join(' '),
      taught(t.code).length, t.phone, t.permitExpiry || '', ...(showPay ? [t.rate] : [])]));

  return (
    <>
      <PageHeader
        title={showPay ? 'Guru & elaun' : 'Guru'}
        description={showPay ? 'Guru tetap dan ganti, kelas ditugaskan, permit mengajar, aduan dan kadar elaun.' : 'Guru tetap, guru ganti dan jadual mengajar mingguan.'}
        actions={
          <>
            <Button icon={Download} onClick={exportCsv}>Excel</Button>
            {canManage && <Button variant="primary" icon={Plus} onClick={() => setTeacherDialog({ type: 'add' })}>{direct ? 'Tambah guru' : 'Mohon guru baharu'}</Button>}
            {can(role, 'payroll.view') && <Button onClick={() => navigate('payroll')}>Bayaran elaun</Button>}
          </>
        }
      />

      {permitAlerts.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">{permitAlerts.length} permit mengajar luput atau hampir luput</p>
            <p className="mt-0.5 text-[13px]">{permitAlerts.map(({ t, permit }) => `Cikgu ${t.name} (${permit.label})`).join(' · ')}</p>
          </div>
        </div>
      )}

      <Tabs
        className="mb-4"
        value={view}
        onChange={setView}
        items={[
          { value: 'directory', label: 'Direktori', count: active.length },
          { value: 'assigned', label: 'Kelas ditugaskan' },
          ...(canManage ? [{ value: 'requests', label: 'Permohonan', count: teacherRequests.filter((r) => r.status === 'PENDING').length }] : []),
          ...(showPay ? [
            { value: 'complaints', label: 'Aduan & tindakan', count: complaints.filter((c) => c.status !== 'RESOLVED').length },
            { value: 'increments', label: 'Kenaikan kadar', count: increments.filter((i) => i.status === 'PENDING').length },
          ] : []),
        ]}
      />

      {view === 'directory' && (
        <>
          {showPay && (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label={`Anggaran elaun ${monthLabel(CURRENT_MONTH)}`} value={rm(monthlyTotal)} hint={`Sesi seminggu × ${WEEKS_PER_MONTH} × kadar semasa`} />
              <Stat label="Purata kadar guru tetap" value={rm(avgRate('PERMANENT'))} hint="setiap sesi" />
              <Stat label="Purata kadar guru ganti" value={rm(avgRate('REPLACEMENT'))} hint="setiap sesi" />
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Tabs
              value={type}
              onChange={setType}
              items={[
                { value: 'ALL', label: 'Semua' },
                { value: 'PERMANENT', label: 'Guru tetap', count: count('PERMANENT') },
                { value: 'REPLACEMENT', label: 'Guru ganti', count: count('REPLACEMENT') },
              ]}
            />
            <Checkbox label={`Tidak aktif (${teachers.length - active.length})`} checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
            <SearchInput icon={Search} value={q} onChange={setQ} placeholder="Cari guru atau subjek" className="w-full sm:ml-auto sm:w-72" />
          </div>

          <Card>
            {rows.length === 0 ? (
              <EmptyState icon={GraduationCap} title="Tiada guru ditemui" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Guru</Th>
                    <Th className="hidden xl:table-cell">Subjek</Th>
                    <Th className="hidden md:table-cell">Tingkatan</Th>
                    <Th className="text-right">Kelas / minggu</Th>
                    <Th>Permit mengajar</Th>
                    {showPay && <Th className="text-right">Kadar / sesi</Th>}
                    {canManage && <Th className="text-right"><span className="sr-only">Tindakan</span></Th>}
                    <Th className="w-0"><span className="sr-only">Hubungi</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const mine = taught(t.code);
                    const permit = permitInfo(t.permitExpiry);
                    return (
                      <tr key={t.code} className="hover:bg-gray-50">
                        <Td className="min-w-64">
                          <div className="flex items-center gap-3">
                            <Avatar text={initials(t.name)} />
                            <div>
                              <p className="font-medium text-gray-900">
                                Cikgu {t.name} <span className="font-normal text-gray-400">· {t.code}</span>
                              </p>
                              <p className="text-[13px] text-gray-500">
                                {t.type === 'PERMANENT' ? 'Guru tetap' : 'Guru ganti'}{t.since ? ` · sejak ${t.since}` : ''}{experienceYears(t.teachingSince) !== null ? ` · ${experienceYears(t.teachingSince)} tahun mengajar` : ''} · {t.phone}
                                <span className="xl:hidden">{t.subjects && ` · ${t.subjects}`}</span>
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td className="hidden text-gray-700 xl:table-cell">{t.subjects || '—'}</Td>
                        <Td className="hidden text-gray-700 md:table-cell">{[...new Set(mine.map((c) => formShort(c.form)))].sort().join(', ') || '—'}</Td>
                        <Td className="text-right tnum">{mine.length || <Badge>Atas panggilan</Badge>}</Td>
                        <Td className="whitespace-nowrap">
                          {permit.state === 'VALID' ? <Badge tone="green">{permit.label}</Badge>
                            : permit.state === 'MISSING' ? <span className="text-[13px] text-gray-400">{permit.label}</span>
                              : <Badge tone={permit.state === 'EXPIRED' ? 'red' : 'amber'}>{permit.label}</Badge>}
                        </Td>
                        {showPay && <Td className="text-right font-medium tnum">{rm(t.rate)}</Td>}
                        {canManage && (
                          <Td className="whitespace-nowrap text-right">
                            {waitingFor.has(t.pk) ? <Badge tone="amber">Menunggu kelulusan</Badge> : (
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="ghost" onClick={() => setTeacherDialog({ type: 'edit', teacher: t })}>Ubah</Button>
                                <Button size="sm" variant="ghost" onClick={() => setTeacherDialog({ type: 'active', teacher: t })}>{t.active ? 'Nyahaktif' : 'Aktifkan'}</Button>
                              </div>
                            )}
                          </Td>
                        )}
                        <Td>
                          {t.phone && (
                            <Button as="a" size="sm" href={waLink(t.phone)} target="_blank" rel="noreferrer" title="WhatsApp" className="px-2">
                              <WhatsAppIcon className="size-3.5" />
                            </Button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
          {showPay && (
            <p className="mt-3 text-[13px] text-gray-500">
              Anggaran dikira daripada jadual semasa ({WEEKS_PER_MONTH} minggu sebulan). Bayaran sebenar dikira daripada kehadiran guru dalam Bayaran elaun.
            </p>
          )}
        </>
      )}

      {view === 'requests' && canManage && (
        <ChangeRequestsPanel
          title="Permohonan guru"
          description={direct ? 'Permohonan Supervisor menunggu kelulusan anda. Perubahan Pengurusan terus berkuat kuasa dan direkod di sini.' : 'Guru baharu dan perubahan status berkuat kuasa selepas diluluskan oleh Pengurusan.'}
          requests={teacherRequests}
          reload={loadTeacherRequests}
          onApplied={refreshAllData}
          editFields={(r) => teacherFields(r.action === 'CREATE', subjectOptions)}
          editInitial={(r) => ({ ...teacherInitial(teachers.find((t) => t.pk === r.target_id)), ...r.payload })}
        />
      )}

      {teacherDialog?.type === 'add' && (
        <FormModal
          title={direct ? 'Tambah guru' : 'Mohon guru baharu'}
          description={direct ? 'Guru ini boleh ditugaskan ke kelas serta-merta.' : 'Guru ini boleh ditugaskan ke kelas selepas diluluskan oleh Pengurusan.'}
          submitLabel={direct ? 'Tambah guru' : 'Hantar permohonan'}
          initial={teacherInitial()}
          fields={[...teacherFields(true, subjectOptions), ...(direct ? [] : [TEACHER_REASON])]}
          onSubmit={({ note, ...values }) => saveTeacher('CREATE', null, values, note)}
          onClose={() => setTeacherDialog(null)}
        />
      )}
      {teacherDialog?.type === 'edit' && (
        <FormModal
          title={`Ubah Cikgu ${teacherDialog.teacher.name}`}
          description={direct ? 'Perubahan berkuat kuasa serta-merta.' : 'Perubahan berkuat kuasa selepas diluluskan oleh Pengurusan. Kadar sesi diubah melalui tab Kenaikan kadar.'}
          submitLabel={direct ? 'Simpan' : 'Hantar permohonan'}
          initial={teacherInitial(teacherDialog.teacher)}
          fields={[...teacherFields(false, subjectOptions), ...(direct ? [] : [TEACHER_REASON])]}
          onSubmit={({ note, ...values }) => saveTeacher('UPDATE', teacherDialog.teacher.pk, values, note)}
          onClose={() => setTeacherDialog(null)}
        />
      )}
      {teacherDialog?.type === 'active' && (
        <FormModal
          title={`${teacherDialog.teacher.active ? 'Nyahaktifkan' : 'Aktifkan'} Cikgu ${teacherDialog.teacher.name}`}
          description={teacherDialog.teacher.active ? 'Guru yang tidak aktif tidak lagi ditugaskan ke kelas. Guru yang masih mempunyai kelas tidak boleh dinyahaktifkan.' : 'Guru akan boleh ditugaskan ke kelas semula.'}
          submitLabel={direct ? 'Teruskan' : 'Hantar permohonan'}
          initial={{ note: '' }}
          fields={direct ? [] : [{ ...TEACHER_REASON, label: 'Sebab / keterangan', hint: undefined }]}
          onSubmit={({ note }) => saveTeacher('UPDATE', teacherDialog.teacher.pk, { is_active: !teacherDialog.teacher.active }, note)}
          onClose={() => setTeacherDialog(null)}
        />
      )}

      {view === 'assigned' && (
        <Card>
          <CardHeader title="Kelas ditugaskan mengikut hari" description="Daripada jadual induk semasa. Guru tanpa kelas tidak disenaraikan." />
          <Table>
            <thead>
              <tr>
                <Th>Guru</Th>
                {DAYS.map((d) => <Th key={d}>{DAY_LABEL[d]}</Th>)}
              </tr>
            </thead>
            <tbody>
              {teacherOptions.filter((t) => taught(t.code).length).map((t) => (
                <tr key={t.code} className="align-top">
                  <Td className="whitespace-nowrap">
                    <p className="font-medium text-gray-900">Cikgu {t.name}</p>
                    <p className="text-[13px] text-gray-500">{t.code} · {taught(t.code).length} sesi seminggu</p>
                  </Td>
                  {DAYS.map((d) => {
                    const dayClasses = taught(t.code).filter((c) => c.day === d).sort((a, b) => a.start.localeCompare(b.start));
                    return (
                      <Td key={d} className="min-w-36 space-y-1">
                        {dayClasses.length === 0 ? <span className="text-gray-300">—</span> : dayClasses.map((c) => (
                          <span key={c.id} className="block rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-xs text-brand-800">
                            {time(c.start)} · {classLabel(c, subjects)}
                          </span>
                        ))}
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {view === 'complaints' && showPay && (
        <Card>
          <CardHeader
            title="Aduan & laporan tindakan"
            actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'complaint' })}>Rekod aduan</Button>}
          />
          {complaints.length === 0 ? <EmptyState title="Tiada aduan direkodkan" /> : (
            <Table>
              <thead>
                <tr>
                  <Th>Tarikh</Th><Th>Guru</Th><Th>Aduan</Th><Th>Tahap</Th><Th>Status</Th><Th>Tindakan</Th><Th className="w-0"><span className="sr-only">Kemas kini</span></Th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr key={c.id} className="align-top">
                    <Td className="whitespace-nowrap">{date(c.date_reported)}</Td>
                    <Td className="whitespace-nowrap font-medium text-gray-900">{c.teacher_name} <span className="font-normal text-gray-400">· {c.teacher_code}</span></Td>
                    <Td className="max-w-xs text-gray-700">
                      {c.category && <p className="font-medium text-gray-900">{c.category}</p>}
                      <p>{c.description}</p>
                      <p className="text-[13px] text-gray-500">Diadu oleh {c.complained_by}</p>
                    </Td>
                    <Td><Badge tone={SEVERITY[c.severity]?.tone}>{SEVERITY[c.severity]?.label}</Badge></Td>
                    <Td><Badge tone={c.status === 'RESOLVED' ? 'green' : 'amber'}>{COMPLAINT_STATUS[c.status]}</Badge></Td>
                    <Td className="max-w-xs text-gray-700">
                      {c.action_taken ? (
                        <>
                          <p>{c.action_taken}</p>
                          <p className="text-[13px] text-gray-500">{[c.action_pic, c.action_date && date(c.action_date)].filter(Boolean).join(' · ')}</p>
                        </>
                      ) : '—'}
                    </Td>
                    <Td><Button size="sm" onClick={() => setDialog({ type: 'action', complaint: c })}>Kemas kini</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {view === 'increments' && showPay && (
        <Card>
          <CardHeader
            title="Kenaikan kadar elaun"
            description="Supervisor atau Pengurusan mencadang; Pengurusan meluluskan. Sejarah kenaikan setiap guru disimpan."
            actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'increment' })}>Cadang kenaikan</Button>}
          />
          {increments.length === 0 ? <EmptyState title="Tiada cadangan atau sejarah kenaikan kadar" /> : (
            <Table>
              <thead>
                <tr>
                  <Th>Guru</Th><Th className="text-right">Kadar lama</Th><Th className="text-right">Kadar baharu</Th><Th>Kuat kuasa</Th><Th>Justifikasi</Th><Th>Status</Th>
                  <Th className="w-0"><span className="sr-only">Tindakan</span></Th>
                </tr>
              </thead>
              <tbody>
                {increments.map((inc) => (
                  <tr key={inc.id} className="align-top">
                    <Td className="whitespace-nowrap font-medium text-gray-900">{inc.teacher_name} <span className="font-normal text-gray-400">· {inc.teacher_code}</span></Td>
                    <Td className="text-right tnum">{rm(inc.previous_rate)}</Td>
                    <Td className="text-right font-medium tnum">{rm(inc.proposed_rate)}</Td>
                    <Td className="whitespace-nowrap">{date(inc.effective_date)}</Td>
                    <Td className="max-w-sm text-gray-700">
                      <p>{inc.reason || '—'}</p>
                      <p className="text-[13px] text-gray-500">Dicadang oleh {inc.proposed_by}</p>
                    </Td>
                    <Td>
                      <Badge tone={INCREMENT_STATUS[inc.status]?.tone}>{INCREMENT_STATUS[inc.status]?.label}</Badge>
                      {inc.decided_by && <p className="mt-1 text-xs text-gray-500">{inc.decided_by}{inc.decision_comment ? `: ${inc.decision_comment}` : ''}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {inc.status === 'PENDING' && canDecide && (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="danger" onClick={() => setDialog({ type: 'reject', increment: inc })}>Tolak</Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => run(() => staffApi.approveRateIncrement(inc.id), `Kadar baharu ${inc.teacher_code} diluluskan.`).then(refreshTeachers).catch(() => {})}
                          >
                            Luluskan
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {dialog?.type === 'complaint' && (
        <FormModal
          title="Rekod aduan guru"
          initial={{ teacher: '', date_reported: todayISO(), severity: 'LOW', complained_by: '', category: '', description: '' }}
          fields={[
            { name: 'teacher', label: 'Guru', type: 'select', required: true, options: teacherOptions.map((t) => ({ value: t.pk, label: `Cikgu ${t.name} (${t.code})` })) },
            { name: 'date_reported', label: 'Tarikh aduan', type: 'date', required: true },
            { name: 'severity', label: 'Tahap', type: 'select', required: true, options: Object.entries(SEVERITY).map(([value, s]) => ({ value, label: s.label })) },
            { name: 'complained_by', label: 'Diadu oleh', required: true, hint: 'cth. ibu bapa, pelajar, staf' },
            { name: 'category', label: 'Kategori' },
            { name: 'description', label: 'Keterangan', type: 'textarea', required: true },
          ]}
          onSubmit={(v) => run(() => staffApi.createComplaint({ ...v, teacher: Number(v.teacher) }), 'Aduan direkodkan.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'action' && (
        <FormModal
          title="Kemas kini tindakan aduan"
          description={`${dialog.complaint.teacher_name} · ${date(dialog.complaint.date_reported)}`}
          initial={{ status: dialog.complaint.status, action_taken: dialog.complaint.action_taken || '', action_pic: dialog.complaint.action_pic || '', action_date: dialog.complaint.action_date || todayISO() }}
          fields={[
            { name: 'status', label: 'Status', type: 'select', required: true, options: Object.entries(COMPLAINT_STATUS).map(([value, label]) => ({ value, label })) },
            { name: 'action_taken', label: 'Tindakan diambil', type: 'textarea' },
            { name: 'action_pic', label: 'Pegawai bertanggungjawab (PIC)' },
            { name: 'action_date', label: 'Tarikh tindakan', type: 'date' },
          ]}
          onSubmit={(v) => run(() => staffApi.updateComplaint(dialog.complaint.id, { ...v, action_date: v.action_date || null }), 'Tindakan aduan dikemas kini.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'increment' && (
        <FormModal
          title="Cadang kenaikan kadar"
          description="Cadangan dihantar kepada Pengurusan untuk kelulusan."
          initial={{ teacher: '', proposed_rate: '', effective_date: `${Number(todayISO().slice(0, 4)) + 1}-01-01`, reason: '' }}
          fields={[
            { name: 'teacher', label: 'Guru', type: 'select', required: true, options: teacherOptions.map((t) => ({ value: t.pk, label: `Cikgu ${t.name} (${t.code}) · ${rm(t.rate)}` })) },
            { name: 'proposed_rate', label: 'Kadar baharu (RM)', type: 'number', min: '0', step: '0.01', required: true },
            { name: 'effective_date', label: 'Tarikh kuat kuasa', type: 'date', required: true },
            { name: 'reason', label: 'Justifikasi', type: 'textarea' },
          ]}
          onSubmit={(v) => run(() => staffApi.proposeRateIncrement({ ...v, teacher: Number(v.teacher) }), 'Cadangan kenaikan kadar dihantar kepada Pengurusan.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'reject' && (
        <FormModal
          title="Tolak cadangan kenaikan"
          description={`${dialog.increment.teacher_name} · ${rm(dialog.increment.proposed_rate)}`}
          danger
          submitLabel="Tolak cadangan"
          fields={[{ name: 'comment', label: 'Sebab penolakan', type: 'textarea', required: true }]}
          onSubmit={(v) => run(() => staffApi.rejectRateIncrement(dialog.increment.id, v.comment.trim()), 'Cadangan ditolak.')}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
