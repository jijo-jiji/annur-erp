import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { filesApi, studentsApi } from '../api/client';
import { ACCEPT, Thumb, openAttachment, uploadError } from './Attachments';
import { FORMS, FORM_LABELS, today } from './studentShared';

const GIVEN_BY = [{ id: 'PARENT', label: 'Ibu bapa' }, { id: 'STUDENT', label: 'Pelajar' }];
const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white';

function FeedbackCard({ fb, canDelete, onDelete, showStudent }) {
  return (
    <div className="p-3 rounded-xl border border-slate-200 space-y-2 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          {showStudent && <div className="font-bold text-slate-900">{fb.student_name} <span className="text-slate-400 font-normal">({FORM_LABELS[fb.form_level] || fb.form_level})</span></div>}
          <div className="text-[10px] text-slate-500">{fb.date} • {fb.given_by_label} • direkod oleh {fb.recorded_by}</div>
        </div>
        {canDelete && <button onClick={() => onDelete(fb)} aria-label="Padam maklum balas" className="p-1 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
      <p className="text-slate-700 whitespace-pre-line">{fb.description}</p>
      {fb.media.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {fb.media.map((m) => <button key={m.id} type="button" onClick={() => openAttachment(m)} className="cursor-pointer"><Thumb att={m} large /></button>)}
        </div>
      )}
    </div>
  );
}

// Feedback section in the student profile: record feedback with photos / videos
export function StudentFeedbackPanel({ studentId, canDelete, onChanged }) {
  const { showToast } = useApp();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    studentsApi.feedback({ student: studentId }).then(setRows).catch(() => setRows([]));
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fb = await studentsApi.addFeedback({ student: studentId, date: form.date, given_by: form.given_by, description: form.description });
      for (const file of form.files) {
        try {
          await filesApi.upload('FEEDBACK', fb.id, file);
        } catch (err) {
          showToast(`${file.name}: ${uploadError(err)}`, 'error');
        }
      }
      showToast('Maklum balas direkodkan.');
      setForm(null);
      load();
      onChanged?.();
    } catch (err) {
      showToast(uploadError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (fb) => {
    if (!window.confirm('Padam maklum balas ini bersama gambar/videonya?')) return;
    try {
      await studentsApi.deleteFeedback(fb.id);
      showToast('Maklum balas dipadam.');
      load();
    } catch (err) {
      showToast(uploadError(err), 'error');
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-slate-900">Maklum Balas Ibu Bapa / Pelajar ({rows.length})</h4>
        {!form && <button onClick={() => setForm({ date: today(), given_by: 'PARENT', description: '', files: [] })} className="px-3 py-1.5 rounded-lg font-semibold text-[11px] border bg-pink-50 border-pink-200 text-pink-700 cursor-pointer">+ Maklum Balas</button>}
      </div>
      {form && (
        <form onSubmit={submit} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Daripada" value={form.given_by} onChange={(e) => setForm({ ...form, given_by: e.target.value })} className={input}>
              {GIVEN_BY.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <input type="date" aria-label="Tarikh" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
          </div>
          <textarea required rows="2" placeholder="Maklum balas" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
          <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Gambar / video (pilihan, video maksimum 50 MB)
            <input type="file" multiple accept={ACCEPT.FEEDBACK} onChange={(e) => setForm({ ...form, files: [...e.target.files] })} className="text-[11px]" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold cursor-pointer">Batal</button>
            <button type="submit" disabled={busy} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold cursor-pointer disabled:opacity-60">{busy ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </form>
      )}
      {rows.length === 0 ? <p className="text-slate-400">Tiada maklum balas.</p> : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {rows.map((fb) => <FeedbackCard key={fb.id} fb={fb} canDelete={canDelete} onDelete={remove} />)}
        </div>
      )}
    </section>
  );
}

// Gallery of feedback across students, filtered by form and date (j-status.doc: Gallery - feedback)
export function FeedbackGallery({ canDelete }) {
  const { showToast } = useApp();
  const [filters, setFilters] = useState({ form: '', start: '', end: '', media: false });
  const [rows, setRows] = useState([]);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries({ form: filters.form, start: filters.start, end: filters.end }).filter(([, v]) => v));
    studentsApi.feedback(params).then(setRows).catch(() => setRows([]));
  }, [filters.form, filters.start, filters.end]);
  useEffect(() => { load(); }, [load]);

  const remove = async (fb) => {
    if (!window.confirm('Padam maklum balas ini bersama gambar/videonya?')) return;
    try {
      await studentsApi.deleteFeedback(fb.id);
      showToast('Maklum balas dipadam.');
      load();
    } catch (err) {
      showToast(uploadError(err), 'error');
    }
  };

  const shown = filters.media ? rows.filter((r) => r.media.length > 0) : rows;
  const select = 'px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-semibold';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <ImageIcon className="w-4 h-4 text-slate-400" />
        <select aria-label="Tingkatan" value={filters.form} onChange={(e) => setFilters({ ...filters, form: e.target.value })} className={select}>
          <option value="">Semua tingkatan</option>
          {FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <label className="flex items-center gap-1 font-semibold text-slate-600">Dari <input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} className={select} /></label>
        <label className="flex items-center gap-1 font-semibold text-slate-600">Hingga <input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} className={select} /></label>
        <label className="flex items-center gap-1.5 font-semibold text-slate-600"><input type="checkbox" checked={filters.media} onChange={(e) => setFilters({ ...filters, media: e.target.checked })} /> Ada gambar/video sahaja</label>
      </div>
      {shown.length === 0 ? <p className="py-8 text-center text-slate-400">Tiada maklum balas. Rekod maklum balas dalam profil pelajar.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((fb) => <FeedbackCard key={fb.id} fb={fb} canDelete={canDelete} onDelete={remove} showStudent />)}
        </div>
      )}
    </div>
  );
}
