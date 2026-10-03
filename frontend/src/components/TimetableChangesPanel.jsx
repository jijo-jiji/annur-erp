import { useCallback, useEffect, useState } from 'react';
import { academicApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { can } from '../lib/permissions';
import { date } from '../lib/format';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, Checkbox, useToast } from './ui';

const STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };

// Supervisor's master-timetable changes: Management approves (applied) or rejects with a reason
export default function TimetableChangesPanel({ role, reloadKey }) {
  const { refreshTimetable } = useApp();
  const notify = useToast();
  const [rows, setRows] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const canDecide = can(role, 'timetable.approve');

  const load = useCallback(() => {
    academicApi.getTimetableChanges(showAll ? '' : 'PENDING').then(setRows).catch(() => setRows([]));
  }, [showAll]);
  useEffect(() => { load(); }, [load, reloadKey]);

  // A failure is shown and re-thrown so the reject dialog stays open
  const decide = async (change, name, comment = '') => {
    try {
      await academicApi.timetableChangeAction(change.id, name, { comment });
      notify(name === 'approve' ? 'Perubahan diluluskan dan dikemas kini dalam jadual.' : 'Perubahan ditolak.', name === 'approve' ? 'success' : 'info');
      load();
      if (name === 'approve') refreshTimetable();
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      notify(detail || err.message || 'Ralat.', 'error');
      throw err;
    }
  };

  const pending = rows.filter((r) => r.status === 'PENDING').length;
  if (!showAll && rows.length === 0 && !canDecide) {
    return <p className="text-[13px] text-gray-500">Perubahan jadual oleh Supervisor dihantar kepada Pengurusan untuk kelulusan sebelum berkuat kuasa.</p>;
  }

  return (
    <Card>
      <CardHeader
        title="Perubahan jadual induk"
        description={pending > 0 ? `${pending} menunggu kelulusan Pengurusan` : 'Tiada perubahan menunggu kelulusan'}
        actions={<Checkbox label="Tunjuk sejarah" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />}
      />
      {rows.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{c.action_label}{c.class_label ? `: ${c.class_label}` : ''}</p>
                <p className="text-gray-600">{c.summary || '—'}</p>
                <p className="text-xs text-gray-500">
                  Oleh {c.requested_by} · {date(String(c.created_at).slice(0, 10))}
                  {c.decided_by && ` · ${c.status === 'REJECTED' ? 'ditolak' : 'diluluskan'} oleh ${c.decided_by}`}{c.decision_comment && `: “${c.decision_comment}”`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={STATUS_TONE[c.status]}>{c.status_label}</Badge>
                {canDecide && c.status === 'PENDING' && (
                  <>
                    <Button size="sm" variant="danger" onClick={() => setRejecting(c)}>Tolak</Button>
                    <Button size="sm" variant="primary" onClick={() => decide(c, 'approve').catch(() => {})}>Luluskan</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rejecting && (
        <FormModal
          title="Tolak perubahan jadual"
          description={`${rejecting.action_label}${rejecting.class_label ? `: ${rejecting.class_label}` : ''}`}
          danger
          submitLabel="Tolak perubahan"
          fields={[{ name: 'comment', label: 'Sebab penolakan', type: 'textarea', required: true }]}
          onSubmit={(v) => decide(rejecting, 'reject', v.comment.trim())}
          onClose={() => setRejecting(null)}
        />
      )}
    </Card>
  );
}
