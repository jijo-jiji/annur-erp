import { useEffect, useState } from 'react';
import { changeRequestApi } from '../api/client';
import { date } from '../lib/format';
import { isApprover } from '../lib/permissions';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, Segmented, useToast } from './ui';

const STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', WITHDRAWN: 'neutral' };

const errorText = (err) => (err?.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '') || err?.message || 'Ralat.';

// Requests to change setup data: Admin's wait here for Supervisor / Management; the person who asked
// can revise or withdraw until it is decided, and sees the decision (with the comment) afterwards.
// `requests` and `reload` come from the screen that owns the list; `onApplied` refreshes the data changed.
export default function ChangeRequestsPanel({ role, requests, reload, onApplied, editFields, editInitial, title = 'Permohonan perubahan' }) {
  const notify = useToast();
  const [tab, setTab] = useState('PENDING');
  const [rejecting, setRejecting] = useState(null);
  const [editing, setEditing] = useState(null);
  const approver = isApprover(role);

  const pending = requests.filter((r) => r.status === 'PENDING');
  const decided = requests.filter((r) => r.status !== 'PENDING');
  const unseen = decided.filter((r) => r.mine && !r.seen).length;
  const rows = tab === 'PENDING' ? pending : decided;

  // Opening the decisions marks them as read for the person who asked
  useEffect(() => {
    if (tab === 'DECIDED' && unseen > 0) changeRequestApi.acknowledge().then(reload).catch(() => {});
  }, [tab, unseen, reload]);

  const run = async (call, message) => {
    try {
      await call();
      if (message) notify(message);
      await reload();
      await onApplied?.();
    } catch (err) {
      notify(errorText(err), 'error');
      throw err;
    }
  };

  return (
    <Card>
      <CardHeader
        title={title}
        description={approver ? 'Permohonan Admin menunggu kelulusan. Perubahan Supervisor dan Pengurusan terus berkuat kuasa dan direkod di sini.' : 'Perubahan anda berkuat kuasa selepas diluluskan oleh Supervisor atau Pengurusan.'}
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            items={[
              { value: 'PENDING', label: `Menunggu${pending.length ? ` (${pending.length})` : ''}` },
              { value: 'DECIDED', label: `Keputusan${unseen ? ` (${unseen} baharu)` : ''}` },
            ]}
          />
        }
      />
      {rows.length === 0 ? (
        <EmptyState title={tab === 'PENDING' ? 'Tiada permohonan menunggu' : 'Belum ada keputusan'} />
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-gray-900">
                  {r.action_label} {r.kind_label.toLowerCase()}: {r.target_label}
                  {r.mine && !r.seen && r.status !== 'PENDING' && <Badge tone="blue" className="ml-2">Baharu</Badge>}
                </p>
                <ul className="text-gray-600">
                  {r.changes.map((c) => (
                    <li key={c.field}>
                      {c.label}: {c.before !== null && <span className="text-gray-400 line-through">{c.before}</span>}{c.before !== null && ' → '}<span className="text-gray-900">{c.after}</span>
                    </li>
                  ))}
                </ul>
                {r.note && <p className="text-gray-600">Sebab: {r.note}</p>}
                <p className="text-xs text-gray-500">
                  Oleh {r.requested_by_name} · {date(String(r.requested_at).slice(0, 10))}
                  {r.status === 'APPROVED' && r.direct && ' · berkuat kuasa terus'}
                  {r.status === 'APPROVED' && !r.direct && ` · diluluskan oleh ${r.decided_by}`}
                  {r.status === 'REJECTED' && ` · ditolak oleh ${r.decided_by}`}
                  {r.decision_comment && `: “${r.decision_comment}”`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={STATUS_TONE[r.status]}>{r.status_label}</Badge>
                {r.status === 'PENDING' && approver && (
                  <>
                    <Button size="sm" variant="danger" onClick={() => setRejecting(r)}>Tolak</Button>
                    <Button size="sm" variant="primary" onClick={() => run(() => changeRequestApi.approve(r.id), 'Permohonan diluluskan.').catch(() => {})}>Luluskan</Button>
                  </>
                )}
                {r.status === 'PENDING' && r.mine && (
                  <>
                    <Button size="sm" onClick={() => {
                      if (window.confirm('Tarik balik permohonan ini?')) run(() => changeRequestApi.withdraw(r.id), 'Permohonan ditarik balik.').catch(() => {});
                    }}>Tarik balik</Button>
                    <Button size="sm" onClick={() => setEditing(r)}>Ubah</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rejecting && (
        <FormModal
          title="Tolak permohonan"
          description={`${rejecting.action_label} ${rejecting.kind_label.toLowerCase()}: ${rejecting.target_label}`}
          danger
          submitLabel="Tolak permohonan"
          fields={[{ name: 'comment', label: 'Sebab penolakan', type: 'textarea', required: true }]}
          onSubmit={(v) => run(() => changeRequestApi.reject(rejecting.id, v.comment.trim()), 'Permohonan ditolak.')}
          onClose={() => setRejecting(null)}
        />
      )}
      {editing && (
        <FormModal
          title="Ubah permohonan"
          description="Anda boleh mengubah permohonan sehingga ia diputuskan."
          fields={[...editFields(editing), { name: 'note', label: 'Sebab permohonan', type: 'textarea', required: true }]}
          initial={{ ...editInitial(editing), note: editing.note }}
          onSubmit={({ note, ...values }) => run(() => changeRequestApi.revise(editing.id, values, note), 'Permohonan dikemas kini.')}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
