import React, { useMemo, useState } from 'react';
import { CalendarSync, Plus, MessageSquare, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

const REASONS = [
  { value: 'PH', label: 'Cuti Umum / Hari Pelepasan Am' },
  { value: 'MARKING_PAPER', label: 'Guru Menanda Kertas Peperiksaan' },
  { value: 'TIME_MISTAKE', label: 'Pembetulan Jadual / Masa Bertindih' },
  { value: 'EMERGENCY_LEAVE', label: 'Kecemasan / Cuti Sakit Guru' },
  { value: 'EXTRA_SESSION', label: 'Kelas Tambahan Peperiksaan' },
  { value: 'OTHER', label: 'Lain-lain' },
];
const REASON_LABELS = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'OGO', 'SEP', 'OKT', 'NOV', 'DIS'];

// Log book month label, e.g. "SEP '26", taken from the replacement date
function monthLabel(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

const emptyForm = {
  timetable_class: '',
  tarikh_batal: '',
  tarikh_ganti: '',
  is_extra_class: false,
  reason_type: 'PH',
  remarks: '',
};

export default function RescheduleLogView({ currentRole = 'ADMIN' }) {
  const { reschedules, timetable, createReschedule, approveReschedule, markRescheduleNotified, showToast } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [newLog, setNewLog] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const isAdmin = currentRole === 'ADMIN';
  const isSupervisor = currentRole === 'SUPERVISOR';
  const isManagement = currentRole === 'MANAGEMENT';
  const canApprove = isSupervisor || isManagement;

  const classOptions = useMemo(
    () => [...timetable].sort((a, b) => a.class_code.localeCompare(b.class_code)),
    [timetable]
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createReschedule({
        ...newLog,
        timetable_class: Number(newLog.timetable_class),
        tarikh_batal: newLog.tarikh_batal || null,
        month_label: monthLabel(newLog.tarikh_ganti),
      });
      setShowModal(false);
      setNewLog(emptyForm);
    } catch {
      // toast already shown
    } finally {
      setSaving(false);
    }
  };

  const handleNotify = async (log) => {
    const message = [
      'Assalamualaikum ibu bapa/pelajar.',
      `Makluman ${log.is_extra_class ? 'kelas tambahan' : 'gantian kelas'} bagi ${log.class_code}:`,
      `Tarikh Batal: ${log.tarikh_batal || '-'}`,
      `Tarikh Ganti: ${log.tarikh_ganti || '-'}`,
      `Sebab: ${REASON_LABELS[log.reason_type] || ''}${log.remarks ? ` (${log.remarks})` : ''}`,
      '',
      'Harap maklum. Terima kasih - Pusat Tuisyen An Nur.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(message);
      await markRescheduleNotified(log.id);
      showToast('Teks notis disalin. Tampal ke grup WhatsApp kelas.');
    } catch {
      window.prompt('Salin teks notis ini ke grup WhatsApp kelas:', message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Catatan Pembatalan & Gantian Kelas</h2>
          <p className="text-xs text-slate-500">
            Buku log rasmi: Tarikh Batal, Tarikh Ganti, Kelas Tambahan & Sebab
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Catat Pembatalan / Gantian
        </button>
      </div>

      {isAdmin && (
        <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl flex items-center gap-3 text-purple-900 text-xs">
          <CalendarSync className="w-5 h-5 text-purple-600 shrink-0" />
          <p>
            <span className="font-bold">Admin merekod</span> pembatalan/gantian atas arahan guru. Rekod menunggu kelulusan Supervisor sebelum notis dihantar kepada waris.
          </p>
        </div>
      )}

      {canApprove && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-center gap-3 text-blue-900 text-xs">
          <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
          <p>
            <span className="font-bold">Kelulusan gantian:</span> semak pertembungan bilik dan jadual sebelum meluluskan.
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
            <tr>
              <th className="py-3.5 px-4">Bulan</th>
              <th className="py-3.5 px-4">Kelas</th>
              <th className="py-3.5 px-4">Tarikh Batal</th>
              <th className="py-3.5 px-4">Tarikh Ganti</th>
              <th className="py-3.5 px-4 text-center">Extra Class</th>
              <th className="py-3.5 px-4">Sebab & Catatan</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reschedules.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">Tiada rekod pembatalan atau gantian kelas.</td>
              </tr>
            )}
            {reschedules.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50 transition">
                <td className="py-3.5 px-4 font-bold text-indigo-700">{log.month_label || '-'}</td>
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-slate-900">{log.class_code}</div>
                  <div className="text-[10px] text-slate-400">{log.teacher_name || 'Guru belum ditetapkan'}</div>
                </td>
                <td className="py-3.5 px-4 text-rose-600 font-medium">{log.tarikh_batal || '-'}</td>
                <td className="py-3.5 px-4 text-emerald-600 font-bold">{log.tarikh_ganti || '-'}</td>
                <td className="py-3.5 px-4 text-center">
                  {log.is_extra_class ? (
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px]">YA</span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-slate-700">
                  <div className="font-semibold">{REASON_LABELS[log.reason_type] || log.reason_type}</div>
                  {log.remarks && <div className="text-[11px] text-slate-500">{log.remarks}</div>}
                </td>
                <td className="py-3.5 px-4">
                  {log.supervisor_approved ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      <CheckCircle2 className="w-3 h-3" /> Diluluskan
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      Menunggu Supervisor
                    </span>
                  )}
                  {log.whatsapp_notification_sent && (
                    <div className="text-[10px] text-emerald-700 mt-1">Notis dihantar</div>
                  )}
                </td>
                <td className="py-3.5 px-4 text-right">
                  {!log.supervisor_approved ? (
                    canApprove ? (
                      <button
                        onClick={() => approveReschedule(log.id)}
                        className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                      >
                        ✓ Luluskan
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Perlu Kelulusan</span>
                    )
                  ) : (
                    <button
                      onClick={() => handleNotify(log)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition font-semibold text-[11px] cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" /> Salin Notis WhatsApp
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Rekod Pembatalan & Gantian Kelas</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label htmlFor="rs-class" className="block font-semibold text-slate-700 mb-1">Kelas *</label>
                <select
                  id="rs-class"
                  required
                  value={newLog.timetable_class}
                  onChange={(e) => setNewLog({ ...newLog, timetable_class: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">Pilih kelas…</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.class_code} • {c.day} {c.period_label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rs-batal" className="block font-semibold text-slate-700 mb-1">Tarikh Batal (jika ada)</label>
                  <input
                    id="rs-batal"
                    type="date"
                    value={newLog.tarikh_batal}
                    onChange={(e) => setNewLog({ ...newLog, tarikh_batal: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="rs-ganti" className="block font-semibold text-slate-700 mb-1">Tarikh Ganti *</label>
                  <input
                    id="rs-ganti"
                    type="date"
                    required
                    value={newLog.tarikh_ganti}
                    onChange={(e) => setNewLog({ ...newLog, tarikh_ganti: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="rs-reason" className="block font-semibold text-slate-700 mb-1">Sebab *</label>
                <select
                  id="rs-reason"
                  value={newLog.reason_type}
                  onChange={(e) => setNewLog({ ...newLog, reason_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={newLog.is_extra_class}
                  onChange={(e) => setNewLog({ ...newLog, is_extra_class: e.target.checked })}
                />
                Kelas Tambahan (Extra Class)
              </label>
              <div>
                <label htmlFor="rs-remarks" className="block font-semibold text-slate-700 mb-1">Catatan</label>
                <textarea
                  id="rs-remarks"
                  rows="2"
                  value={newLog.remarks}
                  onChange={(e) => setNewLog({ ...newLog, remarks: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60">
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
