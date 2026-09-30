import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Lock, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { teacherPayApi } from '../api/client';
import { downloadCsv, today } from './studentShared';

const STATUSES = [
  { id: 'PRESENT', label: 'Hadir' },
  { id: 'ABSENT', label: 'Tidak hadir' },
  { id: 'REPLACED', label: 'Diganti' },
  { id: 'CANCELLED', label: 'Kelas batal' },
];
const money = (v) => `RM ${Number(v || 0).toFixed(2)}`;

// j-status.doc Teachers > Attendance: date, grade, subject, teacher in charge, present/absent,
// reason of leave, replacement teacher. Pay is worked out from these records.
export default function TeacherAttendanceView({ currentRole }) {
  const { teachers, showToast } = useApp();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState([]);
  const canSeePay = currentRole !== 'ADMIN';

  const activeTeachers = useMemo(() => teachers.filter((t) => t.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)), [teachers]);
  const month = date.slice(0, 7);

  const loadSummary = useCallback(() => {
    teacherPayApi.summary(month).then(setSummary).catch(() => setSummary([]));
  }, [month]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    teacherPayApi.roster(date)
      .then((r) => {
        if (cancelled) return;
        // Unrecorded classes default to present with the assigned teacher
        setRows(r.classes.map((c) => ({
          ...c,
          status: c.record?.status || 'PRESENT',
          reason: c.record?.reason || '',
          remarks: c.record?.remarks || '',
          replacement_teacher: c.record?.replacement_teacher || '',
          saved: Boolean(c.record),
        })));
      })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const update = (classId, patch) => setRows((prev) => prev.map((r) => (r.class_id === classId ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const marks = rows.filter((r) => !r.locked).map((r) => ({
        class_id: r.class_id, teacher_id: r.teacher_id, status: r.status, reason: r.reason,
        remarks: r.remarks, replacement_teacher: r.status === 'REPLACED' ? Number(r.replacement_teacher) || null : null,
      }));
      const res = await teacherPayApi.saveRoster(date, marks);
      setRows((prev) => prev.map((r) => {
        const fresh = res.classes.find((c) => c.class_id === r.class_id);
        return fresh ? { ...r, saved: Boolean(fresh.record), locked: fresh.locked } : r;
      }));
      loadSummary();
      showToast(`Kehadiran guru ${date} disimpan (${marks.length} kelas).`);
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || 'Ralat menyimpan kehadiran guru.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cell = 'px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs w-full';

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Kehadiran Guru</h2>
          <p className="text-slate-500">Rekod setiap kelas: guru hadir, tidak hadir, diganti atau kelas batal. Bayaran guru dikira daripada rekod ini.</p>
        </div>
        <label className="font-semibold text-slate-700">Tarikh
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="block mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white" />
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Kelas pada {new Date(`${date}T00:00:00`).toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
          <button onClick={save} disabled={saving || rows.every((r) => r.locked) || rows.length === 0}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Menyimpan…' : 'Simpan Kehadiran'}
          </button>
        </div>
        {loading ? <p className="py-6 text-center text-slate-400">Memuatkan…</p> : rows.length === 0 ? (
          <p className="py-6 text-center text-slate-400">Tiada kelas dijadualkan pada tarikh ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]">
                <tr><th className="py-2 px-2">Masa</th><th className="px-2">Kelas</th><th className="px-2">Guru</th><th className="px-2 w-32">Status</th><th className="px-2">Sebab cuti</th><th className="px-2">Guru ganti</th><th className="px-2">Catatan</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.class_id} className={`align-top ${r.locked ? 'bg-slate-50 text-slate-500' : ''}`}>
                    <td className="py-2 px-2 whitespace-nowrap">{r.time}{r.room && <div className="text-[10px] text-slate-400">{r.room}</div>}</td>
                    <td className="px-2">
                      <div className="font-bold text-slate-900">{r.class_code}</div>
                      <div className="text-[10px] text-slate-500">{r.subject}</div>
                      {r.notes.map((n) => <div key={n} className="text-[10px] text-amber-700 font-semibold">{n}</div>)}
                      {r.saved && <div className="text-[10px] text-emerald-700">Direkod</div>}
                    </td>
                    <td className="px-2">
                      {r.locked ? r.teacher_name : (
                        <select aria-label={`Guru ${r.class_code}`} value={r.teacher_id || ''} onChange={(e) => update(r.class_id, { teacher_id: Number(e.target.value) })} className={cell}>
                          <option value="">Tiada guru</option>
                          {activeTeachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-2">
                      {r.locked ? <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> {STATUSES.find((s) => s.id === r.status)?.label}</span> : (
                        <select aria-label={`Status ${r.class_code}`} value={r.status} onChange={(e) => update(r.class_id, { status: e.target.value })} className={cell}>
                          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-2">
                      {['ABSENT', 'REPLACED'].includes(r.status) && (
                        <input aria-label={`Sebab ${r.class_code}`} required disabled={r.locked} placeholder="cth. MC, kursus" value={r.reason} onChange={(e) => update(r.class_id, { reason: e.target.value })} className={cell} />
                      )}
                    </td>
                    <td className="px-2">
                      {r.status === 'REPLACED' && (
                        <select aria-label={`Guru ganti ${r.class_code}`} disabled={r.locked} value={r.replacement_teacher} onChange={(e) => update(r.class_id, { replacement_teacher: e.target.value })} className={cell}>
                          <option value="">Pilih guru ganti</option>
                          {activeTeachers.filter((t) => t.id !== r.teacher_id)
                            .sort((a, b) => (a.teacher_type === 'REPLACEMENT' ? -1 : 1) - (b.teacher_type === 'REPLACEMENT' ? -1 : 1))
                            .map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.teacher_type === 'REPLACEMENT' ? ' (ganti)' : ''}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-2"><input aria-label={`Catatan ${r.class_code}`} disabled={r.locked} value={r.remarks} onChange={(e) => update(r.class_id, { remarks: e.target.value })} className={cell} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.some((r) => r.locked) && <p className="text-[11px] text-slate-500 flex items-center gap-1"><Lock className="w-3 h-3" /> Bayaran bulan ini untuk guru berkenaan sudah disahkan, jadi rekodnya dikunci.</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Laporan Kehadiran Guru Bulanan</h3>
            <p className="text-slate-500">{new Date(`${month}-01T00:00:00`).toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' })}</p>
          </div>
          <button onClick={() => downloadCsv(`kehadiran-guru-${month}.csv`,
            ['Kod', 'Guru', 'Jenis', 'Mengajar', 'Sebagai Ganti', 'Tidak Hadir', 'Diganti', 'Batal', ...(canSeePay ? ['Bayaran (RM)'] : [])],
            summary.map((r) => [r.teacher_code, r.name, r.teacher_type, r.taught, r.as_replacement, r.absent, r.replaced, r.cancelled, ...(canSeePay ? [r.amount] : [])]))}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]">
              <tr><th className="py-2 px-3">Guru</th><th className="px-3">Mengajar</th><th className="px-3">Sebagai ganti</th><th className="px-3">Tidak hadir</th><th className="px-3">Diganti</th><th className="px-3">Batal</th>{canSeePay && <th className="px-3">Bayaran</th>}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">Tiada rekod bulan ini.</td></tr>}
              {summary.map((r) => (
                <tr key={r.teacher_id}>
                  <td className="py-2 px-3 font-semibold">{r.name} <span className="text-slate-400">({r.teacher_code})</span></td>
                  <td className="px-3">{r.taught}</td>
                  <td className="px-3">{r.as_replacement}</td>
                  <td className="px-3">{r.absent}</td>
                  <td className="px-3">{r.replaced}</td>
                  <td className="px-3">{r.cancelled}</td>
                  {canSeePay && <td className="px-3 font-bold">{money(r.amount)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
