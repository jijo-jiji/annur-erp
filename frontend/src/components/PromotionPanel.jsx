import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { studentsApi } from '../api/client';

// Year-end move of active students to their grade's next grade (from the master-data grade list)
export default function PromotionPanel() {
  const { showToast, refreshStudents } = useApp();
  const [removeOld, setRemoveOld] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const preview = useCallback(() => {
    studentsApi.promote(true, removeOld).then(setResult).catch(() => setResult(null));
  }, [removeOld]);
  useEffect(() => { preview(); }, [preview]);

  const apply = async () => {
    if (!window.confirm(`Naikkan ${result.ready} pelajar ke gred seterusnya? Tindakan ini tidak boleh dibatalkan secara automatik.`)) return;
    setBusy(true);
    try {
      const res = await studentsApi.promote(false, removeOld);
      setResult(res);
      await refreshStudents();
      showToast(`${res.promoted} pelajar dinaikkan ke gred seterusnya.`);
    } catch (err) {
      showToast(err.message || 'Ralat semasa menaikkan tingkatan.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const moving = result?.rows.filter((r) => r.result !== 'UNCHANGED') || [];
  const staying = result?.rows.filter((r) => r.result === 'UNCHANGED') || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><ArrowUpCircle className="w-4 h-4 text-indigo-600" /> Naik Tingkatan Akhir Tahun</h3>
          <p className="text-slate-500 max-w-2xl">Pelajar aktif dan ditangguh dinaikkan ke "gred seterusnya" yang ditetapkan dalam Data Induk (Form / Tingkatan). Gred tanpa gred seterusnya (cth. Tingkatan 5) tidak diubah. Setiap perubahan direkod dalam sejarah pelajar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 font-semibold text-slate-700">
            <input type="checkbox" checked={removeOld} onChange={(e) => setRemoveOld(e.target.checked)} /> Keluarkan daripada kelas gred lama
          </label>
          <button onClick={apply} disabled={busy || !result?.ready} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer disabled:opacity-50">
            {busy ? 'Memproses…' : `Naikkan ${result?.ready || 0} pelajar`}
          </button>
        </div>
      </div>
      {result && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Pelajar</th><th className="px-3">Dari</th><th className="px-3">Ke</th><th className="px-3">Kelas dikeluarkan</th><th className="px-3">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {moving.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">Tiada pelajar untuk dinaikkan.</td></tr>}
                {moving.map((r) => (
                  <tr key={r.student_id}>
                    <td className="py-2 px-3 font-semibold">{r.name} <span className="text-slate-400 font-normal">{r.student_code}</span></td>
                    <td className="px-3">{r.from_label}</td>
                    <td className="px-3 font-bold text-indigo-700">{r.to_label}</td>
                    <td className="px-3 text-slate-600">{r.classes_removed.length ? r.classes_removed.join(', ') : '-'}</td>
                    <td className="px-3">{r.result === 'PROMOTED' ? <span className="text-emerald-700 font-semibold">Dinaikkan</span> : 'Sedia'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {staying.length > 0 && (
            <details className="text-slate-600">
              <summary className="cursor-pointer font-semibold">Tidak berubah ({staying.length})</summary>
              <ul className="mt-2 space-y-1">{staying.map((r) => <li key={r.student_id}>{r.name} ({r.from_label}): {r.reason}</li>)}</ul>
            </details>
          )}
          {removeOld && <p className="text-[11px] text-slate-400">Pelajar yang dikeluarkan daripada kelas lama perlu diberi kelas gred baharu dalam profil masing-masing.</p>}
        </>
      )}
    </div>
  );
}
