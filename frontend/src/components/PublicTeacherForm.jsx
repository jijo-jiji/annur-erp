import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { publicTeacherApi } from '../api/client';
import { describeError } from '../lib/apiErrors';
import { CENTRE } from '../lib/config';
import { BrandMark } from './Sidebar';
import TeacherClassesToday from './TeacherClassesToday';
import { Button, Card, CardHeader, Checkbox, Input, Segmented, Textarea } from './ui';

// The page behind a teacher's private link (#/guru/<link>), opened on a phone without a login (Phase F).
// A teacher updates their own details, bank account, subjects, experience, permit, photo and IC; an applicant (general
// link) fills in the same to ask to join. Nothing changes until Management approves it (backend/teachers/links.py).

const LEVELS = { PRIMARY: 'Sekolah rendah', LOWER_SEC: 'Menengah rendah (T1–T3)', UPPER_SEC: 'Menengah atas (T4–T5)' };
const DOCS = [
  { field: 'photo', label: 'Gambar diri', accept: 'image/jpeg,image/png,image/webp', hint: 'Gambar muka yang jelas (JPG / PNG).', has: (t) => t?.has_photo },
  { field: 'ic', label: 'Salinan kad pengenalan', accept: '.pdf,.jpg,.jpeg,.png,.webp', hint: 'Depan dan belakang dalam satu fail jika boleh.', has: (t) => t?.documents.includes('IC') },
  { field: 'permit', label: 'Permit mengajar', accept: '.pdf,.jpg,.jpeg,.png,.webp', hint: 'Jika ada.', has: (t) => t?.documents.includes('PERMIT') },
];

