import { useState } from 'react';
import { CalendarClock, Check, Copy, Download, Plus } from 'lucide-react';
import { CENTRE, DAYS } from '../lib/config';
import { downloadCsv } from '../lib/csv';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { classLabel } from '../lib/domain';
import { date, DAY_LABEL, RESCHEDULE_REASON_LABEL, timeRange, todayISO } from '../lib/format';
import {
  Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Segmented, Select, Table, Tabs, Td, Textarea, Th, useToast, WhatsAppIcon,
} from './ui';


export default function RescheduleLogView({ role }) {
  const { reschedules, classes, subjects, teachers, rescheduleAction } = useStore();
  const notify = useToast();
  // The timetable links here with ?class=<id> to record a cancellation for that class
  const presetClass = new URLSearchParams(window.location.hash.split('?')[1]).get('class') || '';
  const [tab, setTab] = useState('all');
  const [creating, setCreating] = useState(Boolean(presetClass));
  const [notice, setNotice] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  const byId = Object.fromEntries(classes.map((c) => [c.id, c]));
  const pending = reschedules.filter((r) => r.status === 'PENDING');
  const unverified = reschedules.filter((r) => r.approved && !r.verifiedBy);
  const rows = tab === 'pending' ? pending : tab === 'unverified' ? unverified : reschedules;
  const canApprove = can(role, 'reschedules.approve');
  const canVerify = can(role, 'reschedules.verify');
  const STATUS_TEXT = { PENDING: 'Menunggu supervisor', APPROVED: 'Diluluskan', REJECTED: 'Ditolak' };

  const decide = (r, name, comment = '') =>
    rescheduleAction(r.id, name, comment)
      .then(() => notify({ approve: 'Rekod diluluskan.', reject: 'Rekod ditolak.', verify: 'Rekod disahkan oleh Pengurusan.' }[name], name === 'reject' ? 'info' : 'success'))
      .catch(() => {});

  const exportCsv = () => downloadCsv('batal-ganti-kelas.csv', ['Kelas', 'Tarikh batal', 'Tarikh ganti', 'Kelas tambahan', 'Sebab', 'Catatan', 'Status', 'Diputuskan oleh', 'Disahkan oleh', 'Direkod oleh', 'Notis dihantar'],
    reschedules.map((r) => [r.classCode, r.cancelled, r.replacement, r.extra ? 'Ya' : '', RESCHEDULE_REASON_LABEL[r.reason] || r.reason, r.remarks, STATUS_TEXT[r.status], r.decidedBy, r.verifiedBy, r.recordedBy, r.notified ? 'Ya' : '']));

  return (
    <>
      <PageHeader
        title="Batal & ganti kelas"
        description="Rekod rasmi pembatalan, kelas ganti dan kelas tambahan, termasuk makluman kepada pelajar."
        actions={
          <>
            <Button icon={Download} onClick={exportCsv}>Excel</Button>
            {can(role, 'reschedules.create') && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                Rekod baharu
              </Button>
            )}
          </>
        }
      />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'all', label: 'Semua rekod', count: reschedules.length },
          { value: 'pending', label: 'Menunggu kelulusan', count: pending.length },
          ...(canVerify ? [{ value: 'unverified', label: 'Belum disahkan Pengurusan', count: unverified.length }] : []),
        ]}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Tiada rekod" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Kelas</Th>
                <Th>Tarikh</Th>
                <Th>Sebab</Th>
                <Th>Status</Th>
                <Th className="text-right">Tindakan</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = byId[r.classId];
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <Td className="min-w-44">
                      <p className="font-medium text-gray-900">{c ? classLabel(c, subjects) : r.classCode || '—'}</p>
                      {teachers.find((t) => t.code === c?.teacher) && <p className="text-[13px] text-gray-500">Cikgu {teachers.find((t) => t.code === c?.teacher).name}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.extra ? (
                        <>
                          <p className="text-gray-900">{date(r.replacement)}</p>
                          <Badge tone="blue" className="mt-1">Kelas tambahan</Badge>
                        </>
                      ) : (
                        <>
                          {r.cancelled && <p className="text-gray-500 line-through decoration-gray-400">{date(r.cancelled)}</p>}
                          <p className="text-gray-900">{r.cancelled ? '→ ' : ''}{r.replacement ? date(r.replacement) : 'Tiada ganti'}</p>
                        </>
                      )}
                    </Td>
                    <Td className="min-w-40">
                      <p className="text-gray-900">{RESCHEDULE_REASON_LABEL[r.reason] || r.reason}</p>
                      {r.remarks && <p className="text-[13px] text-gray-500">{r.remarks}</p>}
                    </Td>
                    <Td className="min-w-40">
                      <Badge tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>{STATUS_TEXT[r.status] || r.status}</Badge>
                      <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                        {r.decidedBy && <p>{r.rejected ? 'Ditolak' : 'Diluluskan'} oleh {r.decidedBy}</p>}
                        {r.comment && <p>“{r.comment}”</p>}
                        {r.verifiedBy && <p className="font-medium text-brand-700">Disahkan oleh {r.verifiedBy}</p>}
                        {r.recordedBy && <p>Direkod oleh {r.recordedBy}</p>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        {r.status === 'PENDING' && canApprove && (
                          <>
                            <Button size="sm" variant="danger" onClick={() => setRejecting(r)}>Tolak</Button>
                            <Button size="sm" variant="primary" onClick={() => decide(r, 'approve')}>Luluskan</Button>
                          </>
                        )}
                        {r.approved && canVerify && !r.verifiedBy && (
                          <Button size="sm" onClick={() => decide(r, 'verify')}>Sahkan</Button>
                        )}
                        {r.approved && (
                          <Button size="sm" onClick={() => setNotice(r)} title={r.notified ? 'Notis telah dihantar' : 'Hantar notis WhatsApp'} className="px-2 xl:px-3">
                            <WhatsAppIcon className="size-3.5" />
                            <span className="hidden xl:inline">{r.notified ? 'Dihantar' : 'Hantar notis'}</span>
                            {r.notified && <Check className="size-3.5 text-brand-600 xl:hidden" aria-label="Dihantar" />}
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <CreateModal open={creating} role={role} presetClass={presetClass} onClose={() => setCreating(false)} />
      <NoticeModal record={notice} cls={notice && byId[notice.classId]} onClose={() => setNotice(null)} />
      {rejecting && (
        <RejectModal
          record={rejecting}
          onClose={() => setRejecting(null)}
          onReject={(comment) => decide(rejecting, 'reject', comment).then(() => setRejecting(null))}
        />
      )}
    </>
  );
}

// A rejection always carries a reason, shown to whoever recorded the entry
function RejectModal({ record, onClose, onReject }) {
  const [comment, setComment] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title="Tolak rekod"
      description={record.classCode}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="danger" disabled={!comment.trim()} onClick={() => onReject(comment.trim())}>
            Tolak rekod
          </Button>
        </>
      }
    >
      <Textarea label="Sebab penolakan" required rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
    </Modal>
  );
}

