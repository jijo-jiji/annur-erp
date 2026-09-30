import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Upload, Trash2, FileText, Camera, Lock, Eraser, Check } from 'lucide-react';
import { filesApi } from '../api/client';
import { useApp } from '../context/AppContext';

// What the file picker offers for each kind (the server checks the content again)
export const ACCEPT = {
  STUDENT_PHOTO: 'image/jpeg,image/png,image/webp',
  STAFF_PHOTO: 'image/jpeg,image/png,image/webp',
  FEEDBACK: 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm',
  STAFF_DOC: '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx',
  VOUCHER: '.pdf,.jpg,.jpeg,.png,.webp',
  HANDOUT: '.pdf,.jpg,.jpeg,.png,.doc,.docx,.ppt,.pptx',
};
export const DOC_TYPES = [
  { id: 'IC', label: 'Salinan Kad Pengenalan' },
  { id: 'RESUME', label: 'Resume' },
  { id: 'OFFER_LETTER', label: 'Surat Tawaran' },
  { id: 'OTHER', label: 'Lain-lain' },
];

const sizeLabel = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const uploadError = (err) => (err?.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '') || err?.message || 'Muat naik gagal.';

// Object URL for a protected file; revoked when no longer shown
export function useBlobUrl(attachment) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!attachment) { setUrl(null); return undefined; }
    let objectUrl = null;
    let cancelled = false;
    filesApi.blob(attachment.id).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => setUrl(null));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment]);
  return url;
}

