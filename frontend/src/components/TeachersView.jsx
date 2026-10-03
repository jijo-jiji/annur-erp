import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, GraduationCap, Plus, Search } from 'lucide-react';
import { staffApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { DAYS } from '../lib/config';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { navigate } from '../lib/nav';
import { classLabel } from '../lib/domain';
import { CURRENT_MONTH, date, DAY_LABEL, formShort, initials, monthLabel, rm, time, todayISO, waLink } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import FormModal from './FormModal';
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, EmptyState, PageHeader, SearchInput, Stat, Table, Tabs, Td, Th, useToast, WhatsAppIcon } from './ui';

const WEEKS_PER_MONTH = 4;
const PERMIT_WARNING_DAYS = 60;
const SEVERITY = { LOW: { label: 'Rendah', tone: 'blue' }, MEDIUM: { label: 'Sederhana', tone: 'amber' }, HIGH: { label: 'Tinggi', tone: 'red' } };
const COMPLAINT_STATUS = { OPEN: 'Baru', IN_PROGRESS: 'Dalam tindakan', RESOLVED: 'Selesai' };
const INCREMENT_STATUS = { PENDING: { label: 'Menunggu Pengurusan', tone: 'amber' }, APPROVED: { label: 'Diluluskan', tone: 'green' }, REJECTED: { label: 'Ditolak', tone: 'red' } };

function permitInfo(expiry) {
  if (!expiry) return { state: 'MISSING', label: 'Tiada rekod' };
  const days = Math.ceil((new Date(`${expiry}T00:00:00`) - new Date(`${todayISO()}T00:00:00`)) / 86400000);
  if (days < 0) return { state: 'EXPIRED', label: `Luput ${date(expiry)}` };
  if (days <= PERMIT_WARNING_DAYS) return { state: 'SOON', label: `Luput ${date(expiry)} (${days} hari)` };
  return { state: 'VALID', label: `Sah hingga ${date(expiry)}` };
}

export default function TeachersView({ role }) {
  // Rates, complaints and increments are for Supervisor and Management; the server leaves them out for Admin
  const showPay = can(role, 'teachers.pay');
  const canDecide = can(role, 'payroll.approve');
  const { teachers, classes, subjects } = useStore();
  const { refreshTeachers } = useApp();
  const notify = useToast();
  const [view, setView] = useState('directory');
  const [type, setType] = useState('ALL');
  const [inactive, setInactive] = useState(false);
  const [q, setQ] = useState('');
  const [complaints, setComplaints] = useState([]);
  const [increments, setIncrements] = useState([]);
  const [dialog, setDialog] = useState(null);

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
                                {t.type === 'PERMANENT' ? 'Guru tetap' : 'Guru ganti'}{t.since ? ` · sejak ${t.since}` : ''} · {t.phone}
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