const MONTH_CODES = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'OGO', 'SEP', 'OKT', 'NOV', 'DIS'];
// Log book month, e.g. "SEP '26"
const logMonth = (iso) => (iso ? `${MONTH_CODES[Number(iso.slice(5, 7)) - 1]} '${iso.slice(2, 4)}` : '');

function CreateModal({ open, role, presetClass, onClose }) {
  const { classes, subjects, addReschedule } = useStore();
  const empty = { classId: presetClass || '', cancelled: '', replacement: '', reason: 'PH', remarks: '' };
  const [kind, setKind] = useState('replace');
  const [f, setF] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    if (kind === 'replace' && f.cancelled && f.replacement && f.replacement <= f.cancelled) {
      setError('Tarikh ganti mesti selepas tarikh batal.');
      return;
    }
    const extra = kind === 'extra';
    setBusy(true);
    try {
      await addReschedule({
        classId: Number(f.classId),
        cancelled: extra ? null : f.cancelled,
        replacement: f.replacement || null,
        extra,
        reason: extra ? 'EXTRA_SESSION' : f.reason,
        remarks: f.remarks,
        monthLabel: logMonth(f.replacement || f.cancelled),
      });
      setF({ ...empty, classId: '' });
      setError('');
      onClose();
    } catch {
      // the reason has already been shown
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rekod pembatalan / kelas ganti"
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="reschedule-form" variant="primary" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="reschedule-form" onSubmit={submit} className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          items={[
            { value: 'replace', label: 'Batal & ganti' },
            { value: 'extra', label: 'Kelas tambahan' },
          ]}
        />
        <Select label="Kelas" required value={f.classId} onChange={(e) => set({ classId: e.target.value })}>
          <option value="">Pilih kelas…</option>
          {DAYS.map((day) => (
            <optgroup key={day} label={DAY_LABEL[day]}>
              {classes
                .filter((c) => c.day === day)
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c, subjects)} — {timeRange(c.start, c.end)}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          {kind === 'replace' && <Input label="Tarikh batal" type="date" required value={f.cancelled} onChange={(e) => set({ cancelled: e.target.value })} />}
          <Input
            label={kind === 'replace' ? 'Tarikh ganti' : 'Tarikh kelas'}
            hint={kind === 'replace' ? 'Kosongkan jika tiada kelas ganti.' : undefined}
            type="date"
            required={kind === 'extra'}
            min={kind === 'extra' ? todayISO() : undefined}
            value={f.replacement}
            onChange={(e) => set({ replacement: e.target.value })}
          />
        </div>
        {kind === 'replace' && (
          <Select label="Sebab" value={f.reason} onChange={(e) => set({ reason: e.target.value })}>
            {Object.entries(RESCHEDULE_REASON_LABEL)
              .filter(([k]) => k !== 'EXTRA_SESSION')
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </Select>
        )}
        <Textarea label="Catatan" rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="cth. Cuti Hari Raya Aidilfitri" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!can(role, 'reschedules.approve') && <p className="text-[13px] text-gray-500">Rekod akan menunggu kelulusan supervisor sebelum dimaklumkan.</p>}
      </form>
    </Modal>
  );
}

function NoticeModal({ record: r, cls, onClose }) {
  const { subjects, markRescheduleNotified } = useStore();
  const notify = useToast();
  if (!r || !cls) return null;

  const label = classLabel(cls, subjects);
  const message = r.extra
    ? `Assalamualaikum ibu bapa dan pelajar.\n\nMakluman kelas tambahan ${label} pada ${date(r.replacement)}, ${timeRange(cls.start, cls.end)}.${r.remarks ? `\n\n${r.remarks}` : ''}\n\nTerima kasih.\n— ${CENTRE.name} ${CENTRE.branch}`
    : `Assalamualaikum ibu bapa dan pelajar.\n\nKelas ${label} pada ${date(r.cancelled)} dibatalkan (${(RESCHEDULE_REASON_LABEL[r.reason] || 'lain-lain').toLowerCase()}). ${r.replacement ? `Kelas ganti pada ${date(r.replacement)}, ${timeRange(cls.start, cls.end)}.` : 'Tarikh kelas ganti akan dimaklumkan kemudian.'}${r.remarks ? `\n\n${r.remarks}` : ''}\n\nHarap maklum. Terima kasih.\n— ${CENTRE.name} ${CENTRE.branch}`;

  const markSent = () => markRescheduleNotified(r.id).catch(() => {});

  return (
    <Modal
      open
      onClose={onClose}
      title="Notis WhatsApp"
      description={`Hantar ke kumpulan WhatsApp ${label}.`}
      footer={
        <>
          <Button
            icon={Copy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message);
                markSent();
                notify('Mesej disalin. Tampal ke kumpulan WhatsApp kelas.', 'info');
              } catch {
                notify('Tidak dapat menyalin. Sila salin secara manual.', 'error');
              }
            }}
          >
            Salin mesej
          </Button>
          <Button
            as="a"
            variant="primary"
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              markSent();
              onClose();
            }}
          >
            Buka WhatsApp
          </Button>
        </>
      }
    >
      {!r.approved && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Rekod ini belum diluluskan oleh supervisor.</p>}
      <pre className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 font-sans text-sm text-gray-800">{message}</pre>
    </Modal>
  );
}
