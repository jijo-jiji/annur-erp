import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText, Inbox } from 'lucide-react';
import { studentsApi } from '../api/client';
import { useStore } from '../store';
import { clock, date, fmtPhone } from '../lib/format';
import { RESULT_GRADES, termOf } from '../lib/results';
import { openAttachment, useBlobUrl } from './Attachments';
import FormModal from './FormModal';
import { Badge, Button, Card, cx, EmptyState, inputClass, Modal, Segmented, Table, Td, Textarea, Th, useToast } from './ui';

const STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };

// Results parents and students sent on the public form. Nothing reaches the student's results until staff
// approve it here, after comparing it with the report slip and with what is already saved.
export default function ResultSubmissions({ onChanged }) {
  const store = useStore();
  const notify = useToast();
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState(null);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  const load = useCallback(() => {
    studentsApi.resultSubmissions(status).then(setRows).catch(() => setRows([]));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decided = async (message) => {
    notify(message);
    load();
    onChanged?.();
    await store.reload('results');
  };

  return (
    <>
      <Segmented
        className="mb-4"
        value={status}
        onChange={(v) => { setRows(null); setStatus(v); }}
        items={[{ value: 'PENDING', label: 'Menunggu semakan' }, { value: 'APPROVED', label: 'Diluluskan' }, { value: 'REJECTED', label: 'Ditolak' }]}
      />
      {rows === null ? (
        <Card><p className="p-5 text-sm text-gray-500">Memuatkan…</p></Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={status === 'PENDING' ? 'Tiada hantaran menunggu semakan' : 'Tiada rekod'}>
            {status === 'PENDING' && 'Keputusan yang dihantar oleh ibu bapa atau pelajar melalui borang awam akan dipaparkan di sini.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((sub) => (
            <Card key={sub.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
                <div>
                  <p className="font-medium text-gray-900">
                    <a href={`#/students/${sub.student_code}?tab=results`} className="hover:underline">{sub.student_name}</a>
                    <span className="font-normal text-gray-400"> · {sub.student_code}</span>
                  </p>
                  <p className="text-[13px] text-gray-500">
                    {sub.term_label} {sub.year} · dihantar oleh {sub.submitted_by}{sub.relation ? ` (${sub.relation})` : ''}{sub.phone ? ` · ${fmtPhone(sub.phone)}` : ''} · {date(sub.created_at.slice(0, 10))} {clock(sub.created_at)} · {sub.reference}
                  </p>
                  {sub.note && <p className="mt-1 text-[13px] text-gray-700">Catatan: {sub.note}</p>}
                  {sub.status !== 'PENDING' && (
                    <p className="mt-1 text-[13px] text-gray-600">
                      <Badge tone={STATUS_TONE[sub.status]}>{sub.status_label}</Badge> oleh {sub.reviewed_by}{sub.review_note ? `: ${sub.review_note}` : ''}
                    </p>
                  )}
                </div>
                {sub.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setRejecting(sub)}>Tolak</Button>
                    <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => setApproving(sub)}>Semak & luluskan</Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[1fr_auto]">
                <SubmittedRows sub={sub} />
                {sub.slip && <SlipPreview slip={sub.slip} />}
              </div>
            </Card>
          ))}
        </div>
      )}

      {approving && (
        <ApproveModal
          sub={approving}
          onClose={() => setApproving(null)}
          onDone={() => { setApproving(null); decided(`Keputusan ${approving.student_name} disimpan.`); }}
        />
      )}
      {rejecting && (
        <FormModal
          title={`Tolak hantaran ${rejecting.reference}`}
          description="Keputusan tidak disimpan. Nyatakan sebab supaya kaunter boleh memaklumkan ibu bapa."
          submitLabel="Tolak hantaran"
          initial={{ note: '' }}
          fields={[{ name: 'note', label: 'Sebab', type: 'textarea', required: true, placeholder: 'cth. Markah tidak sepadan dengan slip keputusan' }]}
          onSubmit={async ({ note }) => {
            await studentsApi.rejectSubmission(rejecting.id, note);
            setRejecting(null);
            decided('Hantaran ditolak.');
          }}
          onClose={() => setRejecting(null)}
        />
      )}
    </>
  );
}

