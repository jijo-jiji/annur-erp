import { THRESHOLDS } from '../lib/thresholds';
import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, ListChecks, Plus, Printer, Trash2, UploadCloud } from 'lucide-react';
import { academicApi, filesApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { useStore } from '../store';
import { classLabel } from '../lib/domain';
import { clock, date, DAY_LABEL, FORMS, timeRange, todayISO } from '../lib/format';
import { ACCEPT, openAttachment, uploadError } from './Attachments';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, Input, Modal, PageHeader, Select, Stat, Table, Td, Textarea, Th, useToast } from './ui';

const selectClass = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-600 focus:outline-none';

// Handouts and notes for each class (Phase G): each belongs to a real class and the date of the class it is handed out
// in; copies start from the class's students, and who has a copy comes from that class's attendance plus copies given
// later at the counter (backend academic/handouts.py).
export default function HandoutRepositoryView({ role }) {
  const { handouts, recordPrint, refreshAllData, reloadHandouts } = useApp();
  const notify = useToast();
  const canDelete = role === 'SUPERVISOR' || role === 'MANAGEMENT';
  const [form, setForm] = useState('ALL');
  const [subject, setSubject] = useState('ALL');
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [received, setReceived] = useState(null); // the handout whose received list is open

  useEffect(() => { reloadHandouts(); }, [reloadHandouts]); // attendance taken since the app opened changes the tallies

  const subjectNames = [...new Set(handouts.map((h) => h.subject_name).filter(Boolean))].sort();
  const rows = handouts.filter((h) => (form === 'ALL' || h.form_level === form) && (subject === 'ALL' || h.subject_name === subject)
    && (!onlyWaiting || h.tally?.waiting > 0));
  const count = (status) => handouts.filter((h) => h.status === status).length;
  const waiting = handouts.reduce((a, h) => a + (h.tally?.waiting || 0), 0);

  // Attach the file to a handout recorded without one
  const attachFile = async (h, file) => {
    if (!file) return;
    try {
      await filesApi.upload('HANDOUT', h.id, file);
      await refreshAllData();
      notify(`Fail untuk "${h.title}" dimuat naik.`);
    } catch (err) {
      notify(uploadError(err), 'error');
    }
  };

  const remove = async (h) => {
    if (!window.confirm(`Padam rekod "${h.title}"?`)) return;
    try {
      await academicApi.deleteHandout(h.id);
      await refreshAllData();
      notify(`Rekod "${h.title}" dipadam.`, 'info');
    } catch (err) {
      notify(err.message || 'Gagal memadam.', 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Nota & modul"
        description="Bahan kelas mengikut tarikh dan kelas, serta cetakan di kaunter."
        actions={<Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Rekod handout</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Jumlah modul" value={handouts.length} />
        <Stat label="Siap dicetak" value={count('PRINT_READY')} />
        <Stat label="Perlu dicetak" value={count('NEEDS_PRINTING')} tone={count('NEEDS_PRINTING') ? 'red' : undefined} />
        <Stat label="Pelajar belum terima" value={waiting} hint="Tidak hadir pada kelas itu dan belum diberi salinan" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={form} onChange={(e) => setForm(e.target.value)} aria-label="Tapis tingkatan" className={selectClass}>
          <option value="ALL">Semua tingkatan</option>
          {FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Tapis subjek" className={selectClass}>
          <option value="ALL">Semua subjek</option>
          {subjectNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={onlyWaiting ? 'WAITING' : 'ALL'} onChange={(e) => setOnlyWaiting(e.target.value === 'WAITING')} aria-label="Tapis penerimaan" className={selectClass}>
          <option value="ALL">Semua penerimaan</option>
          <option value="WAITING">Ada pelajar belum terima</option>
        </select>
        <span className="ml-auto text-sm text-gray-500">{rows.length} modul</span>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="Tiada modul ditemui" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Modul</Th>
                <Th className="hidden 2xl:table-cell">Guru</Th>
                <Th className="hidden xl:table-cell">Fail</Th>
                <Th>Cetakan</Th>
                <Th>Penerimaan</Th>
                <Th className="w-0"><span className="sr-only">Tindakan</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="align-top hover:bg-gray-50">
                  <Td className="min-w-64">
                    <p className="font-medium text-gray-900">{h.title}</p>
                    <p className="text-[13px] text-gray-500">{h.class_code} · {h.class_date ? `kelas ${date(h.class_date)}` : `direkod ${date(h.upload_date)}`}</p>
                    {h.description && <p className="mt-0.5 text-[13px] text-gray-600">{h.description}</p>}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-gray-700 2xl:table-cell">{h.teacher_name || '—'}</Td>
                  <Td className="hidden text-gray-700 xl:table-cell">
                    {h.file ? <>{h.file.original_name}<span className="block text-[13px] text-gray-500">{h.file_size}</span></> : <span className="text-gray-400">Tiada fail</span>}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {h.status === 'PRINT_READY' ? <Badge tone="green">Siap dicetak</Badge> : <Badge tone="amber">Perlu dicetak</Badge>}
                    <p className="mt-1 text-[13px] text-gray-500 tnum">{h.copies_printed || 0}/{h.copies_needed} salinan</p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {h.tally ? (
                      <button type="button" onClick={() => setReceived(h)} title="Senarai terima" className="group flex items-start gap-1.5 text-left">
                        <ListChecks className="mt-0.5 size-4 text-gray-400 group-hover:text-brand-700" />
                        <span>
                        <span className="block text-sm font-medium text-brand-700 tnum group-hover:underline">{h.tally.received}/{h.tally.students} terima</span>
                        {h.tally.waiting > 0 ? <span className="text-[13px] text-red-700 tnum">{h.tally.waiting} belum</span>
                          : h.tally.pending > 0 ? <span className="text-[13px] text-gray-500">Menunggu kedatangan</span> : <span className="text-[13px] text-gray-500">Lengkap</span>}
                        </span>
                      </button>
                    ) : <span className="text-[13px] text-gray-400">Tiada kelas</span>}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {h.file ? (
                        <Button size="sm" icon={Download} onClick={() => openAttachment(h.file).catch((err) => notify(err.message, 'error'))}>Fail</Button>
                      ) : (
                        <Button as="label" size="sm" icon={UploadCloud} className="cursor-pointer">
                          Muat naik
                          <input type="file" accept={ACCEPT.HANDOUT} className="hidden" onChange={(e) => attachFile(h, e.target.files?.[0])} />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        icon={Printer}
                        title="Rekod cetakan mengikut bilangan salinan diperlukan"
                        onClick={() => recordPrint(h.id, Number(h.copies_needed)).catch(() => {})}
                      >
                        Rekod cetak
                      </Button>
                      {canDelete && <IconButton label="Padam" icon={Trash2} onClick={() => remove(h)} />}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {adding && <AddModal onClose={() => setAdding(false)} />}
      {received && <ReceivedModal handout={received} onClose={() => setReceived(null)} />}
    </>
  );
}

const STATE = {
  IN_CLASS: { label: 'Terima di kelas', tone: 'green' },
  GIVEN: { label: 'Diberi kemudian', tone: 'blue' },
  WAITING: { label: 'Belum terima', tone: 'red' },
  PENDING: { label: 'Menunggu kedatangan', tone: 'neutral' }, // the class not held, or its attendance not taken, yet
};
const NEEDS_COPY = ['WAITING', 'PENDING'];

// Every student of the handout's class: who got it in class (present that day), who was given a copy later, and who
// still needs one, with a button to record a copy given at the counter.
export function ReceivedModal({ handout, onClose }) {
  const { reloadHandout } = useApp();
  const notify = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    academicApi.handoutRecipients(handout.id).then(setData).catch((err) => notify(err.message, 'error'));
  }, [handout.id, notify]);

  const give = async (row, given) => {
    setBusy(row.student);
    try {
      setData(await academicApi.giveHandout(handout.id, row.student, given));
      reloadHandout(handout.id);
    } catch (err) {
      notify(err?.data?.student || err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const waiting = data?.students.filter((r) => NEEDS_COPY.includes(r.state)).length ?? 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Senarai terima: ${handout.title}`}
      description={`${handout.class_code}${handout.class_date ? ` · kelas ${date(handout.class_date)}` : ''}. ${data?.session_date ? `Pelajar yang hadir pada ${date(data.session_date)} sudah menerima di kelas.` : 'Kedatangan kelas ini belum diambil; pelajar yang hadir akan dikira menerima di kelas.'}`}
      footer={<Button onClick={onClose}>Tutup</Button>}
    >
      {!data ? <p className="py-6 text-center text-sm text-gray-500">Memuatkan…</p> : data.students.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Tiada pelajar aktif dalam kelas ini.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">{data.students.length - waiting}/{data.students.length} sudah menerima{waiting ? `, ${waiting} belum` : ''}.</p>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {data.students.map((r) => (
              <li key={r.student} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">
                    <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>{' '}
                    {r.state === 'GIVEN' ? `${date(String(r.given_at).slice(0, 10))} ${clock(r.given_at)} · ${r.given_by}` : r.why}
                  </p>
                </div>
                {NEEDS_COPY.includes(r.state) && <Button size="sm" disabled={busy !== null} onClick={() => give(r, true)}>Tandakan diterima</Button>}
                {r.state === 'GIVEN' && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => give(r, false)}>Batal</Button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

function AddModal({ onClose }) {
  const { createHandout, refreshAllData } = useApp();
  const { classes, students, subjects, days: DAYS } = useStore();
  const notify = useToast();
  const [f, setF] = useState({ title: '', classId: '', date: todayISO(), copies: 20, description: '', file: null });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  // one copy for each active student of the class (students on hold are not attending)
  const activeIn = (classId) => students.filter((s) => s.status === 'ACTIVE' && s.classes.includes(classId)).length;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // the class's name, subject, form and teacher are filled in by the server from the class itself
      const created = await createHandout({
        title: f.title,
        timetable_class: Number(f.classId),
        class_date: f.date,
        copies_needed: Number(f.copies),
        description: f.description,
        status: 'NEEDS_PRINTING',
      });
      if (f.file) {
        try {
          await filesApi.upload('HANDOUT', created.id, f.file);
        } catch (err) {
          notify(`Rekod disimpan tetapi fail gagal dimuat naik: ${uploadError(err)}`, 'error');
        }
        await refreshAllData();
      }
      onClose();
    } catch {
      setBusy(false); // the reason has already been shown
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Rekod handout kelas"
      description="Kelas dan tarikh kelas handout ini diberi. Pelajar yang hadir pada kelas itu dikira sudah menerima."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="handout-form" variant="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </>
      }
    >
      <form id="handout-form" onSubmit={submit} className="space-y-4">
        <Input label="Tajuk modul / nota" required value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="cth. Latihan format SPM: Bab 3" />
        <Select
          label="Kelas"
          required
          value={f.classId}
          onChange={(e) => set({ classId: e.target.value, copies: activeIn(Number(e.target.value)) || f.copies })}
        >
          <option value="">Pilih kelas…</option>
          {DAYS.map((day) => (
            <optgroup key={day} label={DAY_LABEL[day]}>
              {classes.filter((c) => c.day === day).sort((a, b) => a.start.localeCompare(b.start)).map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c, subjects)} · {timeRange(c.start, c.end)} ({activeIn(c.id)} pelajar)</option>
              ))}
            </optgroup>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tarikh kelas" type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} />
          <Input label="Bilangan salinan" type="number" required min="1" max="200" value={f.copies} onChange={(e) => set({ copies: e.target.value })}
            hint={f.classId ? `${activeIn(Number(f.classId))} pelajar aktif dalam kelas; tambah jika perlu salinan lebihan.` : 'Ikut bilangan pelajar aktif kelas.'} />
        </div>
        <Textarea label="Penerangan / topik" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        <Input
          label="Fail handout"
          hint={`PDF, Word, PowerPoint atau gambar; maksimum ${THRESHOLDS.upload_handout_mb} MB. Boleh dimuat naik kemudian.`}
          type="file"
          accept={ACCEPT.HANDOUT}
          onChange={(e) => set({ file: e.target.files?.[0] || null })}
        />
      </form>
    </Modal>
  );
}

// On a student's profile (Kelas tab): the handouts of the student's classes and whether the student has each one, so
// the counter can hand over what an absent student missed.
export function StudentHandouts({ student }) {
  const notify = useToast();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => academicApi.handoutsForStudent(student).then(setRows).catch(() => setRows([])), [student]);
  useEffect(() => { load(); }, [load]);

  const give = async (h, given) => {
    setBusy(h.id);
    try {
      await academicApi.giveHandout(h.id, student, given);
      await load();
      if (given) notify(`"${h.title}" ditanda sudah diterima.`);
    } catch (err) {
      notify(err?.data?.student || err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!rows || rows.length === 0) return null;
  const waiting = rows.filter((h) => h.state === 'WAITING').length;
  const pending = rows.filter((h) => h.state === 'PENDING').length;
  const summary = [waiting && `${waiting} belum diterima`, pending && `${pending} menunggu kedatangan kelas`].filter(Boolean).join(', ');
  return (
    <Card>
      <CardHeader title="Nota & modul" description={summary ? `${summary}. Pelajar yang hadir pada kelas itu dikira sudah menerima.` : 'Semua sudah diterima.'} />
      <ul className="divide-y divide-gray-100">
        {rows.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{h.title}</p>
              <p className="text-[13px] text-gray-500">
                {h.class_code}{h.class_date ? ` · kelas ${date(h.class_date)}` : ''} · <Badge tone={STATE[h.state].tone}>{STATE[h.state].label}</Badge>{' '}
                {h.state === 'GIVEN' ? `${date(String(h.given_at).slice(0, 10))} · ${h.given_by}` : h.why}
              </p>
            </div>
            {NEEDS_COPY.includes(h.state) && <Button size="sm" disabled={busy !== null} onClick={() => give(h, true)}>Tandakan diterima</Button>}
            {h.state === 'GIVEN' && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => give(h, false)}>Batal</Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
