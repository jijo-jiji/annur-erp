import React, { useState } from 'react';
import { Sliders, Plus, Save, Edit3, Trash2, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function ManagementConfigView() {
  const [subTab, setSubTab] = useState('subjects');

  // 1. Dynamic Subject Catalog
  const [subjects, setSubjects] = useState([
    { code: 'FZ', name: 'Fizik', level: 'UPPER_SEC', stream: 'SAINS', active: true },
    { code: 'KIM', name: 'Kimia', level: 'UPPER_SEC', stream: 'SAINS', active: true },
    { code: 'BIO', name: 'Biologi', level: 'UPPER_SEC', stream: 'SAINS', active: true },
    { code: 'ADDMT', name: 'Matematik Tambahan', level: 'UPPER_SEC', stream: 'SAINS', active: true },
    { code: 'BI', name: 'Bahasa Inggeris', level: 'UPPER_SEC', stream: 'TERAS', active: true },
    { code: 'BM', name: 'Bahasa Melayu', level: 'UPPER_SEC', stream: 'TERAS', active: true },
    { code: 'MATH', name: 'Matematik', level: 'UPPER_SEC', stream: 'TERAS', active: true },
    { code: 'SAINS', name: 'Sains', level: 'UPPER_SEC', stream: 'SASTERA', active: true },
    { code: 'SEJ', name: 'Sejarah', level: 'UPPER_SEC', stream: 'TERAS', active: true },
    { code: 'ACC', name: 'Prinsip Perakaunan', level: 'UPPER_SEC', stream: 'SASTERA', active: true },
    { code: 'GEO_L', name: 'Geografi (Menengah Rendah)', level: 'LOWER_SEC', stream: 'TERAS', active: true },
  ]);

  const [newSub, setNewSub] = useState({ code: '', name: '', level: 'UPPER_SEC', stream: 'TERAS' });

  // 2. Dynamic Pricing Tiers (Secondary & Primary)
  const [pricingTiers, setPricingTiers] = useState([
    { id: 1, level: 'Sekolah Menengah', count: 4, ratePerSub: 60.0, total: 240.0 },
    { id: 2, level: 'Sekolah Menengah', count: 5, ratePerSub: 55.0, total: 275.0 },
    { id: 3, level: 'Sekolah Menengah', count: 6, ratePerSub: 55.0, total: 330.0 },
    { id: 4, level: 'Sekolah Menengah', count: 7, ratePerSub: 50.0, total: 350.0 },
    { id: 5, level: 'Sekolah Menengah', count: 8, ratePerSub: 50.0, total: 400.0 },
    { id: 6, level: 'Darjah 5', count: 2, ratePerSub: 50.0, total: 100.0 },
    { id: 7, level: 'Darjah 6', count: 4, ratePerSub: 50.0, total: 200.0 },
  ]);

  // 3. Operational Policies & Thresholds
  const [settings, setSettings] = useState({
    regFee: 30.0,
    sessionDuration: 90,
    defaultCapacity: 20,
    dueDay: 7,
    unpaidMonthsLimit: 2,
    permanentHourlyRate: 60.0,
    replacementHourlyRate: 55.0,
    annualIncrementPct: 5.0
  });

  const handleAddSubject = (e) => {
    e.preventDefault();
    if (!newSub.code || !newSub.name) return;
    setSubjects([...subjects, { ...newSub, active: true }]);
    setNewSub({ code: '', name: '', level: 'UPPER_SEC', stream: 'TERAS' });
    alert(`Subjek baru ${newSub.code} - ${newSub.name} berjaya ditambah!`);
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    alert("Semua tetapan perniagaan dan kadar yuran telah dikemaskini dan berkuatkuasa secara langsung tanpa perlu pengaturcara!");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Hab Konfigurasi Perniagaan (Self-Service)</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              Tanpa Pengaturcara (Zero-Dev)
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Dikhaskan untuk Pengurusan (Directors & Finance): Tukar subjek, kadar harga, elaun guru dan had kapasiti bilik darjah pada bila-bila masa.
          </p>
        </div>

        {/* Sub-tab Pills */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setSubTab('subjects')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              subTab === 'subjects' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Katalog Subjek
          </button>
          <button
            onClick={() => setSubTab('pricing')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              subTab === 'pricing' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Kadar Yuran & Pakej
          </button>
          <button
            onClick={() => setSubTab('policies')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              subTab === 'policies' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Polisi & Elaun Guru
          </button>
        </div>
      </div>

      {subTab === 'subjects' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Subject Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-600" /> Tambah Subjek Baru
            </h3>
            <form onSubmit={handleAddSubject} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kod Subjek (Singkatan) *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: EKON / PERN"
                  value={newSub.code}
                  onChange={(e) => setNewSub({ ...newSub, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 uppercase font-bold"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Subjek Penuh *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Ekonomi Asas"
                  value={newSub.name}
                  onChange={(e) => setNewSub({ ...newSub, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kategori Peringkat *</label>
                <select
                  value={newSub.level}
                  onChange={(e) => setNewSub({ ...newSub, level: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="UPPER_SEC">Menengah Atas (Form 4 - 5)</option>
                  <option value="LOWER_SEC">Menengah Rendah (Form 1 - 3)</option>
                  <option value="PRIMARY">Sekolah Rendah (Darjah 5 - 6)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Aliran *</label>
                <select
                  value={newSub.stream}
                  onChange={(e) => setNewSub({ ...newSub, stream: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="SAINS">Aliran Sains</option>
                  <option value="SASTERA">Aliran Sastera</option>
                  <option value="TERAS">Teras / Umum</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-sm"
              >
                + Simpan Subjek Baru
              </button>
            </form>
          </div>

          {/* Current Subjects List */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Senarai Subjek Aktif ({subjects.length})</h3>
              <span className="text-xs text-slate-400">Pusat Tuisyen An Nur Telipot</span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Kod</th>
                  <th className="py-3 px-4">Nama Subjek</th>
                  <th className="py-3 px-4">Peringkat</th>
                  <th className="py-3 px-4">Aliran</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjects.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-4 font-bold text-indigo-700">{s.code}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{s.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{s.level}</td>
                    <td className="py-2.5 px-4 text-slate-600">{s.stream}</td>
                    <td className="py-2.5 px-4 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Aktif
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'pricing' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Struktur Pakej Yuran Bulanan (Boleh Diedit Sendiri)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Peringkat Sekolah</th>
                    <th className="py-3 px-4">Bilangan Subjek</th>
                    <th className="py-3 px-4">Kadar per Subjek (RM)</th>
                    <th className="py-3 px-4">Jumlah Yuran (RM)</th>
                    <th className="py-3 px-4 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pricingTiers.map((pt) => (
                    <tr key={pt.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-semibold text-slate-900">{pt.level}</td>
                      <td className="py-3 px-4 font-bold text-indigo-700">{pt.count} Subjek</td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={pt.ratePerSub}
                          onChange={(e) => {
                            const newR = parseFloat(e.target.value);
                            setPricingTiers(
                              pricingTiers.map((p) => (p.id === pt.id ? { ...p, ratePerSub: newR, total: newR * p.count } : p))
                            );
                          }}
                          className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold"
                        />
                      </td>
                      <td className="py-3 px-4 font-extrabold text-emerald-700">RM {pt.total.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-[11px] text-indigo-600 font-semibold cursor-pointer hover:underline">
                          Simpan
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'policies' && (
        <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-2xl">
          <h3 className="text-sm font-bold text-slate-900 border-b pb-2">Polisi Operasi, Had Kapasiti & Elaun Guru</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Yuran Pendaftaran Rasmi (RM)</label>
              <input
                type="number"
                value={settings.regFee}
                onChange={(e) => setSettings({ ...settings, regFee: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kapasiti Kerusi Bilik Darjah (Maksimum)</label>
              <input
                type="number"
                value={settings.defaultCapacity}
                onChange={(e) => setSettings({ ...settings, defaultCapacity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kadar Sesi Guru Permanent (RM / 1.5 Jam)</label>
              <input
                type="number"
                value={settings.permanentHourlyRate}
                onChange={(e) => setSettings({ ...settings, permanentHourlyRate: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-emerald-700"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kadar Sesi Guru Ganti (RM / 1.5 Jam)</label>
              <input
                type="number"
                value={settings.replacementHourlyRate}
                onChange={(e) => setSettings({ ...settings, replacementHourlyRate: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-blue-700"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tarikh Akhir Bayaran Bulanan (HB)</label>
              <input
                type="number"
                value={settings.dueDay}
                onChange={(e) => setSettings({ ...settings, dueDay: parseInt(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Had Bulan Tertunggak Sebelum Diberhentikan</label>
              <input
                type="number"
                value={settings.unpaidMonthsLimit}
                onChange={(e) => setSettings({ ...settings, unpaidMonthsLimit: parseInt(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
              />
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-sm"
            >
              Simpan Semua Tetapan Perniagaan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}