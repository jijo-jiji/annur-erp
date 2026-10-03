import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Eraser, FileText, Lock, Trash2, Upload } from 'lucide-react';
import { filesApi } from '../api/client';
import { date, initials } from '../lib/format';
import { Button, cx, filterClass, IconButton, inputClass, useToast } from './ui';

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
  { id: 'IC', label: 'Salinan kad pengenalan' },
  { id: 'RESUME', label: 'Resume' },
  { id: 'OFFER_LETTER', label: 'Surat tawaran' },
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
  const box = large ? 'w-full aspect-video' : 'size-12';
  const waiting = <div className={cx(box, 'animate-pulse rounded-md bg-gray-100')} />;
  if (att.is_image) return url ? <img src={url} alt={att.original_name} className={cx(box, 'rounded-md border border-gray-200 object-cover')} /> : waiting;
  if (att.is_video) return url ? <video src={url} controls={large} muted className={cx(box, 'rounded-md border border-gray-200 bg-black object-cover')} /> : waiting;
  return <div className={cx(box, 'flex items-center justify-center rounded-md border border-gray-200 bg-gray-50')}><FileText className="size-5 text-gray-400" /></div>;
}

/**
 * Files attached to one record. `docTypes` adds a document-type choice (staff documents);
 * `locked` says uploads cannot be removed once sent.
 */
export function AttachmentList({ kind, objectId, title = 'Lampiran', canUpload = true, canDelete = false, docTypes, locked, hint, emptyText = 'Tiada lampiran.', grid, onChanged }) {
  const notify = useToast();
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
        notify(`${file.name}: ${uploadError(err)}`, 'error');
      }
    }
    setBusy(false);
    setDescription('');
    if (inputRef.current) inputRef.current.value = '';
    if (ok) { notify(`${ok} fail dimuat naik.`); load(); onChanged?.(); }
  };

  const remove = async (att) => {
    if (!window.confirm(`Padam ${att.original_name}?`)) return;
    try {
      await filesApi.remove(att.id);
      notify('Fail dipadam.', 'info');
      load();
      onChanged?.();
    } catch (err) {
      notify(uploadError(err), 'error');
    }
  };

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}{items.length > 0 && <span className="font-normal text-gray-400"> ({items.length})</span>}</h3>
        {locked && <span className="flex items-center gap-1 text-xs text-gray-500"><Lock className="size-3" /> Tidak boleh dipadam selepas dihantar</span>}
      </div>
      {canUpload && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {docTypes && (
            <select aria-label="Jenis dokumen" value={docType} onChange={(e) => setDocType(e.target.value)} className={filterClass}>
              {docTypes.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          )}
          <input aria-label="Keterangan fail" placeholder="Keterangan (pilihan)" value={description} onChange={(e) => setDescription(e.target.value)} className={cx(inputClass, 'min-w-32 flex-1 py-1.5')} />
          <Button as="label" size="sm" variant="primary" icon={Upload} className={cx('cursor-pointer', busy && 'pointer-events-none opacity-60')}>
            {busy ? 'Memuat naik…' : 'Muat naik'}
            <input ref={inputRef} type="file" multiple={!docTypes} accept={ACCEPT[kind]} className="hidden" onChange={(e) => upload(e.target.files)} />
          </Button>
        </div>
      )}
      {hint && <p className="mb-2 text-xs text-gray-500">{hint}</p>}
      {items.length === 0 ? <p className="text-sm text-gray-500">{emptyText}</p> : grid ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((att) => (
            <div key={att.id}>
              <button type="button" onClick={() => openAttachment(att)} className="block w-full"><Thumb att={att} large /></button>
              <div className="mt-1 flex items-center justify-between gap-1 text-xs text-gray-500">
                <span className="truncate">{att.description || att.original_name}</span>
                {canDelete && <IconButton label={`Padam ${att.original_name}`} icon={Trash2} onClick={() => remove(att)} className="size-6" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {items.map((att) => (
            <li key={att.id} className="flex items-center gap-3 px-3 py-2">
              <button type="button" onClick={() => openAttachment(att)} className="shrink-0"><Thumb att={att} /></button>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => openAttachment(att)} className="block max-w-full truncate text-left text-sm font-medium text-brand-700 hover:underline">{att.original_name}</button>
                <p className="text-xs text-gray-500">
                  {att.doc_type_label && `${att.doc_type_label} · `}{sizeLabel(att.size)} · {att.uploaded_by_name} · {date(String(att.uploaded_at).slice(0, 10))}
                </p>
                {att.description && <p className="text-xs text-gray-600">{att.description}</p>}
              </div>
              {canDelete && !locked && <IconButton label={`Padam ${att.original_name}`} icon={Trash2} onClick={() => remove(att)} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Profile photo (student / staff); a new upload replaces the old one
export function PhotoBox({ kind, objectId, canUpload, name, size = 'size-20' }) {
  const notify = useToast();
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    filesApi.list(kind, objectId).then((rows) => setPhoto(rows[0] || null)).catch(() => setPhoto(null));
  }, [kind, objectId]);
  useEffect(() => { load(); }, [load]);
  const url = useBlobUrl(photo);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await filesApi.upload(kind, objectId, file);
      notify('Gambar dikemas kini.');
      load();
    } catch (err) {
      notify(uploadError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx('relative shrink-0', size)}>
      {url ? <img src={url} alt={`Gambar ${name}`} className={cx(size, 'rounded-lg border border-gray-200 object-cover')} />
        : <div className={cx(size, 'flex items-center justify-center rounded-lg bg-brand-100 text-lg font-semibold text-brand-800')}>{initials(name)}</div>}
      {canUpload && (
        <label title="Tukar gambar" className={cx('absolute -bottom-1 -right-1 cursor-pointer rounded-full border border-gray-200 bg-white p-1.5 shadow', busy && 'pointer-events-none opacity-50')}>
          <Camera className="size-3.5 text-gray-700" />
          <input type="file" accept={ACCEPT[kind]} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      )}
    </div>
  );
}

// Recipient signature drawn with finger / mouse, saved as a PNG attachment
export function SignaturePad({ objectId, canSign, onSaved }) {
  const notify = useToast();
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
        notify('Tandatangan penerima disimpan.');
        clear();
        load();
        onSaved?.();
      } catch (err) {
        notify(uploadError(err), 'error');
      } finally {
        setBusy(false);
      }
    }, 'image/png');
  };

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Tandatangan penerima</h3>
      {url && <img src={url} alt="Tandatangan penerima" className="mb-2 h-20 rounded-md border border-gray-200 bg-white" />}
      {canSign && (
        <>
          <canvas
            ref={canvasRef}
            width={480}
            height={140}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            aria-label="Ruang tandatangan"
            className="h-24 w-full cursor-crosshair touch-none rounded-md border border-dashed border-gray-300 bg-white"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" icon={Eraser} onClick={clear}>Padam</Button>
            <Button size="sm" variant="primary" icon={Check} onClick={save} disabled={!dirty || busy}>{existing ? 'Ganti tandatangan' : 'Simpan tandatangan'}</Button>
          </div>
        </>
      )}
      {!url && !canSign && <p className="text-sm text-gray-500">Tiada tandatangan.</p>}
    </section>
  );
}
