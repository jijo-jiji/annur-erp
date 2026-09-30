import React, { useState } from 'react';
import {
  FileText, Download, Printer, Plus, Filter, Users, Calendar,
  CheckCircle2, X, Save, UploadCloud, Trash2, BookOpen, Clock, AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { academicApi, filesApi } from '../api/client';
import { ACCEPT, openAttachment, uploadError } from './Attachments';

export default function HandoutRepositoryView({ currentRole = 'ADMIN' }) {
  const { handouts: backendHandouts, createHandout, recordPrint, timetable, refreshAllData } = useApp();
  const canDelete = currentRole === 'SUPERVISOR' || currentRole === 'MANAGEMENT';
  const [selectedForm, setSelectedForm] = useState('ALL');
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const handouts = backendHandouts.map(h => ({
    id: h.handout_id,
    title: h.title,
    form: h.form_level,
    subject: h.subject_name,
    classCode: h.class_code,
    teacher: h.teacher_name || '-',
    uploadDate: h.upload_date,
    fileSize: h.file_size || '-',
    fileType: h.file_type || '-',
    copiesNeeded: h.copies_needed,
    copiesPrinted: h.copies_printed,
    status: h.status,
    description: h.description || '',
    rawId: h.id,
    file: h.file,
  }));

  const emptyHandout = { title: '', classId: '', date: new Date().toISOString().split('T')[0], copiesNeeded: 20, description: '', file: null };
  const [newHandout, setNewHandout] = useState(emptyHandout);
  const classOptions = [...timetable].sort((a, b) => a.class_code.localeCompare(b.class_code));

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    const cls = timetable.find((c) => c.id === Number(newHandout.classId));
    try {
      const created = await createHandout({
        title: newHandout.title,
        form_level: cls.form_level,
        subject_name: cls.subject_details?.name || '',
        class_code: cls.class_code,
        teacher_name: cls.teacher_details?.full_name || '',
        copies_needed: Number(newHandout.copiesNeeded),
        // j-status.doc: handout description is the date and class it is for
        description: [`Untuk kelas ${newHandout.date}`, newHandout.description].filter(Boolean).join('. '),
        status: 'NEEDS_PRINTING'
      });
      if (newHandout.file) {
        try {
          await filesApi.upload('HANDOUT', created.id, newHandout.file);
        } catch (err) {
          showToast(`Rekod disimpan tetapi fail gagal dimuat naik: ${uploadError(err)}`);
        }
        await refreshAllData();
      }
      setIsUploadModalOpen(false);
      setNewHandout(emptyHandout);
      showToast(`Handout "${newHandout.title}" disimpan${newHandout.file ? ' bersama fail' : ''}.`);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrintBatch = async (id, title, copies) => {
    try {
      const target = handouts.find(h => h.id === id);
      const rawId = target?.rawId || id;
      await recordPrint(rawId, Number(copies));
      showToast(`Cetakan ${copies} salinan untuk "${title}" direkodkan.`);
    } catch (err) {
      console.error(err);
    }
  };

  // Attach or replace the file on an existing handout
  const attachFile = async (hnd, file) => {
    if (!file) return;
    try {
      await filesApi.upload('HANDOUT', hnd.rawId, file);
      await refreshAllData();
      showToast(`Fail untuk "${hnd.title}" dimuat naik.`);
    } catch (err) {
      showToast(uploadError(err));
    }
  };

  const handleDeleteHandout = async (id, title) => {
    if (!window.confirm(`Padam rekod "${title}"?`)) return;
    const target = handouts.find(h => h.id === id);
    try {
      await academicApi.deleteHandout(target.rawId);
      await refreshAllData();
      showToast(`Rekod "${title}" dipadam.`);
    } catch (err) {
      showToast(err.message || 'Gagal memadam.');
    }
  };

  const filteredHandouts = handouts.filter(h => {
    const matchForm = selectedForm === 'ALL' || h.form === selectedForm;
    const matchSubject = selectedSubject === 'ALL' || h.subject === selectedSubject;
    return matchForm && matchSubject;
  });

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-indigo-500/30 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-xs font-semibold">{toastMessage}</p>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-900">Repositori Modul & Nota Kelas (Handouts)</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
              {handouts.length} Modul Tersedia
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Pusat Tuisyen An Nur (Telipot) • Pengurusan cetakan bahan kelas mengikut kapasiti bilik dan subjek.
          </p>
        </div>

        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Muat Naik Modul / Nota
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Jumlah Modul Pembelajaran</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{handouts.length} Dokumen</div>
          <span className="text-[11px] text-slate-400">Tingkatan 1–5 & Darjah 5/6</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Sedia untuk Sesi Mingguan</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {handouts.filter(h => h.status === 'PRINT_READY').length} Modul
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold">Telah siap dicetak</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Menunggu Cetakan Kaunter</span>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {handouts.filter(h => h.status === 'NEEDS_PRINTING').length} Modul
          </div>
          <span className="text-[11px] text-amber-700 font-semibold">Perlu dicetak segera</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Jumlah Salinan Diedarkan</span>
          <div className="text-2xl font-black text-indigo-600 mt-1">{handouts.reduce((s, h) => s + (h.copiesPrinted || 0), 0)} Salinan</div>
          <span className="text-[11px] text-slate-400">Jumlah salinan dicetak</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="font-bold text-slate-700">Tapis Tingkatan:</span>
          <select
            value={selectedForm}
            onChange={(e) => setSelectedForm(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-slate-700 outline-none cursor-pointer"
          >
            <option value="ALL">Semua Tingkatan</option>
            <option value="F5">Tingkatan 5</option>
            <option value="F4">Tingkatan 4</option>
            <option value="F3">Tingkatan 3</option>
            <option value="F2">Tingkatan 2</option>
            <option value="F1">Tingkatan 1</option>
            <option value="S6">Darjah 6 & 5</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">Subjek:</span>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-slate-700 outline-none cursor-pointer"
          >
            <option value="ALL">Semua Subjek</option>
            {[...new Set(handouts.map((h) => h.subject).filter(Boolean))].sort().map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Handouts List */}
      <div className="space-y-3">
        {filteredHandouts.map((hnd) => {
          const isReady = hnd.status === 'PRINT_READY';
          return (
            <div
              key={hnd.id}
              className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-sm transition flex flex-wrap items-center justify-between gap-4 text-xs"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                  <FileText className="w-6 h-6" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {hnd.classCode}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{hnd.title}</span>
                  </div>

                  <p className="text-slate-500 mt-1">{hnd.description}</p>

                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400">
                    <span>Guru: <strong className="text-slate-700">{hnd.teacher}</strong></span>
                    <span>•</span>
                    <span>Tarikh: <strong className="text-slate-700">{hnd.uploadDate}</strong></span>
                    <span>•</span>
                    <span>Fail: <strong className="text-slate-700">{hnd.file ? `${hnd.file.original_name} (${hnd.fileSize})` : 'Tiada fail'}</strong></span>
                    <span>•</span>
                    <span>Keperluan Cetakan: <strong className="text-indigo-600">{hnd.copiesNeeded} Salinan</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`font-bold px-3 py-1 rounded-xl text-xs ${
                    isReady
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {isReady ? `Siap Cetak (${hnd.copiesPrinted}/${hnd.copiesNeeded})` : 'Perlu Dicetak'}
                </span>

                {hnd.file ? (
                  <button onClick={() => openAttachment(hnd.file).catch((err) => showToast(err.message))}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold cursor-pointer" title="Buka / muat turun fail">
                    <Download className="w-3.5 h-3.5" /> Fail
                  </button>
                ) : (
                  <label className="flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold cursor-pointer" title="Muat naik fail untuk handout ini">
                    <UploadCloud className="w-3.5 h-3.5" /> Muat naik
                    <input type="file" accept={ACCEPT.HANDOUT} className="hidden" onChange={(e) => attachFile(hnd, e.target.files?.[0])} />
                  </label>
                )}

                <button
                  onClick={() => handlePrintBatch(hnd.id, hnd.title, hnd.copiesNeeded)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                  title="Hantar pesanan cetakan kelompok"
                >
                  <Printer className="w-3.5 h-3.5" /> Cetak ({hnd.copiesNeeded})
                </button>

                {canDelete && <button
                  onClick={() => handleDeleteHandout(hnd.id, hnd.title)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                  title="Padam modul ini"
                >
                  <Trash2 className="w-4 h-4" />
                </button>}
              </div>
            </div>
          );
        })}

        {filteredHandouts.length === 0 && (
          <div className="py-12 bg-white rounded-3xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
            Tiada modul ditemui untuk tapisan yang dipilih.
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Rekod Handout Kelas</h3>
                <p className="text-xs text-slate-500">Tarikh dan kelas handout, untuk cetakan kaunter</p>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tajuk Modul / Nota</label>
                <input
                  type="text"
                  required
                  placeholder="cth: Modul Peperiksaan Percubaan: Latihan Format SPM 2026"
                  value={newHandout.title}
                  onChange={(e) => setNewHandout({ ...newHandout, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                />
              </div>

              <div>
                <label htmlFor="h-class" className="block font-semibold text-slate-700 mb-1">Kelas *</label>
                <select
                  id="h-class"
                  required
                  value={newHandout.classId}
                  onChange={(e) => setNewHandout({ ...newHandout, classId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                >
                  <option value="">Pilih kelas…</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.class_code} • {c.day} {c.period_label} ({c.current_enrolled} pelajar)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="h-date" className="block font-semibold text-slate-700 mb-1">Tarikh Kelas *</label>
                  <input
                    id="h-date"
                    type="date"
                    required
                    value={newHandout.date}
                    onChange={(e) => setNewHandout({ ...newHandout, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="h-copies" className="block font-semibold text-slate-700 mb-1">Bilangan Salinan</label>
                  <input
                    id="h-copies"
                    type="number"
                    min="1"
                    max="200"
                    required
                    value={newHandout.copiesNeeded}
                    onChange={(e) => setNewHandout({ ...newHandout, copiesNeeded: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Penerangan & Catatan Topik</label>
                <textarea
                  rows="2"
                  placeholder="cth: Soalan Bahagian B format baharu KSSM untuk kelas Jumaat 9.00 AM."
                  value={newHandout.description}
                  onChange={(e) => setNewHandout({ ...newHandout, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                ></textarea>
              </div>

              <div>
                <label htmlFor="h-file" className="block font-semibold text-slate-700 mb-1">Fail handout (PDF, Word, PowerPoint atau gambar; maksimum 25 MB)</label>
                <input id="h-file" type="file" accept={ACCEPT.HANDOUT}
                  onChange={(e) => setNewHandout({ ...newHandout, file: e.target.files?.[0] || null })}
                  className="w-full text-xs" />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Save className="w-4 h-4" /> Simpan Rekod
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
