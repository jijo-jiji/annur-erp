import { THRESHOLDS } from '../lib/thresholds';
import { useCallback, useEffect, useState } from 'react';
import { MessageSquareQuote, Plus, Trash2 } from 'lucide-react';
import { filesApi, studentsApi } from '../api/client';
import { date, FORMS, formLabel, todayISO } from '../lib/format';
import { ACCEPT, openAttachment, Thumb, uploadError } from './Attachments';
import { Button, Card, Checkbox, cx, EmptyState, filterClass, IconButton, Input, Select, Textarea, useToast } from './ui';

const GIVEN_BY = [{ id: 'PARENT', label: 'Ibu bapa' }, { id: 'STUDENT', label: 'Pelajar' }];

function FeedbackCard({ fb, canDelete, onDelete, showStudent }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          {showStudent && (
            <a href={`#/students/${fb.student_code ?? ''}`} className={cx('font-medium text-gray-900', fb.student_code && 'hover:underline')}>
              {fb.student_name} <span className="font-normal text-gray-400">· {formLabel(fb.form_level)}</span>
            </a>
          )}
          <p className="text-xs text-gray-500">{date(fb.date)} · {fb.given_by_label} · direkod oleh {fb.recorded_by}</p>
        </div>
        {canDelete && <IconButton label="Padam maklum balas" icon={Trash2} onClick={() => onDelete(fb)} className="-mr-1 -mt-1" />}
      </div>
      <p className="mt-2 whitespace-pre-line text-gray-700">{fb.description}</p>
      {fb.media.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {fb.media.map((m) => <button key={m.id} type="button" onClick={() => openAttachment(m)}><Thumb att={m} large /></button>)}
        </div>
      )}
    </div>
  );
}

function useRemove(reload) {
  const notify = useToast();
  return async (fb) => {
    if (!window.confirm('Padam maklum balas ini bersama gambar dan videonya?')) return;
    try {
      await studentsApi.deleteFeedback(fb.id);
      notify('Maklum balas dipadam.', 'info');
      reload();
    } catch (err) {
      notify(uploadError(err), 'error');
    }
  };
}

// Feedback section in the student profile: record feedback with photos / videos
export function StudentFeedbackPanel({ studentId, canDelete, onChanged }) {
  const notify = useToast();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    studentsApi.feedback({ student: studentId }).then(setRows).catch(() => setRows([]));
  }, [studentId]);
  useEffect(() => { load(); }, [load]);
  const remove = useRemove(load);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fb = await studentsApi.addFeedback({ student: studentId, date: form.date, given_by: form.given_by, description: form.description });
      for (const file of form.files) {
        try {
          await filesApi.upload('FEEDBACK', fb.id, file);
        } catch (err) {
          notify(`${file.name}: ${uploadError(err)}`, 'error');
        }
      }
      notify('Maklum balas direkodkan.');
      setForm(null);
      load();
      onChanged?.();
    } catch (err) {
      notify(uploadError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">Maklum balas ibu bapa / pelajar ({rows.length})</h3>
        {!form && <Button size="sm" icon={Plus} onClick={() => setForm({ date: todayISO(), given_by: 'PARENT', description: '', files: [] })}>Maklum balas</Button>}
      </div>
      {form && (
        <form onSubmit={submit} className="mb-3 space-y-3 rounded-md bg-gray-50 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Daripada" value={form.given_by} onChange={(e) => setForm({ ...form, given_by: e.target.value })}>
              {GIVEN_BY.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </Select>
            <Input label="Tarikh" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <Textarea label="Maklum balas" required rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Gambar / video" hint={`Pilihan. Maksimum ${THRESHOLDS.upload_feedback_mb} MB setiap fail.`} type="file" multiple accept={ACCEPT.FEEDBACK} onChange={(e) => setForm({ ...form, files: [...e.target.files] })} />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setForm(null)}>Batal</Button>
            <Button size="sm" type="submit" variant="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      )}
      {rows.length === 0 ? <p className="text-sm text-gray-500">Tiada maklum balas.</p> : (
        <div className="space-y-2">
          {rows.map((fb) => <FeedbackCard key={fb.id} fb={fb} canDelete={canDelete} onDelete={remove} />)}
        </div>
      )}
    </section>
  );
}

// Gallery of feedback across students, filtered by grade and date
export function FeedbackGallery({ canDelete }) {
  const [filters, setFilters] = useState({ form: '', start: '', end: '', media: false });
  const [rows, setRows] = useState([]);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries({ form: filters.form, start: filters.start, end: filters.end }).filter(([, v]) => v));
    studentsApi.feedback(params).then(setRows).catch(() => setRows([]));
  }, [filters.form, filters.start, filters.end]);
  useEffect(() => { load(); }, [load]);
  const remove = useRemove(load);

  const shown = filters.media ? rows.filter((r) => r.media.length > 0) : rows;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select aria-label="Tingkatan" value={filters.form} onChange={(e) => setFilters({ ...filters, form: e.target.value })} className={filterClass}>
          <option value="">Semua tingkatan</option>
          {FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">Dari <input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} className={filterClass} /></label>
        <label className="flex items-center gap-2 text-sm text-gray-600">Hingga <input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} className={filterClass} /></label>
        <Checkbox label="Ada gambar atau video sahaja" checked={filters.media} onChange={(e) => setFilters({ ...filters, media: e.target.checked })} />
      </div>
      {shown.length === 0 ? (
        <Card><EmptyState icon={MessageSquareQuote} title="Tiada maklum balas">Rekod maklum balas dalam profil pelajar.</EmptyState></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((fb) => <FeedbackCard key={fb.id} fb={fb} canDelete={canDelete} onDelete={remove} showStudent />)}
        </div>
      )}
    </>
  );
}
