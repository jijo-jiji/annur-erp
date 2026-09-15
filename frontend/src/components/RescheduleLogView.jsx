import React, { useState } from 'react';
import { CalendarSync, Plus, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';

export default function RescheduleLogView() {
  const [logs, setLogs] = useState([
    { id: 1, month: "DEC '25", subject: "BI (A)", form: "F5", batal: "2025-12-09", ganti: "2025-12-30", extra: false, remarks: "Sesi start 12/12 / Cuti Krismas (PH)", approved: true },
    { id: 2, month: "DEC '25", subject: "MATH (A)", form: "F5", batal: "2025-12-10", ganti: "2025-12-31", extra: false, remarks: "Hari Krismas (PH)", approved: true },
    { id: 3, month: "JAN '26", subject: "ADDMT (A)", form: "F5", batal: "2026-01-23", ganti: "2026-01-30", extra: false, remarks: "Cg marking paper SPM", approved: true },
    { id: 4, month: "JAN '26", subject: "FIZIK (B)", form: "F5", batal: "2026-01-24", ganti: "2026-01-31", extra: false, remarks: "Cg silap tgk masa batal 30 min", approved: true },
    { id: 5, month: "JAN '26", subject: "KIMIA (A)", form: "F5", batal: null, ganti: "2026-01-31", extra: true, remarks: "Sesi intensif kelas tambahan exam", approved: true },
  ]);

  const [showModal, setShowModal] = useState(false);
  const [newLog, setNewLog] = useState({
    month: "FEB '26",
    subject: "F5 BIO (A)",
    form: "F5",
    batal: "",
    ganti: "",
    extra: false,
    remarks: ""
  });

  const handleCreate = (e) => {
    e.preventDefault();
    setLogs([{ id: logs.length + 1, ...newLog, approved: true }, ...logs]);
    setShowModal(false);
    alert(`Rekod Gantian Kelas berjaya disimpan! Notis WhatsApp dijana untuk dihantar kepada pelajar.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Catatan Pembatalan & Gantian Kelas</h2>
          <p className="text-xs text-slate-500">
            Direkodkan mengikut buku log rasmi Pusat Tuisyen An Nur (Tarikh Batal, Tarikh Ganti, Extra Class & Sebab)
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> + Catat Pembatalan / Gantian
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
            <tr>
              <th className="py-3.5 px-4">Bulan</th>
              <th className="py-3.5 px-4">Subjek / Kelas</th>
              <th className="py-3.5 px-4">Ting / Djh</th>
              <th className="py-3.5 px-4">Tarikh Batal</th>
              <th className="py-3.5 px-4">Tarikh Ganti</th>
              <th className="py-3.5 px-4 text-center">Extra Class</th>
              <th className="py-3.5 px-4">Catatan & Sebab (Remarks)</th>
              <th className="py-3.5 px-4 text-right">Notis WhatsApp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50 transition">
                <td className="py-3.5 px-4 font-bold text-indigo-700">{log.month}</td>
                <td className="py-3.5 px-4 font-semibold text-slate-900">{log.subject}</td>
                <td className="py-3.5 px-4">
                  <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-[10px] text-slate-700">
                    {log.form}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-rose-600 font-medium">{log.batal || '-'}</td>
                <td className="py-3.5 px-4 text-emerald-600 font-bold">{log.ganti}</td>
                <td className="py-3.5 px-4 text-center">
                  {log.extra ? (
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px]">
                      YA
                    </span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-slate-700">{log.remarks}</td>
                <td className="py-3.5 px-4 text-right">
                  <button
                    onClick={() =>
                      alert(
                        `Format WhatsApp Notis Gantian Kelas:\n\n"Assalamualaikum ibu bapa/pelajar. Makluman gantian kelas bagi ${log.subject} (${log.form}):\nTarikh Batal: ${log.batal || '-'}\nTarikh Ganti: ${log.ganti}\nSebab: ${log.remarks}\n\nHarap maklum. Terima kasih - Pusat Tuisyen An Nur."`
                      )
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition font-semibold text-[11px]"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" /> Hantar Notis
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Rekod Pembatalan & Gantian Kelas Baru</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bulan Operasi</label>
                <input
                  type="text"
                  value={newLog.month}
                  onChange={(e) => setNewLog({ ...newLog, month: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subjek & Kelas</label>
                <input
                  type="text"
                  placeholder="Contoh: F5 ADDMT (A) Z"
                  value={newLog.subject}
                  onChange={(e) => setNewLog({ ...newLog, subject: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tarikh Batal (Jika ada)</label>
                  <input
                    type="date"
                    value={newLog.batal}
                    onChange={(e) => setNewLog({ ...newLog, batal: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tarikh Ganti *</label>
                  <input
                    type="date"
                    required
                    value={newLog.ganti}
                    onChange={(e) => setNewLog({ ...newLog, ganti: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={newLog.extra}
                    onChange={(e) => setNewLog({ ...newLog, extra: e.target.checked })}
                  />
                  Kelas Tambahan (Extra Class)
                </label>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan / Sebab (Remarks) *</label>
                <textarea
                  rows="2"
                  placeholder="Contoh: Cikgu menanda kertas / Hari Pelepasan Am"
                  required
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
                <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">
                  Simpan & Sahkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}