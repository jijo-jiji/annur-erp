import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Phone, AlertTriangle, Calendar, CheckCircle2, TrendingUp, FileWarning, Search, Plus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { staffApi } from '../api/client';

const DAYS = ['JUMAAT', 'SABTU', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS'];
const PERMIT_WARNING_DAYS = 60;
const SEVERITY = { LOW: 'Rendah', MEDIUM: 'Sederhana', HIGH: 'Tinggi' };
const COMPLAINT_STATUS = { OPEN: 'Baru', IN_PROGRESS: 'Dalam Tindakan', RESOLVED: 'Selesai' };
const today = () => new Date().toISOString().split('T')[0];

function permitInfo(expiry) {
  if (!expiry) return { state: 'MISSING', label: 'Tiada rekod' };
  const days = Math.ceil((new Date(expiry) - new Date(today())) / 86400000);
  if (days < 0) return { state: 'EXPIRED', label: `Luput ${expiry}`, days };
  if (days <= PERMIT_WARNING_DAYS) return { state: 'SOON', label: `Luput ${expiry} (${days} hari)`, days };
  return { state: 'VALID', label: `Sah hingga ${expiry}`, days };
}

function waLink(phone, text) {
  const digits = (phone || '').replace(/[^0-9]/g, '').replace(/^0/, '');
  return `https://wa.me/60${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

const money = (v) => `RM ${Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TeachersView({ currentRole = 'ADMIN' }) {
  const { teachers, timetable, refreshTeachers, showToast } = useApp();
  const [activeSubTab, setActiveSubTab] = useState('directory');
  const [filterType, setFilterType] = useState('ALL');
  const [showInactive, setShowInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [complaints, setComplaints] = useState([]);
  const [increments, setIncrements] = useState([]);
  const [modal, setModal] = useState(null); // 'complaint' | 'increment' | 'action'
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const isAdmin = currentRole === 'ADMIN';
  const isManagement = currentRole === 'MANAGEMENT';

  const loadExtras = useCallback(async () => {
    if (isAdmin) return;
    try {
      const [c, i] = await Promise.all([staffApi.getComplaints(), staffApi.getRateIncrements()]);
      setComplaints(c);
      setIncrements(i);
    } catch {
      showToast('Gagal memuat aduan / kenaikan kadar guru.', 'error');
    }
  }, [isAdmin, showToast]);

  useEffect(() => { loadExtras(); }, [loadExtras]);

  // Classes each teacher is assigned to in the master timetable
  const classesByTeacher = useMemo(() => {
    const map = {};
    timetable.forEach((c) => {
      if (!c.teacher) return;
      (map[c.teacher] ||= []).push(c);
    });
    return map;
  }, [timetable]);

  const rows = useMemo(() => teachers.map((t) => {
    const classes = classesByTeacher[t.id] || [];
    const forms = [...new Set(classes.map((c) => c.form_level))].sort();
    return {
      ...t,
      classes,
      forms,
      subjectNames: (t.subjects_qualified_details || []).map((s) => s.name),
      permit: permitInfo(t.teaching_permit_expiry),
    };
  }), [teachers, classesByTeacher]);

  const activeRows = useMemo(() => rows.filter((t) => t.is_active), [rows]);
  const expiringPermits = activeRows.filter((t) => t.permit.state === 'SOON' || t.permit.state === 'EXPIRED');
  const term = searchTerm.toLowerCase();
  const filtered = rows.filter((t) =>
    t.is_active !== showInactive &&
    (filterType === 'ALL' || t.teacher_type === filterType) &&
    (!term || t.full_name.toLowerCase().includes(term) || t.teacher_code.toLowerCase().includes(term) ||
      t.subjectNames.some((s) => s.toLowerCase().includes(term)))
  );

  // Estimate only: weekly scheduled sessions × 4 weeks × current rate
  const rateSummary = useMemo(() => {
    const avg = (list) => (list.length ? list.reduce((s, t) => s + Number(t.rate_per_session || 0), 0) / list.length : 0);
    const monthly = activeRows.reduce((s, t) => s + t.classes.length * 4 * Number(t.rate_per_session || 0), 0);
    return {
      permanentAvg: avg(activeRows.filter((t) => t.teacher_type === 'PERMANENT')),
      replacementAvg: avg(activeRows.filter((t) => t.teacher_type === 'REPLACEMENT')),
      monthlyEstimate: monthly,
    };
  }, [activeRows]);

  const openModal = (type, preset = {}) => {
    setForm(preset);
    setModal(type);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'complaint') {
        await staffApi.createComplaint({ ...form, teacher: Number(form.teacher) });
        showToast('Aduan direkodkan.');
      } else if (modal === 'action') {
        await staffApi.updateComplaint(form.id, {
          status: form.status, action_taken: form.action_taken, action_pic: form.action_pic, action_date: form.action_date || null,
        });
        showToast('Tindakan aduan dikemaskini.');
      } else if (modal === 'increment') {
        await staffApi.proposeRateIncrement({ ...form, teacher: Number(form.teacher) });
        showToast('Cadangan kenaikan kadar dihantar kepada Management.');
      }
      setModal(null);
      await loadExtras();
    } catch (err) {
      showToast(err.message || 'Ralat menyimpan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const decideIncrement = async (inc, approve) => {
    const comment = approve ? '' : window.prompt('Sebab penolakan (wajib):');
    if (!approve && !comment?.trim()) return;
    try {
      if (approve) await staffApi.approveRateIncrement(inc.id);
      else await staffApi.rejectRateIncrement(inc.id, comment.trim());
      showToast(approve ? `Kadar baharu ${inc.teacher_code} berkuat kuasa.` : 'Cadangan ditolak.', approve ? 'success' : 'info');
      await Promise.all([loadExtras(), approve ? refreshTeachers() : null]);
    } catch (err) {
      showToast(err.message || 'Ralat memproses cadangan.', 'error');
    }
  };

  const tabs = [
    { id: 'directory', label: `Direktori Guru (${activeRows.length})` },
    { id: 'assigned', label: 'Kelas Ditugaskan' },
    ...(!isAdmin ? [
      { id: 'complaints', label: `Aduan & Tindakan (${complaints.length})` },
      { id: 'increments', label: 'Kenaikan Kadar' },
    ] : []),
  ];
  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800';
  const teacherOptions = activeRows.slice().sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Pengurusan Guru</h2>
          <p className="text-xs text-slate-500">Guru tetap & ganti, kelas ditugaskan, permit mengajar{!isAdmin && ', aduan dan kadar elaun'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeSubTab === t.id ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {expiringPermits.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl flex items-start gap-3 text-amber-900 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">{expiringPermits.length} permit mengajar luput atau hampir luput ({PERMIT_WARNING_DAYS} hari)</span>
            <p className="mt-1">{expiringPermits.map((t) => `${t.full_name} (${t.permit.label})`).join(' • ')}</p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl flex items-center gap-3 text-purple-900 text-xs">
          <ShieldCheck className="w-5 h-5 text-purple-600 shrink-0" />
          <p>Senarai guru untuk Admin tidak memaparkan kadar elaun (hanya Supervisor & Management).</p>
        </div>
      )}

      {activeSubTab === 'directory' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="search"
                aria-label="Cari guru"
                placeholder="Cari nama, kod atau subjek…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800 outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['ALL', 'Semua'],
                ['PERMANENT', `Tetap (${activeRows.filter((t) => t.teacher_type === 'PERMANENT').length})`],
                ['REPLACEMENT', `Ganti (${activeRows.filter((t) => t.teacher_type === 'REPLACEMENT').length})`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilterType(value)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    filterType === value ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
              <label className="flex items-center gap-1.5 ml-2 font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Guru tidak aktif ({rows.length - activeRows.length})
              </label>
            </div>
          </div>

          {!isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl text-xs">
              <div>
                <span className="text-slate-500 block font-medium">Anggaran elaun sebulan</span>
                <span className="text-lg font-black text-indigo-950">{money(rateSummary.monthlyEstimate)}</span>
                <span className="block text-[10px] text-slate-500">Sesi dijadualkan seminggu × 4 × kadar semasa</span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Purata kadar guru tetap</span>
                <span className="text-lg font-black text-slate-800">{money(rateSummary.permanentAvg)} / sesi</span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Purata kadar guru ganti</span>
                <span className="text-lg font-black text-slate-800">{money(rateSummary.replacementAvg)} / sesi</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Kod</th>
                  <th className="py-3.5 px-4">Nama Guru</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4">Subjek</th>
                  <th className="py-3.5 px-4">Tingkatan Diajar</th>
                  <th className="py-3.5 px-4">Permit Mengajar</th>
                  {!isAdmin && <th className="py-3.5 px-4">Kadar / Sesi</th>}
                  <th className="py-3.5 px-4 text-right">Hubungi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-400">Tiada guru sepadan.</td></tr>
                )}
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-bold text-indigo-600">{t.teacher_code}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{t.full_name}</div>
                      <div className="text-slate-400 text-[10px]">{t.phone_number}{t.joined_date ? ` • Sejak ${t.joined_date.slice(0, 4)}` : ''}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${t.teacher_type === 'PERMANENT' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {t.teacher_type === 'PERMANENT' ? 'Tetap' : 'Ganti'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{t.subjectNames.join(', ') || '-'}</td>
                    <td className="py-3 px-4 text-slate-700">{t.forms.join(', ') || '-'}</td>
                    <td className="py-3 px-4">
                      {t.permit.state === 'VALID' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" /> {t.permit.label}
                        </span>
                      ) : t.permit.state === 'MISSING' ? (
                        <span className="text-[10px] text-slate-400">{t.permit.label}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                          <AlertTriangle className="w-3 h-3" /> {t.permit.label}
                        </span>
                      )}
                    </td>
                    {!isAdmin && <td className="py-3 px-4 font-bold text-emerald-600">{money(t.rate_per_session)}</td>}
                    <td className="py-3 px-4 text-right">
                      <a
                        href={waLink(t.phone_number)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition font-semibold text-[11px]"
                      >
                        <Phone className="w-3 h-3" /> WhatsApp
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'assigned' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" /> Kelas Ditugaskan Mengikut Hari
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Daripada Jadual Master semasa. Guru tanpa kelas tidak disenaraikan.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-3">Guru</th>
                  {DAYS.map((d) => <th key={d} className="py-3 px-3">{d}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRows.filter((t) => t.classes.length).map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 align-top">
                    <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                      <div>{t.full_name}</div>
                      <span className="text-[10px] text-indigo-600 font-semibold">{t.teacher_code} • {t.classes.length} sesi/minggu</span>
                    </td>
                    {DAYS.map((d) => {
                      const dayClasses = t.classes.filter((c) => c.day === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
                      return (
                        <td key={d} className="py-3 px-3 space-y-1">
                          {dayClasses.length === 0 ? (
                            <span className="text-slate-300">-</span>
                          ) : dayClasses.map((c) => (
                            <span key={c.id} className="block px-2 py-1 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {c.start_time} {c.form_level} {c.subject_details?.code} ({c.section})
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'complaints' && !isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-rose-600" /> Aduan & Laporan Tindakan
            </h3>
            <button
              onClick={() => openModal('complaint', { teacher: '', date_reported: today(), complained_by: '', category: '', description: '', severity: 'LOW' })}
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Rekod Aduan
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-3">Tarikh</th>
                  <th className="py-3 px-3">Guru</th>
                  <th className="py-3 px-3">Pengadu</th>
                  <th className="py-3 px-3">Aduan</th>
                  <th className="py-3 px-3">Tahap</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Tindakan (PIC, tarikh)</th>
                  <th className="py-3 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {complaints.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-400">Tiada aduan direkodkan.</td></tr>
                )}
                {complaints.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 align-top">
                    <td className="py-3 px-3 whitespace-nowrap">{c.date_reported}</td>
                    <td className="py-3 px-3 font-semibold text-indigo-700">{c.teacher_name} ({c.teacher_code})</td>
                    <td className="py-3 px-3 text-slate-700">{c.complained_by}</td>
                    <td className="py-3 px-3 text-slate-700 max-w-xs">
                      {c.category && <div className="font-semibold">{c.category}</div>}
                      {c.description}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.severity === 'HIGH' ? 'bg-rose-100 text-rose-800' : c.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>{SEVERITY[c.severity]}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {COMPLAINT_STATUS[c.status]}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-[11px] max-w-xs">
                      {c.action_taken ? <>{c.action_taken}<div className="text-slate-400">{c.action_pic}{c.action_date ? `, ${c.action_date}` : ''}</div></> : '-'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => openModal('action', {
                          id: c.id, status: c.status, action_taken: c.action_taken, action_pic: c.action_pic, action_date: c.action_date || today(),
                        })}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-[11px] cursor-pointer"
                      >
                        Kemaskini
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'increments' && !isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" /> Kenaikan Kadar Elaun Guru
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Supervisor/Management mencadang; Management meluluskan. Sejarah kenaikan setiap guru disimpan.</p>
            </div>
            <button
              onClick={() => openModal('increment', { teacher: '', proposed_rate: '', effective_date: `${new Date().getFullYear() + 1}-01-01`, reason: '' })}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Cadang Kenaikan
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-3">Guru</th>
                  <th className="py-3 px-3">Kadar Lama</th>
                  <th className="py-3 px-3">Kadar Baharu</th>
                  <th className="py-3 px-3">Kuat Kuasa</th>
                  <th className="py-3 px-3">Justifikasi</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {increments.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">Tiada cadangan atau sejarah kenaikan kadar.</td></tr>
                )}
                {increments.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50 align-top">
                    <td className="py-3 px-3 font-bold text-slate-900">{inc.teacher_name} ({inc.teacher_code})</td>
                    <td className="py-3 px-3">{money(inc.previous_rate)}</td>
                    <td className="py-3 px-3 font-bold text-emerald-600">{money(inc.proposed_rate)}</td>
                    <td className="py-3 px-3">{inc.effective_date}</td>
                    <td className="py-3 px-3 text-slate-600 max-w-sm">
                      {inc.reason}
                      <div className="text-[10px] text-slate-400">Dicadang: {inc.proposed_by}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        inc.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : inc.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {inc.status === 'APPROVED' ? 'Diluluskan' : inc.status === 'REJECTED' ? 'Ditolak' : 'Menunggu Management'}
                      </span>
                      {inc.decided_by && <div className="text-[10px] text-slate-400 mt-1">{inc.decided_by}{inc.decision_comment ? `: ${inc.decision_comment}` : ''}</div>}
                    </td>
                    <td className="py-3 px-3 text-right space-x-1">
                      {inc.status === 'PENDING' && isManagement && (
                        <>
                          <button onClick={() => decideIncrement(inc, true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-[11px] hover:bg-emerald-700 cursor-pointer">Luluskan</button>
                          <button onClick={() => decideIncrement(inc, false)} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-[11px] hover:bg-rose-100 cursor-pointer">Tolak</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {modal === 'complaint' ? 'Rekod Aduan Guru' : modal === 'action' ? 'Kemaskini Tindakan Aduan' : 'Cadang Kenaikan Kadar'}
              </h3>
              <button onClick={() => setModal(null)} aria-label="Tutup" className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              {(modal === 'complaint' || modal === 'increment') && (
                <div>
                  <label htmlFor="f-teacher" className="block font-semibold text-slate-700 mb-1">Guru *</label>
                  <select id="f-teacher" required value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} className={inputCls}>
                    <option value="">Pilih guru…</option>
                    {teacherOptions.map((t) => (
                      <option key={t.id} value={t.id}>{t.full_name} ({t.teacher_code}){modal === 'increment' ? ` - ${money(t.rate_per_session)}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {modal === 'complaint' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="f-date" className="block font-semibold text-slate-700 mb-1">Tarikh Aduan *</label>
                      <input id="f-date" type="date" required value={form.date_reported} onChange={(e) => setForm({ ...form, date_reported: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="f-sev" className="block font-semibold text-slate-700 mb-1">Tahap</label>
                      <select id="f-sev" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className={inputCls}>
                        {Object.entries(SEVERITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="f-by" className="block font-semibold text-slate-700 mb-1">Diadu Oleh *</label>
                    <input id="f-by" required value={form.complained_by} onChange={(e) => setForm({ ...form, complained_by: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="f-cat" className="block font-semibold text-slate-700 mb-1">Kategori</label>
                    <input id="f-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="f-desc" className="block font-semibold text-slate-700 mb-1">Keterangan *</label>
                    <textarea id="f-desc" rows="3" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
                  </div>
                </>
              )}
              {modal === 'action' && (
                <>
                  <div>
                    <label htmlFor="f-status" className="block font-semibold text-slate-700 mb-1">Status</label>
                    <select id="f-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                      {Object.entries(COMPLAINT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="f-action" className="block font-semibold text-slate-700 mb-1">Tindakan Diambil</label>
                    <textarea id="f-action" rows="3" value={form.action_taken} onChange={(e) => setForm({ ...form, action_taken: e.target.value })} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="f-pic" className="block font-semibold text-slate-700 mb-1">PIC</label>
                      <input id="f-pic" value={form.action_pic} onChange={(e) => setForm({ ...form, action_pic: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="f-adate" className="block font-semibold text-slate-700 mb-1">Tarikh Tindakan</label>
                      <input id="f-adate" type="date" value={form.action_date} onChange={(e) => setForm({ ...form, action_date: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                </>
              )}
              {modal === 'increment' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="f-rate" className="block font-semibold text-slate-700 mb-1">Kadar Baharu (RM) *</label>
                      <input id="f-rate" type="number" step="0.01" min="0" required value={form.proposed_rate} onChange={(e) => setForm({ ...form, proposed_rate: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="f-eff" className="block font-semibold text-slate-700 mb-1">Tarikh Kuat Kuasa *</label>
                      <input id="f-eff" type="date" required value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="f-reason" className="block font-semibold text-slate-700 mb-1">Justifikasi</label>
                    <textarea id="f-reason" rows="3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} />
                  </div>
                </>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold">Batal</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
