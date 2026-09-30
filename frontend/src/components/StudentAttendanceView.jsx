import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { attendanceApi } from '../api/client';
import { downloadCsv, today } from './studentShared';

// JavaScript getDay() -> timetable day codes (the centre has no Sunday classes)
const DAY_CODES = [null, 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'];

function dayCode(isoDate) {
  return DAY_CODES[new Date(`${isoDate}T00:00:00`).getDay()] || null;
}

export default function StudentAttendanceView() {
  const { timetable, showToast } = useApp();
  const [date, setDate] = useState(today());
  const [classId, setClassId] = useState('');
  const [roster, setRoster] = useState(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);

  const day = dayCode(date);
  const dayClasses = useMemo(() => timetable
    .filter((c) => c.day === day)
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.class_code.localeCompare(b.class_code)), [timetable, day]);

  const loadSummary = useCallback(() => {
    attendanceApi.summary(`${date.slice(0, 8)}01`, date).then(setSummary).catch(() => {});
  }, [date]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    attendanceApi.roster(classId, date)
      .then((r) => {
        if (cancelled) return;
        // Unsaved days default everyone to present so staff only tick absentees
        setRoster({ ...r, students: r.students.map((s) => ({ ...s, present: s.present ?? true })) });
      })
      .catch(() => showToast('Gagal memuat senarai kelas.', 'error'));
    return () => { cancelled = true; };
  }, [classId, date, showToast]);

  const selectDate = (value) => {
    setDate(value);
    setClassId('');
    setRoster(null);
  };

  const updateRow = (id, patch) => setRoster((r) => ({
    ...r, students: r.students.map((s) => (s.student === id ? { ...s, ...patch } : s)),
  }));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await attendanceApi.save({
        class_id: Number(classId), date, note: roster.note,
        marks: roster.students.map((s) => ({ student: s.student, present: s.present, note: s.note })),
      });
      setRoster(saved);
      loadSummary();
      showToast(`Kehadiran ${saved.class_code} (${saved.date}) disimpan: ${saved.present}/${saved.total} hadir.`);
    } catch (err) {
      showToast(err.message || 'Ralat menyimpan kehadiran.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const present = roster ? roster.students.filter((s) => s.present).length : 0;

  return (
    <div className="space-y-6 text-xs">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-lg font-bold text-slate-900">Kehadiran Pelajar</h2>
        <p className="text-slate-500">Pilih tarikh dan kelas. Senarai pelajar diambil daripada pendaftaran kelas semasa.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-end gap-3">
            <label className="font-semibold text-slate-700">Tarikh
              <input type="date" value={date} onChange={(e) => selectDate(e.target.value)} className="block mt-1 px-3 py-2 rounded-xl border border-slate-200" />
            </label>
            <label className="font-semibold text-slate-700 flex-1 min-w-[220px]">Kelas {day ? `(${day})` : ''}
              <select value={classId} onChange={(e) => { setClassId(e.target.value); setRoster(null); }} disabled={!day} className="block w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white">
                <option value="">{day ? `Pilih kelas (${dayClasses.length})…` : 'Tiada kelas pada hari Ahad'}</option>
                {dayClasses.map((c) => <option key={c.id} value={c.id}>{c.period_label} • {c.class_code} ({c.current_enrolled} pelajar)</option>)}
              </select>
            </label>
          </div>

          {roster && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{roster.class_code} • {roster.date}</h3>
                  <p className="text-slate-500">
                    {roster.saved ? <span className="text-emerald-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Disimpan oleh {roster.recorded_by}</span> : 'Belum direkodkan'}
                    {' • '}{present}/{roster.students.length} hadir
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => downloadCsv(`kehadiran-${roster.class_code}-${roster.date}.csv`, ['ID', 'Nama', 'Hadir', 'Catatan', 'Telefon Waris'],
                    roster.students.map((s) => [s.student_id, s.name, s.present ? 'Ya' : 'Tidak', s.note, s.parent_phone]))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold flex items-center gap-1 cursor-pointer">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button onClick={() => setRoster((r) => ({ ...r, students: r.students.map((s) => ({ ...s, present: true })) }))} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold cursor-pointer">Semua hadir</button>
                </div>
              </div>
              {roster.students.length === 0 ? <p className="py-6 text-center text-slate-400">Tiada pelajar aktif dalam kelas ini.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Pelajar</th><th className="px-3">Hadir</th><th className="px-3">Catatan</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {roster.students.map((s) => (
                        <tr key={s.student} className={s.present ? '' : 'bg-rose-50/60'}>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-900">{s.name}</div>
                            <div className="text-slate-400 text-[10px]">{s.student_id}{s.status === 'ON_HOLD' ? ' • Ditangguh' : ''}</div>
                          </td>
                          <td className="px-3">
                            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                              <button onClick={() => updateRow(s.student, { present: true })} aria-pressed={s.present} className={`px-3 py-1 font-bold cursor-pointer ${s.present ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>Hadir</button>
                              <button onClick={() => updateRow(s.student, { present: false })} aria-pressed={!s.present} className={`px-3 py-1 font-bold cursor-pointer ${!s.present ? 'bg-rose-600 text-white' : 'bg-white text-slate-500'}`}>Tidak</button>
                            </div>
                          </td>
                          <td className="px-3"><input aria-label={`Catatan ${s.name}`} value={s.note} onChange={(e) => updateRow(s.student, { note: e.target.value })} className="w-full px-2 py-1 rounded-lg border border-slate-200" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <label className="block font-semibold text-slate-700">Catatan kelas
                <textarea rows="2" value={roster.note} onChange={(e) => setRoster({ ...roster, note: e.target.value })} className="block w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" />
              </label>
              <div className="flex justify-end">
                <button onClick={save} disabled={saving || roster.students.length === 0} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50 cursor-pointer">
                  {saving ? 'Menyimpan…' : 'Simpan Kehadiran'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 h-fit">
          <h3 className="text-sm font-bold text-slate-900">Kadar Kehadiran Bulan Ini</h3>
          {!summary || summary.total === 0 ? <p className="text-slate-400">Belum ada kehadiran direkodkan bulan ini.</p> : (
            <>
              <div className="text-2xl font-black text-slate-900">{summary.rate}% <span className="text-sm font-semibold text-slate-500">({summary.present}/{summary.total})</span></div>
              <div className="divide-y divide-slate-100">
                {summary.classes.map((c) => (
                  <div key={c.class_id} className="py-2 flex justify-between gap-2">
                    <span className="font-semibold text-slate-800">{c.class_code} <span className="text-slate-400 font-normal">({c.sessions} sesi)</span></span>
                    <span className={`font-bold whitespace-nowrap ${c.rate < 70 ? 'text-rose-600' : 'text-emerald-700'}`}>{c.rate}% ({c.present}/{c.total})</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">Merah: di bawah 70%.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
