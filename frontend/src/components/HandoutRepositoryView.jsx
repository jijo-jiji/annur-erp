import { useState } from 'react';
import { Download, FileText, Plus, Printer, Trash2, UploadCloud } from 'lucide-react';
import { academicApi, filesApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { useStore } from '../store';
import { classLabel } from '../lib/domain';
import { date, DAY_LABEL, FORMS, timeRange, todayISO } from '../lib/format';
import { ACCEPT, openAttachment, uploadError } from './Attachments';
import { Badge, Button, Card, EmptyState, IconButton, Input, Modal, PageHeader, Select, Stat, Table, Td, Textarea, Th, useToast } from './ui';

const selectClass = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-600 focus:outline-none';

// Handouts and notes for each class: the file itself, how many copies are needed and what has been printed
export default function HandoutRepositoryView({ role }) {
  const { handouts, recordPrint, refreshAllData } = useApp();
  const notify = useToast();
  const canDelete = role === 'SUPERVISOR' || role === 'MANAGEMENT';
  const [form, setForm] = useState('ALL');
  const [subject, setSubject] = useState('ALL');
  const [adding, setAdding] = useState(false);

  const subjectNames = [...new Set(handouts.map((h) => h.subject_name).filter(Boolean))].sort();
  const rows = handouts.filter((h) => (form === 'ALL' || h.form_level === form) && (subject === 'ALL' || h.subject_name === subject));
  const count = (status) => handouts.filter((h) => h.status === status).length;

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
        <Stat label="Salinan dicetak" value={handouts.reduce((a, h) => a + (h.copies_printed || 0), 0)} />
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
                <Th className="hidden lg:table-cell">Guru</Th>
                <Th className="hidden md:table-cell">Fail</Th>
                <Th>Cetakan</Th>
                <Th className="w-0"><span className="sr-only">Tindakan</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="align-top hover:bg-gray-50">
                  <Td className="min-w-64">
                    <p className="font-medium text-gray-900">{h.title}</p>
                    <p className="text-[13px] text-gray-500">{h.class_code} · {date(h.upload_date)}</p>
                    {h.description && <p className="mt-0.5 text-[13px] text-gray-600">{h.description}</p>}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-gray-700 lg:table-cell">{h.teacher_name || '—'}</Td>
                  <Td className="hidden text-gray-700 md:table-cell">
                    {h.file ? <>{h.file.original_name}<span className="block text-[13px] text-gray-500">{h.file_size}</span></> : <span className="text-gray-400">Tiada fail</span>}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {h.status === 'PRINT_READY' ? <Badge tone="green">Siap dicetak</Badge> : <Badge tone="amber">Perlu dicetak</Badge>}
                    <p className="mt-1 text-[13px] text-gray-500 tnum">{h.copies_printed || 0}/{h.copies_needed} salinan</p>
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
    </>
  );
}

function AddModal({ onClose }) {
  const { createHandout, refreshAllData, timetable } = useApp();
  const { classes, subjects, days: DAYS } = useStore();
  const notify = useToast();
  const [f, setF] = useState({ title: '', classId: '', date: todayISO(), copies: 20, description: '', file: null });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    const cls = timetable.find((c) => c.id === Number(f.classId));
    setBusy(true);
    try {
      const created = await createHandout({
        title: f.title,
        form_level: cls.form_level,
        subject_name: cls.subject_details?.name || '',
        class_code: cls.class_code,
        teacher_name: cls.teacher_details?.full_name || '',
        copies_needed: Number(f.copies),
        // The description carries the class date the handout is for
        description: [`Untuk kelas ${date(f.date)}`, f.description].filter(Boolean).join('. '),
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
      description="Tarikh dan kelas handout, untuk cetakan kaunter."
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
          onChange={(e) => {
            const c = classes.find((x) => x.id === Number(e.target.value));
            set({ classId: e.target.value, copies: c?.enrolled || f.copies });
          }}
        >
          <option value="">Pilih kelas…</option>
          {DAYS.map((day) => (
            <optgroup key={day} label={DAY_LABEL[day]}>
              {classes.filter((c) => c.day === day).sort((a, b) => a.start.localeCompare(b.start)).map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c, subjects)} · {timeRange(c.start, c.end)} ({c.enrolled} pelajar)</option>
              ))}
            </optgroup>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tarikh kelas" type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} />
          <Input label="Bilangan salinan" type="number" required min="1" max="200" value={f.copies} onChange={(e) => set({ copies: e.target.value })} />
        </div>
        <Textarea label="Penerangan / topik" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        <Input
          label="Fail handout"
          hint="PDF, Word, PowerPoint atau gambar; maksimum 25 MB. Boleh dimuat naik kemudian."
          type="file"
          accept={ACCEPT.HANDOUT}
          onChange={(e) => set({ file: e.target.files?.[0] || null })}
        />
      </form>
    </Modal>
  );
}
