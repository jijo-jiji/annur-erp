import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Search, MessageSquare, Phone, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useGrades } from './grades';
import { studentsApi } from '../api/client';
import StudentDetailModal from './StudentDetailModal';
import { FeedbackGallery } from './FeedbackViews';
import PromotionPanel from './PromotionPanel';
import { STATUS_META, waLink, today, downloadCsv, estimateMonthlyFee } from './studentShared';

const EMPTY_FORM = {
  full_name: '', ic_number: '', student_type: 'MONTHLY', form_level: 'F5', stream: 'GENERAL',
  school_key: '', phone_number: '', home_phone: '', email: '', address: '', lead_source: '', join_date: today(),
  parent1_name: '', parent1_phone: '', parent1_email: '', parent1_age: '', parent1_occupation: '', parent1_relation: 'Bapa',
  parent2_name: '', parent2_phone: '', parent2_email: '', parent2_age: '', parent2_occupation: '', parent2_relation: 'Ibu',
  preferred_contact: 'PARENT_1', class_ids: [], walk_in_description: '', walk_in_subjects: [],
  saps_consent: true, agree_terms: false,
};

const HISTORY_TYPES = [
  { value: 'REGISTERED', label: 'Pendaftaran' },
  { value: 'ADD_SUBJECT,DROP_SUBJECT,CHANGE_CLASS', label: 'Tambah / Gugur / Tukar Subjek' },
  { value: 'ON_HOLD,RESUME', label: 'Tangguh / Aktif Semula' },
  { value: 'TERMINATE', label: 'Berhenti' },
  { value: 'NOTE', label: 'Catatan' },
  { value: 'FEEDBACK', label: 'Maklum Balas' },
];

function schoolCategory(option) {
  if (!option) return '';
  if (option.meta?.category) return option.meta.category;
  const first = option.label.split(' ')[0];
  return ['SMK', 'SK', 'SMKA', 'SBP', 'MRSM', 'Maahad'].includes(first) ? first : '';
}

function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().split('T')[0];
}

