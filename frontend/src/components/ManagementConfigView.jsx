import React, { useEffect, useState } from 'react';
import { Plus, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { configApi, dashboardApi } from '../api/client';

const LEVELS = [
  { value: 'UPPER_SEC', label: 'Menengah Atas (F4-F5)' },
  { value: 'LOWER_SEC', label: 'Menengah Rendah (F1-F3)' },
  { value: 'PRIMARY', label: 'Sekolah Rendah (Darjah 5-6)' },
];
const STREAMS = [
  { value: 'TERAS', label: 'Teras / Umum' },
  { value: 'SAINS', label: 'Aliran Sains' },
  { value: 'SASTERA', label: 'Aliran Sastera' },
];
const TIER_LABELS = {
  SECONDARY: 'Sekolah Menengah',
  DARJAH_5: 'Darjah 5',
  DARJAH_6: 'Darjah 6',
  WALK_IN: 'Walk-in',
};
// Business settings shown on the policy form, in display order
const POLICY_KEYS = [
  { key: 'REGISTRATION_FEE', label: 'Yuran Pendaftaran (RM)' },
  { key: 'DEFAULT_CLASS_CAPACITY', label: 'Had Kerusi Lalai Setiap Kelas' },
  { key: 'MONTHLY_DUE_DAY', label: 'Tarikh Akhir Bayaran Bulanan (hb)' },
  { key: 'UNPAID_TERMINATION_MONTHS', label: 'Had Bulan Tertunggak Sebelum Diberhentikan' },
  { key: 'WITHDRAWAL_NOTICE_WEEKS', label: 'Notis Berhenti (minggu)' },
  { key: 'SESSION_DURATION_MINUTES', label: 'Tempoh Sesi (minit)' },
];
const LEVEL_LABELS = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]));
const STREAM_LABELS = Object.fromEntries(STREAMS.map((s) => [s.value, s.label]));

