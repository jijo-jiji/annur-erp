import React, { useState } from 'react';
import { QrCode, GraduationCap, CheckCircle2, ShieldCheck, MessageSquare } from 'lucide-react';

export default function ParentQRView() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    ic: '',
    form: 'F5',
    school: '',
    parentName: '',
    parentPhone: '',
    subs: ['FZ', 'KIM', 'BIO', 'ADDMT'],
    saps: true,
    terms: true
  });

  const subjects = ['FZ', 'KIM', 'BIO', 'ADDMT', 'BI', 'BM', 'MATH', 'SAINS', 'SEJ', 'ACC'];

  const toggleSub = (s) => {
    if (formData.subs.includes(s)) {
      setFormData({ ...formData, subs: formData.subs.filter((x) => x !== s) });
    } else {
      setFormData({ ...formData, subs: [...formData.subs, s] });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.subs.length < 4 && formData.form.startsWith('F')) {
      alert("Pilihan Minimum: 4 Subjek bagi Sekolah Menengah!");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="max-w-md mx-auto my-8 p-8 bg-white rounded-3xl border border-slate-200 shadow-md text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-extrabold text-slate-900">Pendaftaran Berjaya Dihantar!</h3>
        <p className="text-xs text-slate-600">
          Terima kasih <strong>{formData.parentName}</strong>. Maklumat pendaftaran pelajar <strong>{formData.name}</strong> telah diterima oleh sistem Pusat Tuisyen An Nur Telipot.
        </p>
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-900 text-left space-y-1">
          <div>• <strong>Pakej Subjek:</strong> {formData.subs.join(', ')}</div>
          <div>• <strong>Yuran Bulanan:</strong> RM 240.00</div>
          <div>• <strong>Yuran Pendaftaran:</strong> RM 30.00</div>
          <div>• <strong>Jumlah Bayaran:</strong> RM 270.00</div>
        </div>
        <a
          href={`https://wa.me/60139838085?text=Assalamualaikum%20kaunter%20Pusat%20Tuisyen%20An%20Nur,%20saya%20${encodeURIComponent(formData.parentName)}%20telah%20mendaftar%20anak%20saya%20${encodeURIComponent(formData.name)}%20melalui%20portal%20QR.`}
          target="_blank"
          rel="noreferrer"
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" /> Sahkan Melalui WhatsApp Kaunter
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto my-6 p-6 sm:p-8 bg-white rounded-3xl border border-slate-200 shadow-md space-y-5">
      {/* Brand Header */}
      <div className="text-center space-y-2 border-b pb-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-sm shadow-indigo-200">
          <GraduationCap className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Pusat Tuisyen An Nur (Telipot)</h2>
        <p className="text-xs text-slate-500">Borang Pendaftaran Ibu Bapa Dalam Talian (Imbasan QR)</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Nama Penuh Pelajar *</label>
          <input
            type="text"
            required
            placeholder="Nama anak anda"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">No. Kad Pengenalan *</label>
            <input
              type="text"
              required
              placeholder="090101-03-XXXX"
              value={formData.ic}
              onChange={(e) => setFormData({ ...formData, ic: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tingkatan *</label>
            <select
              value={formData.form}
              onChange={(e) => setFormData({ ...formData, form: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="F5">Tingkatan 5 (SPM)</option>
              <option value="F4">Tingkatan 4</option>
              <option value="F3">Tingkatan 3</option>
              <option value="F2">Tingkatan 2</option>
              <option value="F1">Tingkatan 1</option>
              <option value="S6">Darjah 6</option>
              <option value="S5">Darjah 5</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Sekolah *</label>
          <input
            type="text"
            required
            placeholder="SMK / SK..."
            value={formData.school}
            onChange={(e) => setFormData({ ...formData, school: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nama Ibu Bapa / Penjaga *</label>
            <input
              type="text"
              required
              placeholder="Nama anda"
              value={formData.parentName}
              onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">No. WhatsApp *</label>
            <input
              type="text"
              required
              placeholder="01X-XXXXXXX"
              value={formData.parentPhone}
              onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Subjects selection */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-semibold text-slate-700">Pilih Subjek (Minima 4 Subjek Menengah) *</label>
            <span className="font-bold text-indigo-600">{formData.subs.length} Dipilih</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {subjects.map((s) => {
              const active = formData.subs.includes(s);
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSub(s)}
                  className={`py-2 text-center rounded-lg font-bold transition ${
                    active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legal check */}
        <div className="space-y-2 pt-2 border-t text-[11px] text-slate-600">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.saps}
              onChange={(e) => setFormData({ ...formData, saps: e.target.checked })}
              className="mt-0.5"
            />
            <span>Membenarkan tuisyen menyemak keputusan di sapsnkra.moe.</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.terms}
              onChange={(e) => setFormData({ ...formData, terms: e.target.checked })}
              className="mt-0.5"
            />
            <span>Bersetuju menjelaskan yuran sebelum 7hb setiap bulan dan mematuhi syarat tuisyen.</span>
          </label>
        </div>

        <button
          type="submit"
          className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition shadow-sm mt-3"
        >
          Hantar Pendaftaran Pelajar
        </button>
      </form>
    </div>
  );
}