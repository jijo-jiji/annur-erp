import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Download, Lock } from 'lucide-react';
import { teacherPayApi } from '../api/client';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { dateLong, monthLabel, rm, todayISO } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { Badge, Button, Card, CardHeader, cx, EmptyState, filterClass, inputClass, PageHeader, Table, Td, Th, useToast } from './ui';

const STATUSES = [
  { id: 'PRESENT', label: 'Hadir' },
  { id: 'ABSENT', label: 'Tidak hadir' },
  { id: 'REPLACED', label: 'Diganti' },
  { id: 'CANCELLED', label: 'Kelas batal' },
];
const cell = cx(inputClass, 'min-w-28 py-1.5');

// One row per class on the chosen date: teacher in charge, present / absent / replaced / cancelled,
// reason and replacement teacher. Teacher pay is worked out from these records.
export default function TeacherAttendanceView({ role }) {
  const { teachers } = useStore();
  const notify = useToast();
  const [day, setDay] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [closed, setClosed] = useState('');
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState([]);
  const showPay = can(role, 'teachers.pay');
  const active = teachers.filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name));
  const month = day.slice(0, 7);

  const loadSummary = useCallback(() => {
    teacherPayApi.summary(month).then(setSummary).catch(() => setSummary([]));
  }, [month]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    teacherPayApi.roster(day)
      .then((r) => {
        if (cancelled) return;
        setClosed(r.closed || '');
        // Unrecorded classes default to present with the assigned teacher
        setRows(r.classes.map((c) => ({
          ...c,
          status: c.record?.status || 'PRESENT',
          reason: c.record?.reason || '',
          remarks: c.record?.remarks || '',
          replacement_teacher: c.record?.replacement_teacher || '',
          saved: Boolean(c.record),
          savedAmount: c.record?.amount ?? null,
          savedPaid: c.record ? (c.record.status === 'REPLACED' ? c.record.replacement_teacher : c.record.status === 'PRESENT' ? c.teacher_id : null) : null,
        })));
      })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [day]);

  // The teacher who is paid for a class, and the amount shown: typed, kept from the saved record, or that teacher's own rate
  const paidId = (r) => (r.status === 'REPLACED' ? Number(r.replacement_teacher) || null : r.status === 'PRESENT' ? r.teacher_id : null);
  const amountOf = (r) => {
    if (r.amountEdited) return r.amount;
    if (r.saved && r.savedAmount !== null && paidId(r) === r.savedPaid) return r.savedAmount;
    const paid = teachers.find((t) => t.pk === paidId(r));
    return paid?.rate != null ? String(paid.rate) : '';
  };
  const update = (classId, patch) => setRows((prev) => prev.map((r) => (r.class_id === classId ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const marks = rows.filter((r) => !r.locked).map((r) => ({
        class_id: r.class_id, teacher_id: r.teacher_id, status: r.status, reason: r.reason,
        remarks: r.remarks, replacement_teacher: r.status === 'REPLACED' ? Number(r.replacement_teacher) || null : null,
        ...(showPay && r.amountEdited && r.amount !== '' ? { amount: r.amount } : {}),
      }));
      const res = await teacherPayApi.saveRoster(day, marks);
      setRows((prev) => prev.map((r) => {
        const fresh = res.classes.find((c) => c.class_id === r.class_id);
        return fresh ? {
          ...r, saved: Boolean(fresh.record), locked: fresh.locked, amountEdited: false, savedAmount: fresh.record?.amount ?? null,
          savedPaid: fresh.record ? (fresh.record.status === 'REPLACED' ? fresh.record.replacement_teacher : fresh.record.status === 'PRESENT' ? fresh.teacher_id : null) : null,
        } : r;
      }));
      loadSummary();
      notify(`Kehadiran guru ${dateLong(day)} disimpan (${marks.length} kelas).`);
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      notify(detail || 'Ralat menyimpan kehadiran guru.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => downloadCsv(`kehadiran-guru-${month}.csv`,
    ['Kod', 'Guru', 'Jenis', 'Mengajar', 'Sebagai ganti', 'Tidak hadir', 'Diganti', 'Batal', ...(showPay ? ['Bayaran (RM)'] : [])],
    summary.map((r) => [r.teacher_code, r.name, r.teacher_type, r.taught, r.as_replacement, r.absent, r.replaced, r.cancelled, ...(showPay ? [r.amount] : [])]));

  return (
    <>
      <PageHeader
        title="Kehadiran guru"
        description="Rekod setiap kelas: guru hadir, tidak hadir, diganti atau kelas batal. Bayaran guru dikira daripada rekod ini."
        actions={<input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Tarikh" className={filterClass} />}
      />

      <Card>
        <CardHeader
          title={`Kelas pada ${dateLong(day)}`}
          description={rows.length ? `${rows.filter((r) => r.saved).length} daripada ${rows.length} kelas telah direkod` : undefined}
          actions={
            <Button variant="primary" size="sm" onClick={save} disabled={saving || rows.length === 0 || rows.every((r) => r.locked)}>
              {saving ? 'Menyimpan…' : 'Simpan kehadiran'}
            </Button>
          }
        />
        {loading ? <p className="py-10 text-center text-sm text-gray-500">Memuatkan…</p> : rows.length === 0 ? (
          <EmptyState icon={CalendarDays} title={closed ? `Pusat tutup: ${closed}` : 'Tiada kelas dijadualkan pada tarikh ini'}>
            {closed ? 'Tiada kelas dan tiada bayaran guru pada hari ini.' : undefined}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>Masa</Th><Th>Kelas</Th><Th>Guru</Th><Th>Status</Th><Th>Sebab cuti</Th><Th>Guru ganti</Th>{showPay && <Th>Bayaran sesi (RM)</Th>}<Th>Catatan</Th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.class_id} className={cx('align-top', r.locked && 'bg-gray-50 text-gray-500')}>
                  <Td className="whitespace-nowrap">
                    {r.time}
                    {r.room && <p className="text-[13px] text-gray-500">{r.room}</p>}
                  </Td>
                  <Td className="min-w-40">
                    <p className="font-medium text-gray-900">{r.class_code}</p>
                    <p className="text-[13px] text-gray-500">{r.subject}</p>
                    {r.notes.map((n) => <p key={n} className="text-[13px] font-medium text-amber-700">{n}</p>)}
                    {r.saved && <Badge tone="green" className="mt-1">Direkod</Badge>}
                  </Td>
                  <Td>
                    {r.locked ? r.teacher_name : (
                      <select aria-label={`Guru ${r.class_code}`} value={r.teacher_id || ''} onChange={(e) => update(r.class_id, { teacher_id: Number(e.target.value) })} className={cell}>
                        <option value="">Tiada guru</option>
                        {active.map((t) => <option key={t.pk} value={t.pk}>Cikgu {t.name}</option>)}
                      </select>
                    )}
                  </Td>
                  <Td>
                    {r.locked ? (
                      <span className="flex items-center gap-1.5"><Lock className="size-3.5" /> {STATUSES.find((s) => s.id === r.status)?.label}</span>
                    ) : (
                      <select aria-label={`Status ${r.class_code}`} value={r.status} onChange={(e) => update(r.class_id, { status: e.target.value })} className={cell}>
                        {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    )}
                  </Td>
                  <Td>
                    {['ABSENT', 'REPLACED'].includes(r.status) && (
                      <input aria-label={`Sebab ${r.class_code}`} disabled={r.locked} placeholder="cth. MC, kursus" value={r.reason} onChange={(e) => update(r.class_id, { reason: e.target.value })} className={cell} />
                    )}
                  </Td>
                  <Td>
                    {r.status === 'REPLACED' && (
                      <select aria-label={`Guru ganti ${r.class_code}`} disabled={r.locked} value={r.replacement_teacher} onChange={(e) => update(r.class_id, { replacement_teacher: e.target.value })} className={cell}>
                        <option value="">Pilih guru ganti</option>
                        {active.filter((t) => t.pk !== r.teacher_id)
                          .sort((a, b) => (a.type === 'REPLACEMENT' ? -1 : 1) - (b.type === 'REPLACEMENT' ? -1 : 1))
                          .map((t) => <option key={t.pk} value={t.pk}>Cikgu {t.name}{t.type === 'REPLACEMENT' ? ' (sambilan)' : ''}</option>)}
                      </select>
                    )}
                  </Td>
                  {showPay && (
                    <Td>
                      {paidId(r) ? (
                        <input
                          type="number" min="0" max="5000" step="0.01" aria-label={`Bayaran ${r.class_code}`} disabled={r.locked}
                          value={amountOf(r)} onChange={(e) => update(r.class_id, { amount: e.target.value, amountEdited: true })} className={`${cell} w-24 text-right tnum`}
                        />
                      ) : <span className="text-gray-300">—</span>}
                    </Td>
                  )}
                  <Td><input aria-label={`Catatan ${r.class_code}`} disabled={r.locked} value={r.remarks} onChange={(e) => update(r.class_id, { remarks: e.target.value })} className={cell} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {rows.some((r) => r.locked) && (
          <p className="flex items-center gap-1.5 border-t border-gray-100 px-5 py-3 text-[13px] text-gray-500">
            <Lock className="size-3.5" /> Bayaran bulan ini untuk guru berkenaan sudah disahkan, jadi rekodnya dikunci.
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Laporan kehadiran guru bulanan" description={monthLabel(month)} actions={<Button size="sm" icon={Download} onClick={exportCsv}>Excel</Button>} />
        {summary.length === 0 ? <EmptyState title="Tiada rekod bulan ini" /> : (
          <Table>
            <thead>
              <tr>
                <Th>Guru</Th><Th className="text-right">Mengajar</Th><Th className="text-right">Sebagai ganti</Th><Th className="text-right">Tidak hadir</Th>
                <Th className="text-right">Diganti</Th><Th className="text-right">Batal</Th>{showPay && <Th className="text-right">Bayaran</Th>}
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.teacher_id}>
                  <Td className="font-medium text-gray-900">{r.name} <span className="font-normal text-gray-400">· {r.teacher_code}</span></Td>
                  <Td className="text-right tnum">{r.taught}</Td>
                  <Td className="text-right tnum">{r.as_replacement}</Td>
                  <Td className="text-right tnum">{r.absent}</Td>
                  <Td className="text-right tnum">{r.replaced}</Td>
                  <Td className="text-right tnum">{r.cancelled}</Td>
                  {showPay && <Td className="text-right font-medium tnum">{rm(r.amount)}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
