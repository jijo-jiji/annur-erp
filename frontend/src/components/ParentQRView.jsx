import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { GraduationCap, CheckCircle2, Copy, ExternalLink, Printer } from 'lucide-react';
import { studentsApi } from '../api/client';
import { FORMS } from './studentShared';

const SUBJECT_CHOICES = ['Bahasa Melayu', 'Bahasa Inggeris', 'Matematik', 'Matematik Tambahan', 'Sains', 'Fizik', 'Kimia', 'Biologi', 'Sejarah', 'Prinsip Perakaunan'];

const EMPTY = {
  full_name: '', ic_number: '', form_level: 'F5', school_name: '', phone_number: '',
  parent1_name: '', parent1_phone: '', parent1_email: '', parent1_relation: 'Bapa',
  interested_subjects: [], saps_consent: true, terms: false,
};

const publicFormUrl = () => `${window.location.origin}${window.location.pathname}#/daftar`;

// Public form parents fill in on their own phone (no login)
function RegistrationForm() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleSubject = (s) => set({
    interested_subjects: form.interested_subjects.includes(s)
      ? form.interested_subjects.filter((x) => x !== s)
      : [...form.interested_subjects, s],
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { terms: _t, ...payload } = form;
    try {
      const res = await studentsApi.parentSelfRegister({
        ...payload,
        agree_terms_7th_payment: true,
        agree_terms_2months_auto_drop: true,
        agree_terms_2weeks_notice: true,
        lead_source: 'QR_CODE',
      });
      setDone(res);
    } catch (err) {
      const fieldErrors = err.data?.errors ? Object.values(err.data.errors).flat().join(' ') : '';
      setError(err.status === 429 ? 'Terlalu banyak pendaftaran dari peranti ini. Sila cuba sebentar lagi atau hubungi kaunter.'
        : fieldErrors || 'Pendaftaran gagal. Sila semak maklumat dan cuba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto p-8 bg-white rounded-3xl border border-slate-200 shadow-md text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
        <h3 className="text-lg font-extrabold text-slate-900">Pendaftaran Diterima</h3>
        <p className="text-sm text-slate-600">No. rujukan: <strong className="font-mono">{done.student_id}</strong></p>
        <p className="text-xs text-slate-600">{done.message}</p>
        <a
          href={`https://wa.me/60139838085?text=${encodeURIComponent(`Assalamualaikum, saya telah mendaftar ${form.full_name} melalui borang QR. No. rujukan ${done.student_id}.`)}`}
          target="_blank" rel="noreferrer"
          className="block w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700"
        >
          WhatsApp Kaunter
        </a>
      </div>
    );
  }

  const input = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 text-sm';
  const label = 'block font-semibold text-slate-700 mb-1';

  return (
    <form onSubmit={submit} className="max-w-lg mx-auto p-5 sm:p-8 bg-white rounded-3xl border border-slate-200 shadow-md space-y-4 text-xs">
      <div className="text-center space-y-2 border-b pb-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto"><GraduationCap className="w-7 h-7" /></div>
        <h1 className="text-lg font-bold text-slate-900">Pusat Tuisyen An Nur (Telipot)</h1>
        <p className="text-slate-500">Borang pendaftaran pelajar. Pihak kaunter akan menghubungi anda untuk kelas dan bayaran.</p>
      </div>

      <div><label htmlFor="q-name" className={label}>Nama penuh pelajar *</label><input id="q-name" required value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} className={input} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="q-ic" className={label}>No. KP / Sijil Lahir *</label><input id="q-ic" required value={form.ic_number} onChange={(e) => set({ ic_number: e.target.value })} className={input} /></div>
        <div>
          <label htmlFor="q-form" className={label}>Tingkatan *</label>
          <select id="q-form" value={form.form_level} onChange={(e) => set({ form_level: e.target.value })} className={`${input} bg-white`}>
            {FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>
      <div><label htmlFor="q-school" className={label}>Sekolah *</label><input id="q-school" required value={form.school_name} onChange={(e) => set({ school_name: e.target.value })} className={input} /></div>
      <div><label htmlFor="q-phone" className={label}>Telefon pelajar *</label><input id="q-phone" type="tel" required value={form.phone_number} onChange={(e) => set({ phone_number: e.target.value })} className={input} /></div>

      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="q-pname" className={label}>Nama ibu bapa / penjaga *</label><input id="q-pname" required value={form.parent1_name} onChange={(e) => set({ parent1_name: e.target.value })} className={input} /></div>
        <div>
          <label htmlFor="q-rel" className={label}>Hubungan</label>
          <select id="q-rel" value={form.parent1_relation} onChange={(e) => set({ parent1_relation: e.target.value })} className={`${input} bg-white`}>
            {['Bapa', 'Ibu', 'Penjaga'].map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div><label htmlFor="q-pphone" className={label}>No. WhatsApp *</label><input id="q-pphone" type="tel" required value={form.parent1_phone} onChange={(e) => set({ parent1_phone: e.target.value })} className={input} /></div>
        <div><label htmlFor="q-pemail" className={label}>E-mel</label><input id="q-pemail" type="email" value={form.parent1_email} onChange={(e) => set({ parent1_email: e.target.value })} className={input} /></div>
      </div>

      <div>
        <span className={label}>Subjek diminati</span>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECT_CHOICES.map((s) => (
            <button type="button" key={s} onClick={() => toggleSubject(s)} aria-pressed={form.interested_subjects.includes(s)}
              className={`px-3 py-2 rounded-lg font-semibold ${form.interested_subjects.includes(s) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t text-slate-600">
        <label className="flex items-start gap-2"><input type="checkbox" checked={form.saps_consent} onChange={(e) => set({ saps_consent: e.target.checked })} className="mt-0.5" /> Membenarkan pusat tuisyen menyemak keputusan di sapsnkra.moe.</label>
        <label className="flex items-start gap-2"><input type="checkbox" required checked={form.terms} onChange={(e) => set({ terms: e.target.checked })} className="mt-0.5" /> Bersetuju menjelaskan yuran sebelum 7hb setiap bulan dan mematuhi syarat tuisyen. *</label>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">{error}</div>}

      <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-60">
        {submitting ? 'Menghantar…' : 'Hantar Pendaftaran'}
      </button>
    </form>
  );
}

// Counter screen: shows the QR code parents scan
function CounterQR() {
  const [qr, setQr] = useState('');
  const url = publicFormUrl();

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(''));
  }, [url]);

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-3xl border border-slate-200 shadow-sm text-center space-y-4 text-xs">
      <h2 className="text-lg font-bold text-slate-900">Imbasan QR Pendaftaran</h2>
      <p className="text-slate-500">Ibu bapa imbas kod ini untuk mengisi borang di telefon sendiri. Pendaftaran masuk ke senarai Kelulusan.</p>
      {qr ? <img src={qr} alt="Kod QR borang pendaftaran" className="w-64 h-64 mx-auto" /> : <p className="text-slate-400">Menjana kod QR…</p>}
      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 font-mono break-all">{url}</div>
      {url.includes('localhost') && (
        <p className="text-amber-700">Alamat ini hanya berfungsi pada komputer ini. Buka sistem melalui alamat awam (cth. Cloudflare) supaya telefon ibu bapa boleh mengaksesnya.</p>
      )}
      <div className="flex justify-center gap-2">
        <button onClick={() => navigator.clipboard?.writeText(url)} className="px-3 py-2 rounded-xl border border-slate-200 font-semibold flex items-center gap-1 cursor-pointer"><Copy className="w-3.5 h-3.5" /> Salin pautan</button>
        <a href={url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-slate-200 font-semibold flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> Buka borang</a>
        <button onClick={() => window.print()} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold flex items-center gap-1 cursor-pointer"><Printer className="w-3.5 h-3.5" /> Cetak</button>
      </div>
    </div>
  );
}

export default function ParentQRView({ publicMode = false }) {
  if (publicMode) {
    return (
      <div className="min-h-screen bg-slate-100 py-6 px-4 font-sans">
        <RegistrationForm />
      </div>
    );
  }
  return <CounterQR />;
}
