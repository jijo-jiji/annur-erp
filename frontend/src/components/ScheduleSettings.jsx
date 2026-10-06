import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { academicApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { useStore } from '../store';
import { DAYS } from '../lib/config';
import { DAY_LABEL, date, dateLong } from '../lib/format';
import ChangeRequestsPanel, { useChangeRequests } from './ChangeRequestsPanel';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, Table, Td, Th, useToast } from './ui';

const REASON = { name: 'note', label: 'Sebab permohonan', type: 'textarea', required: true, hint: 'Pengurusan akan melihat sebab ini semasa membuat keputusan.' };
const DAY_OPTIONS = DAYS.map((d) => ({ value: d, label: DAY_LABEL[d] }));

const slotFields = [
  { name: 'day', label: 'Hari', type: 'select', required: true, options: DAY_OPTIONS },
  { name: 'start_time', label: 'Masa mula', type: 'time', required: true },
  { name: 'end_time', label: 'Masa tamat', type: 'time', required: true, hint: 'Nama slot (cth. Petang 4.00 - 5.30) dijana daripada masa.' },
];
const roomFields = [
  { name: 'name', label: 'Nama bilik', required: true, placeholder: 'cth. Bilik Ibnu Sina' },
  { name: 'capacity', label: 'Muatan (pelajar)', type: 'number', min: '1', max: '500', required: true },
];
const closedFields = (adding) => [
  ...(adding ? [{ name: 'date', label: 'Tarikh', type: 'date', required: true }] : []),
  { name: 'reason', label: 'Sebab tutup', required: true, placeholder: 'cth. Hari Raya Aidilfitri, cuti peristiwa' },
];

const KIND_TEXT = { TIME_SLOT: 'slot masa', CLASSROOM: 'bilik darjah', CLOSED_DATE: 'tarikh tutup' };