export default function PublicTeacherForm({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState(null);
  const [uploads, setUploads] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [view, setView] = useState('classes'); // a teacher's link opens on today's classes (Phase I)

  useEffect(() => {
    publicTeacherApi.get(token).then((data) => {
      setInfo(data);
      const t = data.teacher;
      setF({
        full_name: t?.full_name ?? '', phone_number: t?.phone_number ?? '', email: t?.email ?? '', bank_name: t?.bank_name ?? '',
        bank_account: t?.bank_account ?? '', subjects_qualified: t?.subjects_qualified ?? [], teaching_since: t?.teaching_since ?? '',
        teaching_permit_expiry: t?.teaching_permit_expiry ?? '', remarks: '',
      });
    }).catch((err) => setError(err.status === 404 ? (err.data?.detail || 'Pautan ini tidak sah.') : 'Tidak dapat membuka borang. Cuba lagi sebentar lagi.'));
  }, [token]);

  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  const applicant = info?.kind === 'APPLICANT';

  const header = (
    <div className="mb-6 flex items-center gap-3">
      <BrandMark />
      <div>
        <p className="font-semibold text-gray-900">{info?.centre || CENTRE.name}</p>
        <p className="text-[13px] text-gray-500">{applicant ? 'Permohonan guru' : 'Maklumat guru'}</p>
      </div>
    </div>
  );

  if (error && !info) {
    return (
      <div className="mx-auto max-w-lg">
        {header}
        <Card className="p-6"><p role="alert" className="text-sm text-red-700">{error}</p></Card>
      </div>
    );
  }
  if (!info || !f) return <p className="py-10 text-center text-sm text-gray-500">Memuatkan…</p>;

  if (done) {
    return (
      <div className="mx-auto max-w-lg">
        {header}
        <Card className="p-6">
          <CheckCircle2 className="size-10 text-brand-600" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">{applicant ? 'Permohonan diterima' : 'Maklumat dihantar'}</h1>
          <p className="mt-2 text-sm text-gray-600">
            Terima kasih. Rujukan anda <span className="font-medium text-gray-900">{done.reference}</span>.
            {done.replaced ? ' Hantaran anda sebelum ini telah dikemas kini.' : ''}
          </p>
          <p className="mt-2 text-sm text-gray-600">
            {applicant ? 'Pengurusan akan menyemak permohonan anda dan menghubungi anda.' : 'Maklumat ini berkuat kuasa selepas disemak oleh Pengurusan.'}
          </p>
          {!applicant && <Button size="lg" className="mt-5 w-full" onClick={() => setDone(null)}>Kembali ke borang</Button>}
        </Card>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fields = { ...f };
      if (!applicant) delete fields.remarks;
      const res = await publicTeacherApi.send(token, fields, uploads);
      setUploads({});
      setInfo((v) => ({ ...v, waiting: true }));
      setDone(res);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.status === 429 ? 'Terlalu banyak cubaan dari peranti ini. Cuba lagi sebentar lagi.' : err.data?.detail || describeError(err) || 'Penghantaran gagal.');
    } finally {
      setBusy(false);
    }
  };

  const byLevel = Object.entries(LEVELS).map(([level, label]) => ({ label, subjects: info.subjects.filter((s) => s.level === level) })).filter((g) => g.subjects.length);
  const toggle = (id, on) => set({ subjects_qualified: on ? [...f.subjects_qualified, id] : f.subjects_qualified.filter((x) => x !== id) });

  if (!applicant && view === 'classes') {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <h1 className="text-xl font-semibold text-gray-900">Cikgu {info.teacher.full_name}</h1>
        <Segmented className="my-4" value={view} onChange={setView} items={[{ value: 'classes', label: 'Kelas hari ini' }, { value: 'profile', label: 'Maklumat saya' }]} />
        <TeacherClassesToday token={token} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {header}
      <h1 className="text-xl font-semibold text-gray-900">{applicant ? 'Borang permohonan guru' : `Cikgu ${info.teacher.full_name}`}</h1>
      {!applicant && (
        <Segmented className="my-4" value={view} onChange={setView} items={[{ value: 'classes', label: 'Kelas hari ini' }, { value: 'profile', label: 'Maklumat saya' }]} />
      )}
      <p className="mt-1 text-sm text-gray-600">
        {applicant
          ? 'Isi maklumat anda. Pengurusan akan menyemak permohonan ini.'
          : 'Semak dan kemas kini maklumat anda. Perubahan berkuat kuasa selepas disemak oleh Pengurusan. Pautan ini peribadi; jangan kongsikan.'}
      </p>
      {info.waiting && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Hantaran anda sebelum ini masih menunggu semakan. Menghantar sekali lagi akan menggantikannya.
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Card>
          <CardHeader title="Maklumat diri" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Input label="Nama penuh" required value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} autoComplete="name" />
            <Input label="No. telefon (WhatsApp)" required type="tel" value={f.phone_number} onChange={(e) => set({ phone_number: e.target.value })} autoComplete="tel" />
            <Input label="E-mel" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" className="sm:col-span-2" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Akaun bank" description="Untuk bayaran elaun mengajar." />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Input label="Bank" value={f.bank_name} onChange={(e) => set({ bank_name: e.target.value })} placeholder="cth. Maybank" />
            <Input label="No. akaun" inputMode="numeric" value={f.bank_account} onChange={(e) => set({ bank_account: e.target.value })} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Pengajaran" description="Subjek yang boleh anda ajar dan pengalaman mengajar." />
          <div className="space-y-4 p-5">
            {byLevel.map((g) => (
              <fieldset key={g.label}>
                <legend className="mb-1.5 text-[13px] font-medium text-gray-700">{g.label}</legend>
                <div className="grid grid-cols-1 gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-2">
                  {g.subjects.map((s) => (
                    <Checkbox key={s.id} label={s.name} checked={f.subjects_qualified.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Mula mengajar" type="date" value={f.teaching_since || ''} onChange={(e) => set({ teaching_since: e.target.value })} hint="Tarikh anda mula mengajar, di mana-mana." />
              <Input label="Permit mengajar luput" type="date" value={f.teaching_permit_expiry || ''} onChange={(e) => set({ teaching_permit_expiry: e.target.value })} />
            </div>
            {applicant && (
              <Textarea label="Pengalaman & kelayakan" rows={3} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })}
                hint="Sekolah atau pusat tuisyen tempat anda mengajar, kelulusan, kepakaran." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Dokumen" description="Gambar atau PDF. Dokumen disimpan secara peribadi dan hanya dilihat oleh pihak pengurusan." />
          <div className="space-y-4 p-5">
            {DOCS.map((d) => (
              <label key={d.field} className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-gray-700">
                  {d.label}{d.has(info.teacher) && <span className="font-normal text-gray-500"> · sudah ada dalam rekod</span>}
                </span>
                <input type="file" accept={d.accept} onChange={(e) => setUploads((u) => ({ ...u, [d.field]: e.target.files?.[0] || null }))}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-800 hover:file:bg-gray-200" />
                <span className="mt-1 block text-[13px] text-gray-500">{d.hint}</span>
              </label>
            ))}
          </div>
        </Card>

        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{busy ? 'Menghantar…' : applicant ? 'Hantar permohonan' : 'Hantar untuk semakan'}</Button>
      </form>
    </div>
  );
}