export default function ManagementConfigView({ currentRole = 'MANAGEMENT' }) {
  const { subjects, setSubjects, pricingTiers, setPricingTiers, showToast } = useApp();
  const [subTab, setSubTab] = useState('subjects');
  const [newSub, setNewSub] = useState({ code: '', name: '', level_category: 'UPPER_SEC', stream: 'TERAS' });
  const [tierEdits, setTierEdits] = useState({});
  const [settings, setSettings] = useState([]);
  const [settingEdits, setSettingEdits] = useState({});
  const [teacherRates, setTeacherRates] = useState([]);
  const [rateEdits, setRateEdits] = useState({});
  const [saving, setSaving] = useState(false);

  const isManagement = currentRole === 'MANAGEMENT';
  const canEditCatalog = currentRole === 'SUPERVISOR' || isManagement;

  useEffect(() => {
    if (currentRole === 'ADMIN') return;
    Promise.all([dashboardApi.getSettings(), dashboardApi.getTeacherRates()])
      .then(([s, r]) => {
        setSettings(s);
        setTeacherRates(r);
      })
      .catch(() => showToast('Gagal memuat tetapan perniagaan.', 'error'));
  }, [currentRole, showToast]);

  if (currentRole === 'ADMIN') {
    return (
      <div className="bg-white rounded-3xl border border-rose-200 p-8 text-center max-w-xl mx-auto my-12 space-y-3 shadow-sm">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Akses Terhad</h2>
        <p className="text-xs text-slate-600">
          Konfigurasi perniagaan dikhaskan untuk Supervisor dan Management.
        </p>
      </div>
    );
  }

  const handleAddSubject = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await configApi.createSubject({ ...newSub, code: newSub.code.trim(), name: newSub.name.trim() });
      setSubjects((prev) => [...prev, created]);
      setNewSub({ code: '', name: '', level_category: 'UPPER_SEC', stream: 'TERAS' });
      showToast(`Subjek ${created.code} - ${created.name} ditambah.`);
    } catch (err) {
      showToast(err.data?.code?.[0] || err.message || 'Ralat menambah subjek.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleSubject = async (sub) => {
    try {
      const updated = await configApi.updateSubject(sub.id, { is_active: !sub.is_active });
      setSubjects((prev) => prev.map((s) => (s.id === sub.id ? updated : s)));
    } catch (err) {
      showToast(err.message || 'Ralat mengemaskini subjek.', 'error');
    }
  };

  const saveTier = async (tier) => {
    const rate = parseFloat(tierEdits[tier.id]);
    if (Number.isNaN(rate) || rate < 0) return;
    try {
      const updated = await configApi.updatePricingTier(tier.id, {
        price_per_subject: rate.toFixed(2),
        total_price: (rate * tier.subject_count).toFixed(2),
      });
      setPricingTiers((prev) => prev.map((t) => (t.id === tier.id ? updated : t)));
      setTierEdits(({ [tier.id]: _saved, ...rest }) => rest);
      showToast(`Pakej ${TIER_LABELS[tier.level_category] || tier.level_category} ${tier.subject_count} subjek dikemaskini.`);
    } catch (err) {
      showToast(err.message || 'Ralat menyimpan kadar yuran.', 'error');
    }
  };

  const savePolicies = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const settingUpdates = Object.entries(settingEdits).map(([id, value]) => configApi.updateSetting(id, { value }));
      const rateUpdates = Object.entries(rateEdits).map(([id, data]) => configApi.updateTeacherRate(id, data));
      await Promise.all([...settingUpdates, ...rateUpdates]);
      const [s, r] = await Promise.all([dashboardApi.getSettings(), dashboardApi.getTeacherRates()]);
      setSettings(s);
      setTeacherRates(r);
      setSettingEdits({});
      setRateEdits({});
      showToast('Tetapan perniagaan disimpan.');
    } catch (err) {
      showToast(err.message || 'Ralat menyimpan tetapan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const settingsByKey = Object.fromEntries(settings.map((s) => [s.key, s]));
  const hasPolicyChanges = Object.keys(settingEdits).length > 0 || Object.keys(rateEdits).length > 0;
  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 font-bold disabled:bg-slate-50 disabled:text-slate-500';
  const tabs = [
    { id: 'subjects', label: 'Katalog Subjek' },
    { id: 'pricing', label: 'Kadar Yuran & Pakej' },
    { id: 'policies', label: 'Polisi & Kadar Guru' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Hab Konfigurasi Perniagaan</h2>
          <p className="text-xs text-slate-500">
            Subjek, kadar yuran, polisi operasi dan kadar asas guru. Perubahan berkuat kuasa serta-merta.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                subTab === t.id ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'subjects' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {canEditCatalog && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 h-fit">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" /> Tambah Subjek
              </h3>
              <form onSubmit={handleAddSubject} className="space-y-3 text-xs">
                <div>
                  <label htmlFor="sub-code" className="block font-semibold text-slate-700 mb-1">Kod Subjek *</label>
                  <input id="sub-code" required value={newSub.code} onChange={(e) => setNewSub({ ...newSub, code: e.target.value.toUpperCase() })} className={`${inputCls} uppercase`} />
                </div>
                <div>
                  <label htmlFor="sub-name" className="block font-semibold text-slate-700 mb-1">Nama Subjek *</label>
                  <input id="sub-name" required value={newSub.name} onChange={(e) => setNewSub({ ...newSub, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label htmlFor="sub-level" className="block font-semibold text-slate-700 mb-1">Peringkat *</label>
                  <select id="sub-level" value={newSub.level_category} onChange={(e) => setNewSub({ ...newSub, level_category: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                    {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="sub-stream" className="block font-semibold text-slate-700 mb-1">Aliran *</label>
                  <select id="sub-stream" value={newSub.stream} onChange={(e) => setNewSub({ ...newSub, stream: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                    {STREAMS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-sm disabled:opacity-60">
                  Simpan Subjek
                </button>
              </form>
            </div>
          )}

          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Senarai Subjek ({subjects.length})</h3>
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
                {subjects.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-4 font-bold text-indigo-700">{s.code}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{s.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{LEVEL_LABELS[s.level_category] || s.level_category}</td>
                    <td className="py-2.5 px-4 text-slate-600">{STREAM_LABELS[s.stream] || s.stream}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => canEditCatalog && toggleSubject(s)}
                        disabled={!canEditCatalog}
                        title={canEditCatalog ? 'Klik untuk tukar status' : undefined}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        } ${canEditCatalog ? 'cursor-pointer hover:ring-2 hover:ring-indigo-200' : ''}`}
                      >
                        {s.is_active ? 'Aktif' : 'Tidak Aktif'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'pricing' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Pakej Yuran Bulanan</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Peringkat</th>
                  <th className="py-3 px-4">Bilangan Subjek</th>
                  <th className="py-3 px-4">Kadar / Subjek (RM)</th>
                  <th className="py-3 px-4">Jumlah (RM)</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pricingTiers.map((pt) => {
                  const edited = tierEdits[pt.id];
                  const rate = edited !== undefined ? parseFloat(edited) || 0 : parseFloat(pt.price_per_subject);
                  return (
                    <tr key={pt.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-semibold text-slate-900">{TIER_LABELS[pt.level_category] || pt.level_category}</td>
                      <td className="py-3 px-4 font-bold text-indigo-700">{pt.subject_count} subjek</td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={`Kadar per subjek, ${pt.subject_count} subjek`}
                          disabled={!canEditCatalog}
                          value={edited ?? pt.price_per_subject}
                          onChange={(e) => setTierEdits({ ...tierEdits, [pt.id]: e.target.value })}
                          className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold disabled:bg-slate-50"
                        />
                      </td>
                      <td className="py-3 px-4 font-extrabold text-emerald-700">RM {(rate * pt.subject_count).toFixed(2)}</td>
                      <td className="py-3 px-4 text-right">
                        {edited !== undefined && (
                          <button onClick={() => saveTier(pt)} className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[11px] hover:bg-indigo-700 cursor-pointer">
                            Simpan
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'policies' && (
        <form onSubmit={savePolicies} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 max-w-2xl">
          {!isManagement && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-900 text-xs">
              Polisi dan kadar asas guru hanya boleh diubah oleh Management.
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-900 border-b pb-2 mb-3">Polisi Operasi</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {POLICY_KEYS.filter((p) => settingsByKey[p.key]).map((p) => {
                const setting = settingsByKey[p.key];
                return (
                  <div key={p.key}>
                    <label htmlFor={`set-${p.key}`} className="block font-semibold text-slate-700 mb-1">{p.label}</label>
                    <input
                      id={`set-${p.key}`}
                      type="number"
                      step="any"
                      disabled={!isManagement}
                      value={settingEdits[setting.id] ?? setting.value}
                      onChange={(e) => setSettingEdits({ ...settingEdits, [setting.id]: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900 border-b pb-2 mb-3">Kadar Asas Guru (setiap sesi 1.5 jam)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {teacherRates.map((r) => {
                const edit = rateEdits[r.id] || {};
                const label = r.teacher_type === 'PERMANENT' ? 'Guru Tetap' : 'Guru Ganti';
                return (
                  <div key={r.id} className="space-y-2">
                    <div>
                      <label htmlFor={`rate-${r.id}`} className="block font-semibold text-slate-700 mb-1">{label}: Kadar Asas (RM)</label>
                      <input
                        id={`rate-${r.id}`}
                        type="number"
                        step="0.01"
                        disabled={!isManagement}
                        value={edit.base_rate_per_session ?? r.base_rate_per_session}
                        onChange={(e) => setRateEdits({ ...rateEdits, [r.id]: { ...edit, base_rate_per_session: e.target.value } })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor={`inc-${r.id}`} className="block font-semibold text-slate-700 mb-1">{label}: Kenaikan Tahunan (%)</label>
                      <input
                        id={`inc-${r.id}`}
                        type="number"
                        step="0.01"
                        disabled={!isManagement}
                        value={edit.annual_increment_pct ?? r.annual_increment_pct}
                        onChange={(e) => setRateEdits({ ...rateEdits, [r.id]: { ...edit, annual_increment_pct: e.target.value } })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Kadar setiap guru diubah melalui cadangan kenaikan di halaman Guru.
            </p>
          </div>

          {isManagement && (
            <button
              type="submit"
              disabled={saving || !hasPolicyChanges}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-sm disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : 'Simpan Tetapan'}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
