import React, { useCallback, useEffect, useState } from 'react';
import { GitPullRequest } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { academicApi } from '../api/client';

const STATUS_CLS = { PENDING: 'bg-amber-100 text-amber-800', APPROVED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-rose-100 text-rose-800' };

// Supervisor's master-timetable changes: Management approves (applied) or rejects with a reason
export default function TimetableChangesPanel({ currentRole, reloadKey }) {
  const { showToast, refreshTimetable } = useApp();
  const [rows, setRows] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const isManagement = currentRole === 'MANAGEMENT';

  const load = useCallback(() => {
    academicApi.getTimetableChanges(showAll ? '' : 'PENDING').then(setRows).catch(() => setRows([]));
  }, [showAll]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const decide = async (change, name) => {
    const comment = name === 'reject' ? window.prompt('Sebab penolakan:') : '';
    if (name === 'reject' && !comment) return;
    try {
      await academicApi.timetableChangeAction(change.id, name, { comment });
      showToast(name === 'approve' ? 'Perubahan diluluskan dan dikemas kini dalam jadual.' : 'Perubahan ditolak.');
      load();
      if (name === 'approve') refreshTimetable();
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat.', 'error');
    }
  };

  const pending = rows.filter((r) => r.status === 'PENDING').length;
  if (!showAll && rows.length === 0 && !isManagement) {
    return (
      <p className="text-[11px] text-slate-500">Perubahan jadual oleh Supervisor dihantar kepada Management untuk kelulusan sebelum berkuat kuasa.</p>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
          <GitPullRequest className="w-4 h-4 text-amber-600" /> Perubahan Jadual Induk {pending > 0 && <span className="text-amber-700">({pending} menunggu kelulusan Management)</span>}
        </h3>
        <label className="flex items-center gap-1.5 font-semibold text-slate-600"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Tunjuk sejarah</label>
      </div>
      {rows.length === 0 ? <p className="text-slate-400">Tiada perubahan menunggu kelulusan.</p> : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="p-3 rounded-xl border border-slate-200 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-900">{c.action_label}{c.class_label ? `: ${c.class_label}` : ''}</div>
                <div className="text-slate-600">{c.summary || '-'}</div>
                <div className="text-[10px] text-slate-400">Oleh {c.requested_by} • {String(c.created_at).slice(0, 10)}
                  {c.decided_by && ` • ${c.status === 'REJECTED' ? 'Ditolak' : 'Diluluskan'} ${c.decided_by}`}{c.decision_comment && `: "${c.decision_comment}"`}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[c.status]}`}>{c.status_label}</span>
                {isManagement && c.status === 'PENDING' && (
                  <>
                    <button onClick={() => decide(c, 'reject')} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold cursor-pointer">Tolak</button>
                    <button onClick={() => decide(c, 'approve')} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer">Luluskan</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