// Opens (images, PDF, video) or downloads (Word, PowerPoint) a protected file
export async function openAttachment(att) {
  const blob = await filesApi.blob(att.id);
  const url = URL.createObjectURL(blob);
  const inline = att.is_image || att.is_video || att.content_type === 'application/pdf';
  const link = document.createElement('a');
  link.href = url;
  if (inline) link.target = '_blank';
  else link.download = att.original_name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function Thumb({ att, large }) {
  const url = useBlobUrl(att.is_image || att.is_video ? att : null);
  const box = large ? 'w-full aspect-video' : 'w-14 h-14';
  if (att.is_image) return url ? <img src={url} alt={att.original_name} className={`${box} object-cover rounded-lg border border-slate-200`} /> : <div className={`${box} rounded-lg bg-slate-100 animate-pulse`} />;
  if (att.is_video) return url ? <video src={url} controls={large} muted className={`${box} object-cover rounded-lg border border-slate-200 bg-black`} /> : <div className={`${box} rounded-lg bg-slate-100 animate-pulse`} />;
  return <div className={`${box} rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center`}><FileText className="w-6 h-6 text-slate-400" /></div>;
}

/**
 * Files attached to one record. `docTypes` adds a document-type choice (staff documents);
 * `locked` says uploads cannot be removed once sent.
 */
export function AttachmentList({ kind, objectId, title = 'Lampiran', canUpload = true, canDelete = false, docTypes, locked, hint, emptyText = 'Tiada lampiran.', grid, onChanged }) {
  const { showToast } = useApp();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState(docTypes ? docTypes[0].id : '');
  const [description, setDescription] = useState('');
  const inputRef = useRef(null);

  const load = useCallback(() => {
    if (!objectId) return;
    filesApi.list(kind, objectId).then(setItems).catch(() => setItems([]));
  }, [kind, objectId]);
  useEffect(() => { load(); }, [load]);

  const upload = async (fileList) => {
    const chosen = [...(fileList || [])];
    if (!chosen.length) return;
    if (locked && !window.confirm('Dokumen yang dihantar tidak boleh dipadam. Teruskan?')) return;
    setBusy(true);
    let ok = 0;
    for (const file of chosen) {
      try {
        await filesApi.upload(kind, objectId, file, { doc_type: docTypes ? docType : undefined, description: description || undefined });
        ok += 1;
      } catch (err) {
        showToast(`${file.name}: ${uploadError(err)}`, 'error');
      }
    }
    setBusy(false);
    setDescription('');
    if (inputRef.current) inputRef.current.value = '';
    if (ok) { showToast(`${ok} fail dimuat naik.`); load(); onChanged?.(); }
  };

  const remove = async (att) => {
    if (!window.confirm(`Padam ${att.original_name}?`)) return;
    try {
      await filesApi.remove(att.id);
      showToast('Fail dipadam.');
      load();
      onChanged?.();
    } catch (err) {
      showToast(uploadError(err), 'error');
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-slate-900 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" /> {title} {items.length > 0 && <span className="text-slate-400 font-normal">({items.length})</span>}</h4>
        {locked && <span className="text-[10px] text-slate-500 flex items-center gap-1"><Lock className="w-3 h-3" /> Tidak boleh dipadam selepas dihantar</span>}
      </div>
      {canUpload && (
        <div className="flex flex-wrap items-center gap-2">
          {docTypes && (
            <select aria-label="Jenis dokumen" value={docType} onChange={(e) => setDocType(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white">
              {docTypes.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          )}
          <input aria-label="Keterangan fail" placeholder="Keterangan (pilihan)" value={description} onChange={(e) => setDescription(e.target.value)} className="flex-1 min-w-[120px] px-2 py-1.5 rounded-lg border border-slate-200" />
          <label className={`px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center gap-1 cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload className="w-3.5 h-3.5" /> {busy ? 'Memuat naik…' : 'Muat naik'}
            <input ref={inputRef} type="file" multiple={!docTypes} accept={ACCEPT[kind]} className="hidden" onChange={(e) => upload(e.target.files)} />
          </label>
        </div>
      )}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      {items.length === 0 ? <p className="text-slate-400">{emptyText}</p> : grid ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((att) => (
            <div key={att.id} className="space-y-1">
              <button type="button" onClick={() => openAttachment(att)} className="block w-full cursor-pointer"><Thumb att={att} large /></button>
              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500">
                <span className="truncate">{att.description || att.original_name}</span>
                {canDelete && <button onClick={() => remove(att)} aria-label={`Padam ${att.original_name}`} className="text-rose-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((att) => (
            <li key={att.id} className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-100">
              <button type="button" onClick={() => openAttachment(att)} className="shrink-0 cursor-pointer"><Thumb att={att} /></button>
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => openAttachment(att)} className="font-semibold text-indigo-700 hover:underline truncate block max-w-full text-left cursor-pointer">{att.original_name}</button>
                <div className="text-[10px] text-slate-500">
                  {att.doc_type_label && `${att.doc_type_label} • `}{sizeLabel(att.size)} • {att.uploaded_by_name} • {String(att.uploaded_at).slice(0, 10)}
                </div>
                {att.description && <div className="text-[10px] text-slate-600">{att.description}</div>}
              </div>
              {canDelete && !locked && <button onClick={() => remove(att)} aria-label={`Padam ${att.original_name}`} className="p-1 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Profile photo (student / staff); a new upload replaces the old one
export function PhotoBox({ kind, objectId, canUpload, name, size = 'w-20 h-20' }) {
  const { showToast } = useApp();
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    filesApi.list(kind, objectId).then((rows) => setPhoto(rows[0] || null)).catch(() => setPhoto(null));
  }, [kind, objectId]);
  useEffect(() => { load(); }, [load]);
  const url = useBlobUrl(photo);
  const initials = (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await filesApi.upload(kind, objectId, file);
      showToast('Gambar dikemas kini.');
      load();
    } catch (err) {
      showToast(uploadError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative ${size} shrink-0`}>
      {url ? <img src={url} alt={`Gambar ${name}`} className={`${size} rounded-2xl object-cover border border-slate-200`} />
        : <div className={`${size} rounded-2xl bg-indigo-100 text-indigo-700 font-black text-lg flex items-center justify-center`}>{initials}</div>}
      {canUpload && (
        <label title="Tukar gambar" className={`absolute -bottom-1 -right-1 p-1.5 rounded-full bg-white border border-slate-200 shadow cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <Camera className="w-3.5 h-3.5 text-slate-700" />
          <input type="file" accept={ACCEPT[kind]} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      )}
    </div>
  );
}

// Recipient signature drawn with finger / mouse, saved as a PNG attachment
export function SignaturePad({ objectId, canSign, onSaved }) {
  const { showToast } = useApp();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    filesApi.list('VOUCHER_SIGNATURE', objectId).then((rows) => setExisting(rows[0] || null)).catch(() => setExisting(null));
  }, [objectId]);
  useEffect(() => { load(); }, [load]);
  const url = useBlobUrl(existing);

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [(e.clientX - rect.left) * (canvasRef.current.width / rect.width), (e.clientY - rect.top) * (canvasRef.current.height / rect.height)];
  };
  const start = (e) => {
    if (!canSign) return;
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(...point(e));
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(...point(e));
    ctx.stroke();
    setDirty(true);
  };
  const end = () => { drawing.current = false; };
  const clear = () => {
    canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setDirty(false);
  };
  const save = () => {
    setBusy(true);
    canvasRef.current.toBlob(async (blob) => {
      try {
        await filesApi.upload('VOUCHER_SIGNATURE', objectId, new File([blob], 'tandatangan-penerima.png', { type: 'image/png' }));
        showToast('Tandatangan penerima disimpan.');
        clear();
        load();
        onSaved?.();
      } catch (err) {
        showToast(uploadError(err), 'error');
      } finally {
        setBusy(false);
      }
    }, 'image/png');
  };

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tandatangan Penerima</div>
      {url && <img src={url} alt="Tandatangan penerima" className="h-20 border border-slate-200 rounded-lg bg-white" />}
      {canSign && (
        <>
          <canvas ref={canvasRef} width={480} height={140} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
            aria-label="Ruang tandatangan" className="w-full h-24 border border-dashed border-slate-300 rounded-lg bg-white touch-none cursor-crosshair" />
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={clear} className="px-2.5 py-1 rounded-lg border border-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"><Eraser className="w-3 h-3" /> Padam</button>
            <button type="button" onClick={save} disabled={!dirty || busy} className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"><Check className="w-3 h-3" /> {existing ? 'Ganti tandatangan' : 'Simpan tandatangan'}</button>
          </div>
        </>
      )}
      {!url && !canSign && <p className="text-slate-400">Tiada tandatangan.</p>}
    </div>
  );
}
