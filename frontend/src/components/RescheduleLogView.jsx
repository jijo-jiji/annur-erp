import { useState } from 'react';
import { CalendarClock, Check, Copy, Plus } from 'lucide-react';
import { CENTRE, DAYS } from '../data/demo';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { classLabel } from '../lib/domain';
import { date, DAY_LABEL, RESCHEDULE_REASON_LABEL, timeRange, todayISO } from '../lib/format';
import {
  Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Segmented, Select, Table, Tabs, Td, Textarea, Th, useToast, WhatsAppIcon,
} from './ui';


export default function RescheduleLogView({ role }) {
  const { reschedules, classes, subjects, teachers, updateReschedule } = useStore();
  const notify = useToast();
  const [tab, setTab] = useState('all');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);

  const byId = Object.fromEntries(classes.map((c) => [c.id, c]));
  const pending = reschedules.filter((r) => !r.approved);
  const rows = tab === 'pending' ? pending : reschedules;

  return (
    <>
      <PageHeader
        title="Batal & ganti kelas"
        description="Rekod rasmi pembatalan, kelas ganti dan kelas tambahan, termasuk makluman kepada pelajar."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Rekod baharu
          </Button>
        }
      />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'all', label: 'Semua rekod', count: reschedules.length },
          { value: 'pending', label: 'Menunggu pengesahan', count: pending.length },
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
                <Th className="text-right">Makluman</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = byId[r.classId];
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <Td className="min-w-44">
                      <p className="font-medium text-gray-900">{c ? classLabel(c, subjects) : '—'}</p>
                      <p className="text-[13px] text-gray-500">Cikgu {teachers.find((t) => t.code === c?.teacher)?.name}</p>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.extra ? (
                        <>
                          <p className="text-gray-900">{date(r.replacement)}</p>
                          <Badge tone="blue" className="mt-1">Kelas tambahan</Badge>
                        </>
                      ) : (
                        <>
                          <p className="text-gray-500 line-through decoration-gray-400">{date(r.cancelled)}</p>
                          <p className="text-gray-900">→ {date(r.replacement)}</p>
                        </>
                      )}
                    </Td>
                    <Td className="min-w-40">
                      <p className="text-gray-900">{RESCHEDULE_REASON_LABEL[r.reason]}</p>
                      {r.remarks && <p className="text-[13px] text-gray-500">{r.remarks}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.approved ? (
                        <Badge tone="green">Disahkan</Badge>
                      ) : can(role, 'reschedules.approve') ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            updateReschedule(r.id, { approved: true });
                            notify('Gantian kelas disahkan.');
                          }}
                        >
                          Sahkan
                        </Button>
                      ) : (
                        <Badge tone="amber">Menunggu</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <Button size="sm" onClick={() => setNotice(r)} title={r.notified ? 'Notis telah dihantar' : 'Hantar notis WhatsApp'} className="px-2 xl:px-3">
                        <WhatsAppIcon className="size-3.5" />
                        <span className="hidden xl:inline">{r.notified ? 'Dihantar' : 'Hantar notis'}</span>
                        {r.notified && <Check className="size-3.5 text-brand-600 xl:hidden" aria-label="Dihantar" />}
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <CreateModal open={creating} role={role} onClose={() => setCreating(false)} />
      <NoticeModal record={notice} cls={notice && byId[notice.classId]} onClose={() => setNotice(null)} />
    </>
  );
}

function CreateModal({ open, role, onClose }) {
  const { classes, subjects, addReschedule } = useStore();
  const notify = useToast();
  const [kind, setKind] = useState('replace');
  const [f, setF] = useState({ classId: '', cancelled: '', replacement: '', reason: 'PH', remarks: '' });
  const [error, setError] = useState('');
  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const submit = (e) => {
    e.preventDefault();
    if (kind === 'replace' && f.cancelled && f.replacement <= f.cancelled) {
      setError('Tarikh ganti mesti selepas tarikh batal.');
      return;
    }
    const extra = kind === 'extra';
    addReschedule({
      classId: Number(f.classId),
      month: (f.cancelled || f.replacement).slice(0, 7),
      cancelled: extra ? null : f.cancelled,
      replacement: f.replacement,
      extra,
      reason: extra ? 'EXTRA' : f.reason,
      remarks: f.remarks,
      approved: can(role, 'reschedules.approve'),
      notified: false,
    });
    notify(can(role, 'reschedules.approve') ? 'Rekod disimpan dan disahkan.' : 'Rekod disimpan. Menunggu pengesahan supervisor.');
    setF({ classId: '', cancelled: '', replacement: '', reason: 'PH', remarks: '' });
    setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rekod pembatalan / kelas ganti"
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="reschedule-form" variant="primary">
            Simpan
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
            type="date"
            required
            min={kind === 'extra' ? todayISO() : undefined}
            value={f.replacement}
            onChange={(e) => set({ replacement: e.target.value })}
          />
        </div>
        {kind === 'replace' && (
          <Select label="Sebab" value={f.reason} onChange={(e) => set({ reason: e.target.value })}>
            {Object.entries(RESCHEDULE_REASON_LABEL)
              .filter(([k]) => k !== 'EXTRA')
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </Select>
        )}
        <Textarea label="Catatan" rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="cth. Cuti Hari Raya Aidilfitri" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!can(role, 'reschedules.approve') && <p className="text-[13px] text-gray-500">Rekod akan menunggu pengesahan supervisor sebelum dimaklumkan.</p>}
      </form>
    </Modal>
  );
}

function NoticeModal({ record: r, cls, onClose }) {
  const { subjects, updateReschedule } = useStore();
  const notify = useToast();
  if (!r || !cls) return null;

  const label = classLabel(cls, subjects);
  const message = r.extra
    ? `Assalamualaikum ibu bapa dan pelajar.\n\nMakluman kelas tambahan ${label} pada ${date(r.replacement)}, ${timeRange(cls.start, cls.end)}.${r.remarks ? `\n\n${r.remarks}` : ''}\n\nTerima kasih.\n— ${CENTRE.name} ${CENTRE.branch}`
    : `Assalamualaikum ibu bapa dan pelajar.\n\nKelas ${label} pada ${date(r.cancelled)} dibatalkan (${RESCHEDULE_REASON_LABEL[r.reason].toLowerCase()}). Kelas ganti pada ${date(r.replacement)}, ${timeRange(cls.start, cls.end)}.\n\nHarap maklum. Terima kasih.\n— ${CENTRE.name} ${CENTRE.branch}`;

  const markSent = () => updateReschedule(r.id, { notified: true });

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
                notify('Mesej disalin.', 'info');
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
      {!r.approved && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Rekod ini belum disahkan oleh supervisor.</p>}
      <pre className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 font-sans text-sm text-gray-800">{message}</pre>
    </Modal>
  );
}