// When classes can be held (slots), where (rooms) and the days the centre is closed.
// Supervisor asks and Management approves; Management's own changes apply at once.
// The days the centre opens are simply the days that have a slot.
export default function ScheduleSettings({ role }) {
  const { timeSlots, classrooms, classes, submitChangeRequest } = useStore();
  const { refreshAllData } = useApp();
  const notify = useToast();
  const direct = role === 'MANAGEMENT';
  const slotRequests = useChangeRequests('TIME_SLOT');
  const roomRequests = useChangeRequests('CLASSROOM');
  const closedRequests = useChangeRequests('CLOSED_DATE');
  const [closedDates, setClosedDates] = useState([]);
  const [dialog, setDialog] = useState(null); // { kind, type: 'add' | 'edit' | 'remove' | 'active', item }

  const loadClosed = useCallback(() => academicApi.getClosedDates().then(setClosedDates).catch(() => setClosedDates([])), []);
  useEffect(() => { loadClosed(); }, [loadClosed]);

  const requests = [...slotRequests.requests, ...roomRequests.requests, ...closedRequests.requests]
    .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)));
  const reload = () => Promise.all([slotRequests.load(), roomRequests.load(), closedRequests.load(), loadClosed()]);
  const onApplied = () => Promise.all([refreshAllData(), loadClosed()]);
  const waiting = (list) => new Set(list.filter((r) => r.status === 'PENDING' && r.target_id).map((r) => r.target_id));
  const slotWaiting = waiting(slotRequests.requests);
  const roomWaiting = waiting(roomRequests.requests);
  const closedWaiting = waiting(closedRequests.requests);
  const reasonIfAsking = direct ? [] : [REASON];

  const send = async (kind, action, pk, values, note) => {
    const done = await submitChangeRequest({ kind, action, pk, values, note });
    notify(done.status === 'PENDING' ? 'Permohonan dihantar. Ia berkuat kuasa selepas diluluskan oleh Pengurusan.' : 'Perubahan disimpan.');
    await Promise.all([reload(), refreshAllData()]);
  };

  const slots = [...timeSlots].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start_time.localeCompare(b.start_time));
  const slotUse = (id) => classes.filter((c) => c.slotPk === id).length;
  const roomUse = (id) => classes.filter((c) => c.roomPk === id).length;
  const today = new Date().toISOString().slice(0, 10);
  const closed = [...closedDates].sort((a, b) => (a.date >= today) === (b.date >= today) ? (a.date >= today ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) : (a.date >= today ? -1 : 1));

  const find = (r) => (r.kind === 'TIME_SLOT' ? timeSlots.find((s) => s.id === r.target_id) : r.kind === 'CLASSROOM' ? classrooms.find((c) => c.id === r.target_id) : closedDates.find((c) => c.id === r.target_id));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Slot masa"
          description="Hari dan masa kelas boleh diadakan. Hari pusat dibuka ialah hari yang mempunyai slot. Slot yang digunakan oleh kelas dinyahaktifkan, bukan dipadam."
          actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ kind: 'TIME_SLOT', type: 'add' })}>{direct ? 'Tambah slot' : 'Mohon slot baharu'}</Button>}
        />
        {slots.length === 0 ? <EmptyState title="Belum ada slot" /> : (
          <Table>
            <thead><tr><Th>Hari</Th><Th>Masa</Th><Th className="hidden sm:table-cell">Nama</Th><Th className="text-right">Kelas</Th><Th>Status</Th><Th className="text-right"><span className="sr-only">Tindakan</span></Th></tr></thead>
            <tbody>
              {slots.map((s) => {
                const isWaiting = slotWaiting.has(s.id);
                return (
                  <tr key={s.id} className={s.is_active === false ? 'text-gray-400' : ''}>
                    <Td className="font-medium">{DAY_LABEL[s.day]}</Td>
                    <Td className="tnum">{s.start_time} – {s.end_time}</Td>
                    <Td className="hidden sm:table-cell">{s.period_label}</Td>
                    <Td className="text-right tnum">{slotUse(s.id)}</Td>
                    <Td>{isWaiting ? <Badge tone="amber">Menunggu kelulusan</Badge> : s.is_active === false ? <Badge>Tidak aktif</Badge> : <Badge tone="green">Aktif</Badge>}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" disabled={isWaiting} onClick={() => setDialog({ kind: 'TIME_SLOT', type: 'edit', item: s })}>Ubah</Button>
                        <Button size="sm" variant="ghost" disabled={isWaiting} onClick={() => setDialog({ kind: 'TIME_SLOT', type: 'active', item: s })}>{s.is_active === false ? 'Aktifkan' : 'Nyahaktif'}</Button>
                        {slotUse(s.id) === 0 && <Button size="sm" variant="ghost" disabled={isWaiting} onClick={() => setDialog({ kind: 'TIME_SLOT', type: 'remove', item: s })}>Padam</Button>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Bilik darjah"
          description="Bilik yang boleh diberikan kepada kelas."
          actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ kind: 'CLASSROOM', type: 'add' })}>{direct ? 'Tambah bilik' : 'Mohon bilik baharu'}</Button>}
        />
        {classrooms.length === 0 ? <EmptyState title="Belum ada bilik" /> : (
          <Table>
            <thead><tr><Th>Bilik</Th><Th className="text-right">Muatan</Th><Th className="text-right">Kelas</Th><Th>Status</Th><Th className="text-right"><span className="sr-only">Tindakan</span></Th></tr></thead>
            <tbody>
              {classrooms.map((r) => {
                const isWaiting = roomWaiting.has(r.id);
                return (
                  <tr key={r.id} className={r.is_active === false ? 'text-gray-400' : ''}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="text-right tnum">{r.capacity}</Td>
                    <Td className="text-right tnum">{roomUse(r.id)}</Td>
                    <Td>{isWaiting ? <Badge tone="amber">Menunggu kelulusan</Badge> : r.is_active === false ? <Badge>Tidak aktif</Badge> : <Badge tone="green">Aktif</Badge>}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" disabled={isWaiting} onClick={() => setDialog({ kind: 'CLASSROOM', type: 'edit', item: r })}>Ubah</Button>
                        <Button size="sm" variant="ghost" disabled={isWaiting} onClick={() => setDialog({ kind: 'CLASSROOM', type: 'active', item: r })}>{r.is_active === false ? 'Aktifkan' : 'Nyahaktif'}</Button>
                        {roomUse(r.id) === 0 && <Button size="sm" variant="ghost" disabled={isWaiting} onClick={() => setDialog({ kind: 'CLASSROOM', type: 'remove', item: r })}>Padam</Button>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Tarikh pusat tutup"
          description="Cuti umum, cuti negeri dan hari pusat tidak beroperasi. Pada tarikh ini tiada kehadiran pelajar dan guru direkod, dan tiada bayaran guru dikira."
          actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ kind: 'CLOSED_DATE', type: 'add' })}>{direct ? 'Tandakan tutup' : 'Mohon tarikh tutup'}</Button>}
        />
        {closed.length === 0 ? <EmptyState title="Tiada tarikh tutup" description="Tambah cuti umum dan cuti Kelantan supaya kehadiran dan bayaran guru tidak dikira pada hari itu." /> : (
          <Table>
            <thead><tr><Th>Tarikh</Th><Th>Sebab</Th><Th className="text-right"><span className="sr-only">Tindakan</span></Th></tr></thead>
            <tbody>
              {closed.map((c) => {
                const isWaiting = closedWaiting.has(c.id);
                return (
                  <tr key={c.id} className={c.date < today ? 'text-gray-400' : ''}>
                    <Td className="whitespace-nowrap font-medium">{dateLong(c.date)}</Td>
                    <Td>{c.reason}{isWaiting && <Badge tone="amber" className="ml-2">Menunggu kelulusan</Badge>}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" disabled={isWaiting} onClick={() => setDialog({ kind: 'CLOSED_DATE', type: 'edit', item: c })}>Ubah sebab</Button>
                        <Button size="sm" variant="ghost" disabled={isWaiting} onClick={() => setDialog({ kind: 'CLOSED_DATE', type: 'remove', item: c })}>Buka semula</Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ChangeRequestsPanel
        title="Permohonan perubahan jadual"
        description={direct ? 'Permohonan Supervisor menunggu kelulusan anda. Perubahan Pengurusan terus berkuat kuasa dan direkod di sini.' : 'Perubahan anda berkuat kuasa selepas diluluskan oleh Pengurusan.'}
        requests={requests}
        reload={reload}
        onApplied={onApplied}
        editFields={(r) => (r.action === 'DELETE' ? [] : r.kind === 'TIME_SLOT' ? slotFields : r.kind === 'CLASSROOM' ? roomFields : closedFields(r.action === 'CREATE'))}
        editInitial={(r) => {
          const current = find(r) || {};
          return { ...current, ...r.payload };
        }}
      />

      {dialog && dialog.type === 'add' && (
        <FormModal
          title={`${direct ? 'Tambah' : 'Mohon'} ${KIND_TEXT[dialog.kind]}`}
          submitLabel={direct ? 'Tambah' : 'Hantar permohonan'}
          initial={dialog.kind === 'TIME_SLOT' ? { day: 'SABTU', start_time: '', end_time: '', note: '' } : dialog.kind === 'CLASSROOM' ? { name: '', capacity: 20, note: '' } : { date: '', reason: '', note: '' }}
          fields={[...(dialog.kind === 'TIME_SLOT' ? slotFields : dialog.kind === 'CLASSROOM' ? roomFields : closedFields(true)), ...reasonIfAsking]}
          onSubmit={({ note, ...v }) => send(dialog.kind, 'CREATE', null, dialog.kind === 'CLASSROOM' ? { ...v, capacity: Number(v.capacity) } : v, note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && dialog.type === 'edit' && (
        <FormModal
          title={`Ubah ${KIND_TEXT[dialog.kind]}`}
          description={dialog.kind === 'TIME_SLOT' ? 'Kelas yang menggunakan slot ini mengikut masa baharu.' : undefined}
          submitLabel={direct ? 'Simpan' : 'Hantar permohonan'}
          initial={{ ...dialog.item, note: '' }}
          fields={[...(dialog.kind === 'TIME_SLOT' ? slotFields : dialog.kind === 'CLASSROOM' ? roomFields : closedFields(false)), ...reasonIfAsking]}
          onSubmit={({ note, ...v }) => {
            const values = dialog.kind === 'TIME_SLOT' ? { day: v.day, start_time: v.start_time, end_time: v.end_time }
              : dialog.kind === 'CLASSROOM' ? { name: v.name, capacity: Number(v.capacity) } : { reason: v.reason };
            return send(dialog.kind, 'UPDATE', dialog.item.id, values, note);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && dialog.type === 'active' && (
        <FormModal
          title={`${dialog.item.is_active === false ? 'Aktifkan' : 'Nyahaktifkan'} ${KIND_TEXT[dialog.kind]}`}
          description={dialog.item.is_active === false ? 'Boleh dipilih semula untuk kelas baharu.' : 'Tidak lagi boleh dipilih untuk kelas baharu. Kelas sedia ada kekal.'}
          submitLabel={direct ? 'Teruskan' : 'Hantar permohonan'}
          fields={reasonIfAsking}
          onSubmit={({ note }) => send(dialog.kind, 'UPDATE', dialog.item.id, { is_active: dialog.item.is_active === false }, note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && dialog.type === 'remove' && (
        <FormModal
          title={dialog.kind === 'CLOSED_DATE' ? `Buka semula ${date(dialog.item.date)}` : `Padam ${KIND_TEXT[dialog.kind]}`}
          description={dialog.kind === 'CLOSED_DATE' ? 'Pusat dibuka pada tarikh ini dan kehadiran boleh direkod semula.' : 'Hanya boleh dipadam jika tiada kelas menggunakannya.'}
          danger
          submitLabel={dialog.kind === 'CLOSED_DATE' ? 'Buka semula' : 'Padam'}
          fields={reasonIfAsking}
          onSubmit={({ note }) => send(dialog.kind, 'DELETE', dialog.item.id, null, note)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