export default function StudentRegistrationView({ currentRole = 'ADMIN' }) {
  const { forms, formLabel, isForm } = useGrades();
  const {
    students, timetable, subjects, pricingTiers, registerStudent, studentAction, refreshStudents,
    getMasterOptions, draftRegistration, setDraftRegistration, showToast,
  } = useApp();
  const [activeTab, setActiveTab] = useState('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [formFilter, setFormFilter] = useState('ALL');
  const [detailId, setDetailId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [waitlist, setWaitlist] = useState([]);
  const [historyFilter, setHistoryFilter] = useState({ start: today(), end: today(), type: '' });
  const [historyRows, setHistoryRows] = useState([]);

  const canApprove = currentRole === 'SUPERVISOR' || currentRole === 'MANAGEMENT';
  const schools = getMasterOptions('6_school');
  const leadSources = getMasterOptions('3_lead_source');
  const ageBands = getMasterOptions('7_parent_age');

  // Lead converted from the funnel: prefill the form
  useEffect(() => {
    if (!draftRegistration) return;
    const school = schools.find((s) => s.label === (draftRegistration.school_name || ''));
    setFormData({
      ...EMPTY_FORM,
      full_name: draftRegistration.student_name || draftRegistration.full_name || '',
      parent1_name: draftRegistration.parent_name || draftRegistration.parent1_name || '',
      phone_number: draftRegistration.phone || draftRegistration.phone_number || '',
      parent1_phone: draftRegistration.phone || '',
      email: draftRegistration.email || '',
      form_level: isForm(draftRegistration.form_level) ? draftRegistration.form_level : 'F5',
      school_key: school?.value || '',
      lead_source: draftRegistration.lead_source || '',
    });
    setActiveTab('register');
    setDraftRegistration(null);
  }, [draftRegistration, setDraftRegistration, schools]);

  const loadWaitlist = useCallback(() => {
    studentsApi.waitlist().then(setWaitlist).catch(() => {});
  }, []);
  useEffect(() => { loadWaitlist(); }, [loadWaitlist, students]);

  const loadHistory = useCallback(() => {
    const params = { start: historyFilter.start, end: historyFilter.end };
    if (historyFilter.type) params.type = historyFilter.type;
    studentsApi.history(params).then(setHistoryRows).catch(() => showToast('Gagal memuat sejarah pelajar.', 'error'));
  }, [historyFilter, showToast]);
  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  const counts = useMemo(() => students.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {}), [students]);
  const pending = students.filter((s) => s.status === 'PENDING');

  const term = search.trim().toLowerCase();
  const listed = students.filter((s) =>
    (statusFilter === 'ALL' || s.status === statusFilter) &&
    (formFilter === 'ALL' || s.form_level === formFilter) &&
    (!term || [s.full_name, s.student_id, s.ic_number, s.school_name, s.parent1_name, s.phone_number]
      .some((v) => (v || '').toLowerCase().includes(term)))
  );

  const formClasses = useMemo(() => timetable
    .filter((c) => c.form_level === formData.form_level)
    .sort((a, b) => a.class_code.localeCompare(b.class_code)), [timetable, formData.form_level]);
  const levelSubjects = subjects.filter((s) => s.is_active);
  const feeEstimate = estimateMonthlyFee(pricingTiers, formData.form_level, formData.class_ids.length);

  const set = (patch) => setFormData((prev) => ({ ...prev, ...patch }));
  const toggleIn = (key, id) => set({ [key]: formData[key].includes(id) ? formData[key].filter((x) => x !== id) : [...formData[key], id] });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.agree_terms) {
      showToast('Sila tandakan persetujuan syarat pembayaran.', 'error');
      return;
    }
    const school = schools.find((s) => s.value === formData.school_key);
    const { school_key: _k, agree_terms: _a, ...rest } = formData;
    setSubmitting(true);
    try {
      await registerStudent({
        ...rest,
        school_name: school?.label || '',
        school_code: school?.meta?.kod || '',
        school_category: schoolCategory(school),
        agree_terms_7th_payment: true,
        agree_terms_2months_auto_drop: true,
        agree_terms_2weeks_notice: true,
        class_ids: formData.student_type === 'MONTHLY' ? formData.class_ids : [],
        walk_in_subjects: formData.student_type === 'WALK_IN' ? formData.walk_in_subjects : [],
      });
      setFormData({ ...EMPTY_FORM, join_date: today() });
      setStatusFilter('PENDING');
      setActiveTab('list');
    } catch {
      // toast already shown
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (student, approve) => {
    const comment = approve ? (window.prompt('Catatan kelulusan (pilihan):') ?? null) : window.prompt('Sebab penolakan (wajib):');
    if (comment === null || (!approve && !comment.trim())) return;
    await studentAction(student.id, approve ? 'approve' : 'reject', { comment: comment.trim() },
      approve ? `${student.full_name} diluluskan. Invois pertama dijana.` : `Pendaftaran ${student.full_name} ditolak.`).catch(() => {});
  };

  const waitlistAct = async (entry, action) => {
    try {
      await studentsApi.waitlistAction(entry.id, action);
      await refreshStudents();
      loadWaitlist();
      showToast(action === 'enroll' ? `${entry.student_name} dimasukkan ke ${entry.class_code}.` : 'Senarai menunggu dibatalkan.');
    } catch (err) {
      showToast(err.message || 'Ralat.', 'error');
    }
  };

  const exportList = () => downloadCsv(`senarai-pelajar-${statusFilter.toLowerCase()}-${today()}.csv`,
    ['ID', 'Nama', 'Tingkatan', 'Jenis', 'Status', 'Sekolah', 'Telefon Pelajar', 'Waris', 'Telefon Waris', 'Kelas'],
    listed.map((s) => [s.student_id, s.full_name, formLabel(s.form_level), s.student_type, STATUS_META[s.status]?.label,
      s.school_name, s.phone_number, s.parent1_name, s.parent1_phone,
      (s.enrolled_classes_details || []).map((c) => c.class_code).join('; ')]));

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white outline-none focus:border-indigo-500';
  const label = 'block font-semibold text-slate-700 mb-1';
  const tabs = [
    { id: 'list', label: `Direktori Pelajar (${students.length})` },
    { id: 'register', label: '+ Daftar Baharu' },
    { id: 'approvals', label: `Kelulusan (${pending.length})` },
    { id: 'waitlist', label: `Senarai Menunggu (${waitlist.length})` },
    { id: 'history', label: 'Laporan Sejarah' },
    { id: 'gallery', label: 'Galeri Maklum Balas' },
    ...(currentRole === 'SUPERVISOR' || currentRole === 'MANAGEMENT' ? [{ id: 'promote', label: 'Naik Tingkatan' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Pendaftaran & Pelajar</h2>
          <p className="text-xs text-slate-500">Pendaftaran menunggu kelulusan Supervisor sebelum aktif dan invois pertama dijana.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${activeTab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* DIRECTORY */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input type="search" aria-label="Cari pelajar" placeholder="Cari ID, nama, IC, sekolah, waris…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-indigo-500" />
            </div>
            <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold">
              <option value="ALL">Semua status ({students.length})</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label} ({counts[k] || 0})</option>)}
            </select>
            <select aria-label="Tingkatan" value={formFilter} onChange={(e) => setFormFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold">
              <option value="ALL">Semua tingkatan</option>
              {forms.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <button onClick={exportList} className="ml-auto px-3 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1.5 cursor-pointer">
              <Download className="w-3.5 h-3.5" /> Eksport CSV / Excel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-3">ID</th>
                  <th className="py-3 px-3">Nama Pelajar</th>
                  <th className="py-3 px-3">Tingkatan</th>
                  <th className="py-3 px-3">Sekolah</th>
                  <th className="py-3 px-3">Kelas</th>
                  <th className="py-3 px-3">Waris</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Hubungi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listed.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-400">Tiada pelajar sepadan.</td></tr>}
                {listed.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(s.id)}>
                    <td className="py-3 px-3 font-mono font-bold text-indigo-700">{s.student_id}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{s.full_name}</div>
                      <div className="text-slate-400 text-[10px]">{s.ic_number}{s.student_type === 'WALK_IN' ? ' • Walk-in' : ''}</div>
                    </td>
                    <td className="py-3 px-3"><span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px]">{s.form_level}</span></td>
                    <td className="py-3 px-3 text-slate-700">{s.school_name || '-'}</td>
                    <td className="py-3 px-3 text-slate-700">
                      {(s.enrolled_classes_details || []).length}
                      {(s.waiting_for || []).length > 0 && <span className="text-amber-700"> (+{s.waiting_for.length} menunggu)</span>}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-800">{s.parent1_name}</div>
                      <div className="text-slate-500 text-[11px]">{s.parent1_phone}</div>
                    </td>
                    <td className="py-3 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_META[s.status]?.cls}`}>{STATUS_META[s.status]?.label}</span></td>
                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex gap-1.5">
                        <a href={waLink(s.parent1_phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${s.parent1_name}`} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"><MessageSquare className="w-3.5 h-3.5" /></a>
                        <a href={`tel:${s.parent1_phone}`} aria-label={`Panggil ${s.parent1_name}`} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"><Phone className="w-3.5 h-3.5" /></a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">Klik pelajar untuk kelas, tambah/gugur subjek, tangguh, berhenti, keputusan dan sejarah.</p>
        </div>
      )}

      {/* REGISTRATION FORM */}
      {activeTab === 'register' && (
        <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl mx-auto text-xs">
          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><UserPlus className="w-4 h-4 text-indigo-600" /> 1. Maklumat Pelajar</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label htmlFor="r-name" className={label}>Nama Penuh *</label><input id="r-name" required value={formData.full_name} onChange={(e) => set({ full_name: e.target.value })} className={inputCls} /></div>
              <div><label htmlFor="r-ic" className={label}>No. Kad Pengenalan / Sijil Lahir *</label><input id="r-ic" required value={formData.ic_number} onChange={(e) => set({ ic_number: e.target.value })} className={inputCls} /></div>
              <div>
                <label htmlFor="r-type" className={label}>Jenis Pelajar *</label>
                <select id="r-type" value={formData.student_type} onChange={(e) => set({ student_type: e.target.value })} className={inputCls}>
                  <option value="MONTHLY">Bulanan</option>
                  <option value="WALK_IN">Walk-in</option>
                </select>
              </div>
              <div>
                <label htmlFor="r-form" className={label}>Tingkatan *</label>
                <select id="r-form" value={formData.form_level} onChange={(e) => set({ form_level: e.target.value, class_ids: [] })} className={inputCls}>
                  {forms.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="r-school" className={label}>Sekolah *</label>
                <select id="r-school" required value={formData.school_key} onChange={(e) => set({ school_key: e.target.value })} className={inputCls}>
                  <option value="">Pilih sekolah…</option>
                  {schools.map((s) => <option key={s.value} value={s.value}>{s.label}{s.meta?.kod ? ` (${s.meta.kod})` : ''}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Tiada dalam senarai? Cadangkan sekolah baharu di Data Induk.</p>
              </div>
              <div>
                <label htmlFor="r-stream" className={label}>Aliran</label>
                <select id="r-stream" value={formData.stream} onChange={(e) => set({ stream: e.target.value })} className={inputCls}>
                  <option value="GENERAL">Umum</option>
                  <option value="SAINS">Sains</option>
                  <option value="SASTERA">Sastera</option>
                </select>
              </div>
              <div><label htmlFor="r-phone" className={label}>Telefon Pelajar *</label><input id="r-phone" required type="tel" value={formData.phone_number} onChange={(e) => set({ phone_number: e.target.value })} className={inputCls} /></div>
              <div><label htmlFor="r-email" className={label}>E-mel</label><input id="r-email" type="email" value={formData.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} /></div>
              <div className="md:col-span-2"><label htmlFor="r-addr" className={label}>Alamat</label><textarea id="r-addr" rows="2" value={formData.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} /></div>
              <div>
                <label htmlFor="r-source" className={label}>Sumber (Lead Source)</label>
                <select id="r-source" value={formData.lead_source} onChange={(e) => set({ lead_source: e.target.value })} className={inputCls}>
                  <option value="">Pilih…</option>
                  {leadSources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div><label htmlFor="r-join" className={label}>Tarikh Daftar</label><input id="r-join" type="date" value={formData.join_date} onChange={(e) => set({ join_date: e.target.value })} className={inputCls} /></div>
            </div>
          </section>

          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900">2. Ibu Bapa / Penjaga (tandakan hubungan utama)</h3>
            {[1, 2].map((n) => (
              <div key={n} className="p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">Penjaga {n}{n === 1 ? ' *' : ' (pilihan)'}</span>
                  <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
                    <input type="radio" name="preferred" checked={formData.preferred_contact === `PARENT_${n}`} onChange={() => set({ preferred_contact: `PARENT_${n}` })} />
                    Hubungan utama
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label htmlFor={`p${n}-name`} className={label}>Nama{n === 1 && ' *'}</label><input id={`p${n}-name`} required={n === 1} value={formData[`parent${n}_name`]} onChange={(e) => set({ [`parent${n}_name`]: e.target.value })} className={inputCls} /></div>
                  <div><label htmlFor={`p${n}-phone`} className={label}>Telefon{n === 1 && ' *'}</label><input id={`p${n}-phone`} type="tel" required={n === 1} value={formData[`parent${n}_phone`]} onChange={(e) => set({ [`parent${n}_phone`]: e.target.value })} className={inputCls} /></div>
                  <div><label htmlFor={`p${n}-email`} className={label}>E-mel</label><input id={`p${n}-email`} type="email" value={formData[`parent${n}_email`]} onChange={(e) => set({ [`parent${n}_email`]: e.target.value })} className={inputCls} /></div>
                  <div>
                    <label htmlFor={`p${n}-rel`} className={label}>Hubungan</label>
                    <select id={`p${n}-rel`} value={formData[`parent${n}_relation`]} onChange={(e) => set({ [`parent${n}_relation`]: e.target.value })} className={inputCls}>
                      {['Bapa', 'Ibu', 'Penjaga'].map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`p${n}-age`} className={label}>Umur</label>
                    <select id={`p${n}-age`} value={formData[`parent${n}_age`]} onChange={(e) => set({ [`parent${n}_age`]: e.target.value })} className={inputCls}>
                      <option value="">Pilih…</option>
                      {ageBands.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                  <div><label htmlFor={`p${n}-occ`} className={label}>Pekerjaan</label><input id={`p${n}-occ`} value={formData[`parent${n}_occupation`]} onChange={(e) => set({ [`parent${n}_occupation`]: e.target.value })} className={inputCls} /></div>
                </div>
              </div>
            ))}
          </section>

          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            {formData.student_type === 'MONTHLY' ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">3. Kelas {formLabel(formData.form_level)} (baki tempat semasa)</h3>
                  <span className="font-bold text-indigo-700">{formData.class_ids.length} subjek • anggaran RM {feeEstimate.toFixed(2)}/bulan</span>
                </div>
                {formClasses.length === 0 ? <p className="text-slate-400">Tiada kelas untuk tingkatan ini dalam Jadual Master.</p> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {formClasses.map((c) => {
                      const selected = formData.class_ids.includes(c.id);
                      const full = c.available_seats <= 0;
                      return (
                        <button type="button" key={c.id} onClick={() => toggleIn('class_ids', c.id)} aria-pressed={selected}
                          className={`p-3 rounded-xl border text-left transition cursor-pointer ${selected ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                          <div className="font-bold">{c.class_code}</div>
                          <div className={selected ? 'text-indigo-100' : 'text-slate-500'}>{c.day} {c.period_label}</div>
                          <div className={`mt-1 font-bold ${selected ? 'text-white' : full ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {c.current_enrolled}/{c.max_seats} • {full ? `${c.available_seats === 0 ? 'Penuh' : `Lebih ${Math.abs(c.available_seats)}`}: senarai menunggu` : `baki ${c.available_seats}`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-slate-500">Anggaran daripada pakej yuran semasa. Invois sebenar (termasuk yuran pendaftaran) dijana selepas Supervisor meluluskan. Kelas penuh akan dimasukkan ke senarai menunggu.</p>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-slate-900">3. Walk-in</h3>
                <div><label htmlFor="r-wi" className={label}>Keterangan walk-in</label><textarea id="r-wi" rows="2" value={formData.walk_in_description} onChange={(e) => set({ walk_in_description: e.target.value })} className={inputCls} /></div>
                <div>
                  <span className={label}>Subjek walk-in</span>
                  <div className="flex flex-wrap gap-1.5">
                    {levelSubjects.map((s) => (
                      <button type="button" key={s.id} onClick={() => toggleIn('walk_in_subjects', s.id)} aria-pressed={formData.walk_in_subjects.includes(s.id)}
                        className={`px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer ${formData.walk_in_subjects.includes(s.id) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white border-slate-200'}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2 text-slate-700">
            <h3 className="text-sm font-bold text-slate-900">4. Perakuan</h3>
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input type="checkbox" checked={formData.saps_consent} onChange={(e) => set({ saps_consent: e.target.checked })} className="mt-0.5" />
              <span>Membenarkan pusat tuisyen menyemak keputusan peperiksaan di <code>sapsnkra.moe</code>.</span>
            </label>
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input type="checkbox" checked={formData.agree_terms} onChange={(e) => set({ agree_terms: e.target.checked })} className="mt-0.5" />
              <span>Bersetuju menjelaskan yuran sebelum 7hb setiap bulan, memberi notis 2 minggu sebelum berhenti, dan polisi penamatan jika tertunggak 2 bulan. *</span>
            </label>
          </section>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setFormData({ ...EMPTY_FORM, join_date: today() }); setActiveTab('list'); }} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold">Batal</button>
            <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-60">
              {submitting ? 'Menyimpan…' : 'Hantar untuk Kelulusan'}
            </button>
          </div>
        </form>
      )}

      {/* APPROVAL QUEUE */}
      {activeTab === 'approvals' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Pendaftaran Menunggu Kelulusan</h3>
            <p className="text-slate-500">Termasuk pendaftaran dari kaunter, borang QR ibu bapa dan prospek. Kelulusan menjana invois pertama.</p>
          </div>
          {pending.length === 0 ? <p className="py-10 text-center text-slate-400">Tiada pendaftaran menunggu.</p> : (
            <div className="divide-y divide-slate-100">
              {pending.map((s) => (
                <div key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <button onClick={() => setDetailId(s.id)} className="text-left cursor-pointer">
                    <div className="font-bold text-slate-900">{s.full_name} <span className="font-mono text-indigo-600">({s.student_id})</span> <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">{s.form_level}</span></div>
                    <div className="text-slate-500">
                      {s.school_name || 'Sekolah tidak dinyatakan'} • Waris: {s.parent1_name} ({s.parent1_phone}) • {s.join_date}
                    </div>
                    <div className="text-slate-500">
                      Kelas: {(s.enrolled_classes_details || []).map((c) => c.class_code).join(', ') || 'belum ditetapkan'}
                      {(s.waiting_for || []).length > 0 && ` • Menunggu: ${s.waiting_for.map((w) => w.class_code).join(', ')}`}
                    </div>
                  </button>
                  {canApprove ? (
                    <div className="flex gap-2">
                      <button onClick={() => decide(s, false)} className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold cursor-pointer">Tolak</button>
                      <button onClick={() => decide(s, true)} className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer">Luluskan</button>
                    </div>
                  ) : <span className="text-slate-400 italic">Menunggu Supervisor</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WAITING LIST */}
      {activeTab === 'waitlist' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Senarai Menunggu Kelas Penuh</h3>
            <p className="text-slate-500">Supervisor/Management boleh memasukkan pelajar walaupun melebihi had kerusi.</p>
          </div>
          {waitlist.length === 0 ? <p className="py-10 text-center text-slate-400">Tiada pelajar dalam senarai menunggu.</p> : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Sejak</th><th className="px-3">Pelajar</th><th className="px-3">Kelas</th><th className="px-3">Kerusi</th><th className="px-3 text-right">Tindakan</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {waitlist.map((w) => {
                  const cls = timetable.find((c) => c.id === w.timetable_class);
                  return (
                    <tr key={w.id}>
                      <td className="py-2.5 px-3">{w.created_at?.slice(0, 10)}</td>
                      <td className="px-3 font-semibold">{w.student_name} <span className="text-slate-400">({w.student_code}{w.student_status === 'PENDING' ? ', belum lulus' : ''})</span></td>
                      <td className="px-3">{w.class_code}</td>
                      <td className="px-3">{cls ? `${cls.current_enrolled}/${cls.max_seats}` : '-'}</td>
                      <td className="px-3 text-right space-x-1.5">
                        {canApprove && <button onClick={() => waitlistAct(w, 'enroll')} className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-semibold cursor-pointer">Masukkan</button>}
                        <button onClick={() => waitlistAct(w, 'cancel')} className="px-3 py-1 rounded-lg border border-slate-200 font-semibold cursor-pointer">Batal</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* HISTORY REPORT (daily / weekly / monthly / custom) */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <span className="block font-semibold text-slate-600 mb-1">Tempoh</span>
              <div className="flex gap-1">
                {[['Hari ini', today(), today()], ['Minggu ini', startOfWeek(), today()], ['Bulan ini', today().slice(0, 8) + '01', today()]].map(([name, start, end]) => (
                  <button key={name} onClick={() => setHistoryFilter({ ...historyFilter, start, end })}
                    className={`px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer ${historyFilter.start === start && historyFilter.end === end ? 'bg-indigo-600 text-white border-indigo-700' : 'border-slate-200'}`}>{name}</button>
                ))}
              </div>
            </div>
            <label className="font-semibold text-slate-600">Dari<input type="date" value={historyFilter.start} onChange={(e) => setHistoryFilter({ ...historyFilter, start: e.target.value })} className="block px-2 py-1.5 rounded-lg border border-slate-200" /></label>
            <label className="font-semibold text-slate-600">Hingga<input type="date" value={historyFilter.end} onChange={(e) => setHistoryFilter({ ...historyFilter, end: e.target.value })} className="block px-2 py-1.5 rounded-lg border border-slate-200" /></label>
            <label className="font-semibold text-slate-600">Jenis
              <select value={historyFilter.type} onChange={(e) => setHistoryFilter({ ...historyFilter, type: e.target.value })} className="block px-2 py-1.5 rounded-lg border border-slate-200 bg-white">
                <option value="">Semua</option>
                {HISTORY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <button onClick={() => downloadCsv(`sejarah-pelajar-${historyFilter.start}-${historyFilter.end}.csv`,
              ['Tarikh', 'ID', 'Pelajar', 'Tingkatan', 'Jenis', 'Kelas', 'Sebab', 'Keterangan', 'Tindakan', 'Oleh'],
              historyRows.map((h) => [h.event_date, h.student_code, h.student_name, h.student_form, h.event_label, h.class_label,
                [h.reason_code, h.reason_text].filter(Boolean).join(' - '), h.description, h.action, h.recorded_by]))}
              className="ml-auto px-3 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1.5 cursor-pointer">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Tarikh</th><th className="px-3">Pelajar</th><th className="px-3">Jenis</th><th className="px-3">Kelas</th><th className="px-3">Sebab / Keterangan</th><th className="px-3">Oleh</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {historyRows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">Tiada rekod dalam tempoh ini.</td></tr>}
                {historyRows.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(h.student)}>
                    <td className="py-2.5 px-3 whitespace-nowrap">{h.event_date}</td>
                    <td className="px-3 font-semibold">{h.student_name} <span className="text-slate-400">({h.student_form})</span></td>
                    <td className="px-3">{h.event_label}</td>
                    <td className="px-3">{h.class_label || '-'}</td>
                    <td className="px-3 text-slate-600">{[h.reason_code, h.reason_text, h.description].filter(Boolean).join(' - ') || '-'}</td>
                    <td className="px-3 text-slate-500">{h.recorded_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'promote' && <PromotionPanel />}
      {activeTab === 'gallery' && <FeedbackGallery canDelete={currentRole === 'SUPERVISOR' || currentRole === 'MANAGEMENT'} />}

      {detailId && <StudentDetailModal studentId={detailId} currentRole={currentRole} onClose={() => { setDetailId(null); if (activeTab === 'history') loadHistory(); }} />}
    </div>
  );
}