function SubmittedRows({ sub }) {
  const gradeOnly = termOf(sub.term)?.gradeOnly;
  return (
    <Table>
      <thead>
        <tr><Th>Subjek</Th><Th className="text-right">Dihantar</Th><Th className="text-right">Sedia ada</Th></tr>
      </thead>
      <tbody>
        {sub.rows_detail.map((r) => {
          const sent = gradeOnly ? r.grade : r.mark ?? r.grade;
          const current = r.current_mark ?? r.current_grade;
          const changed = current !== '' && current != null && String(current) !== String(sent);
          return (
            <tr key={r.subject}>
              <Td className="text-gray-900">{r.subject_name}</Td>
              <Td className="text-right font-medium tnum">{sent}{!gradeOnly && r.grade ? <span className="ml-1.5 text-[13px] font-normal text-gray-500">{r.grade}</span> : null}</Td>
              <Td className={cx('text-right tnum', changed ? 'font-medium text-amber-700' : 'text-gray-400')}>{current === '' || current == null ? '—' : current}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function SlipPreview({ slip }) {
  const url = useBlobUrl(slip.is_image ? slip : null);
  return (
    <button type="button" onClick={() => openAttachment(slip)} className="group block w-full text-left md:w-48" title="Buka slip keputusan">
      {slip.is_image ? (
        url ? <img src={url} alt="Slip keputusan" className="h-40 w-full rounded-md border border-gray-200 object-cover group-hover:opacity-90" /> : <div className="h-40 rounded-md bg-gray-100" />
      ) : (
        <span className="flex h-20 items-center justify-center gap-2 rounded-md border border-gray-200 text-sm text-gray-700 group-hover:bg-gray-50"><FileText className="size-4" /> Slip (PDF)</span>
      )}
      <span className="mt-1 block text-[13px] text-gray-500">Slip keputusan · klik untuk buka</span>
    </button>
  );
}

// Staff can correct a mark against the slip before saving
function ApproveModal({ sub, onClose, onDone }) {
  const notify = useToast();
  const gradeOnly = termOf(sub.term)?.gradeOnly;
  const [rows, setRows] = useState(() => sub.rows_detail.map((r) => ({ subject: r.subject, name: r.subject_name, mark: r.mark ?? '', grade: r.grade || '' })));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setBusy(true);
    try {
      await studentsApi.approveSubmission(sub.id, rows.map(({ subject, mark, grade }) => ({ subject, mark: gradeOnly ? null : mark, grade: gradeOnly || mark === '' ? grade : '' })), note);
      onDone();
    } catch (err) {
      notify(err.data?.rows || err.data?.detail || err.message || 'Tidak dapat menyimpan.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Semak keputusan ${sub.student_name}`}
      description={`${sub.term_label} ${sub.year}. Betulkan jika tidak sepadan dengan slip; keputusan sedia ada bagi subjek ini akan diganti.`}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Luluskan & simpan'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {rows.map((r, i) => (
            <div key={r.subject} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-gray-900">{r.name}</span>
              {gradeOnly ? (
                <select aria-label={`Gred ${r.name}`} value={r.grade} onChange={(e) => set(i, { grade: e.target.value })} className={cx(inputClass, 'w-24 py-1.5')}>
                  {RESULT_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              ) : (
                <input
                  type="number" min="0" max="100" inputMode="numeric" aria-label={`Markah ${r.name}`} value={r.mark}
                  onChange={(e) => set(i, { mark: e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value))) })}
                  className={cx(inputClass, 'w-24 py-1.5 text-right tnum')}
                />
              )}
            </div>
          ))}
        </div>
        <Textarea label="Catatan (pilihan)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>
    </Modal>
  );
}
