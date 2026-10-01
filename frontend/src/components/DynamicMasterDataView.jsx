import React, { useState } from 'react';
import {
  Database, Plus, CheckCircle2, XCircle, AlertCircle, Lock,
  Clock, Filter, ShieldCheck, Tag, Building2, BookOpen, Users,
  CheckSquare, ArrowRight, FileText, Sparkles, Edit3
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { refreshGrades, LEVEL_LABELS } from './grades';

const GRADE_CATEGORY = '1_form';
const EMPTY_ITEM = { code: '', label: '', meta: '', comment: '', level: 'UPPER', order: '', next: '', description: '' };

// Grade entries keep structured details: level, order, next grade, description
function gradeMeta(item) {
  return { level: item.level || 'UPPER', order: Number(item.order) || 0, next: item.next || '', description: item.description || '' };
}

export default function DynamicMasterDataView({ currentRole = 'ADMIN' }) {
  const { masterData, proposeMasterData, approveMasterData, rejectMasterData, updateMasterData, isLoading } = useApp();
  const [editing, setEditing] = useState(null); // item being corrected by Supervisor / Management
  const isAdmin = currentRole === 'ADMIN';
  const isSupervisor = currentRole === 'SUPERVISOR';
  const isManagement = currentRole === 'MANAGEMENT';
  const canApprove = isSupervisor || isManagement;

  // 21 Master Entities Inventory
  const ENTITY_CATEGORIES = [
    { id: '1_form', name: '1. Form / Tingkatan (Darjah 1-6, F1-F5)', count: 11, icon: BookOpen },
    { id: '2_interested_sub', name: '2. Subjek Diminati (Interested Subject)', count: 11, icon: Tag },
    { id: '3_lead_source', name: '3. Punca Prospek (Lead Source)', count: 8, icon: Filter },
    { id: '4_student_type', name: '4. Jenis Pelajar (Student Type)', count: 4, icon: Users },
    { id: '5_grade', name: '5. Entiti Gred & Progresi (Grade Entity)', count: 4, icon: ArrowRight },
    { id: '6_school', name: '6. Pangkalan Sekolah (School Entity)', count: 18, icon: Building2 },
    { id: '7_parent_age', name: '7. Umur Ibu Bapa (Parent Age Band)', count: 4, icon: Users },
    { id: '8_active_sub', name: '8. Subjek Kelas Bulanan (Active Subjects)', count: 5, icon: BookOpen },
    { id: '9_walkin_sub', name: '9. Subjek Kelas Walk-in (Walk-in Subjects)', count: 5, icon: BookOpen },
    { id: '10_exam_type', name: '10. Jenis Peperiksaan (Exam Type)', count: 5, icon: FileText },
    { id: '11_academic_grade', name: '11. Tahap Akademik (Academic Level)', count: 10, icon: BookOpen },
    { id: '12_academic_sub', name: '12. Subjek Peperiksaan (Exam Subject)', count: 8, icon: Tag },
    { id: '13_mark_band', name: '13. Gred & Jalur Markah (Mark Band A-F)', count: 5, icon: CheckSquare },
    { id: '14_drop_reason', name: '14. Sebab Gugur Subjek (Drop Reason)', count: 6, icon: AlertCircle },
    { id: '15_teacher_type', name: '15. Kategori Guru (Permanent/Ganti)', count: 3, icon: Users },
    { id: '16_teacher_sub', name: '16. Subjek Pengajaran Guru', count: 6, icon: BookOpen },
    { id: '17_teacher_grade', name: '17. Gred Kelayakan Mengajar Guru', count: 4, icon: Tag },
    { id: '18_expense_cat', name: '18. Kategori Perbelanjaan PV', count: 7, icon: FileText },
    { id: '19_expense_subcat', name: '19. Sub-Kategori Perbelanjaan PV', count: 6, icon: FileText },
    { id: '20_vendor', name: '20. Pangkalan Pembekal (Vendor Master)', count: 5, icon: Building2 },
    { id: '21_payment_method', name: '21. Kaedah Pembayaran (Payment Method)', count: 4, icon: Tag },
  ];

  const [selectedEntity, setSelectedEntity] = useState('1_form');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const isGrade = selectedEntity === GRADE_CATEGORY;
  const gradeCodes = masterData.filter((i) => i.category === GRADE_CATEGORY && i.status === 'APPROVED')
    .sort((a, b) => (a.meta_info?.order ?? 999) - (b.meta_info?.order ?? 999));

  const activeCategory = ENTITY_CATEGORIES.find(c => c.id === selectedEntity) || ENTITY_CATEGORIES[0];

  const filteredItems = masterData.filter(item => {
    if (item.category !== selectedEntity) return false;
    if (filterStatus === 'ALL') return true;
    return item.status === filterStatus;
  });

  const pendingCountTotal = masterData.filter(i => i.status === 'PENDING').length;

  const handleProposeNew = async (e) => {
    e.preventDefault();
    if (!newItem.label) return;

    setIsSubmitting(true);
    try {
      const generatedCode = newItem.code || `${selectedEntity.split('_')[1] || 'ENT'}_${Date.now().toString().slice(-4)}`.toUpperCase();
      await proposeMasterData({
        category: selectedEntity,
        code: generatedCode,
        label: newItem.label,
        meta_info: isGrade ? gradeMeta(newItem) : (newItem.meta ? { detail: newItem.meta } : {}),
        proposal_note: newItem.comment,
        user_role: currentRole,
        created_by: isAdmin ? 'Admin 1 (Kaunter)' : currentRole,
        approved_by: canApprove ? currentRole : '',
      });

      setShowAddModal(false);
      setNewItem(EMPTY_ITEM);
      if (isGrade) refreshGrades();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await updateMasterData(editing.id, {
        label: editing.label,
        meta_info: editing.category === GRADE_CATEGORY ? gradeMeta(editing) : (editing.meta ? { ...(editing.meta_info || {}), detail: editing.meta } : editing.meta_info),
      });
      if (editing.category === GRADE_CATEGORY) refreshGrades();
      setEditing(null);
    } catch { /* toast shown */ }
  };

  const startEdit = (item) => {
    const m = item.meta_info || {};
    setEditing({ ...item, meta: m.detail || '', level: m.level || 'UPPER', order: m.order ?? '', next: m.next || '', description: m.description || '' });
  };

  const handleAction = async (id, newStatus) => {
    if (newStatus === 'APPROVED') {
      await approveMasterData(id, currentRole);
      if (selectedEntity === GRADE_CATEGORY) refreshGrades();
    } else {
      const reason = prompt('Masukkan ulasan/alasan penolakan cadangan ini:', 'Maklumat tidak lengkap atau bertindih');
      if (!reason) return;
      await rejectMasterData(id, reason, currentRole);
    }
  };


  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Hab Data Induk Dinamik (`**` Master Lookup & Dual-Control Gate)</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
              Seksyen 1 & 1.2 (21 Entiti)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Pusat Tuisyen An Nur (Telipot) • Peraturan Dwi-Kawalan: Admin mencadangkan nilai baharu (`Draft/Pending`), Supervisor/Management mengesahkan & mengunci (`Locked/Active`) sebelum boleh digunakan dalam borang operasi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pendingCountTotal > 0 && (
            <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 border border-amber-200">
              <Clock className="w-4 h-4 text-amber-600 animate-spin" />
              {pendingCountTotal} Menunggu Kelulusan
            </span>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> {canApprove ? '+ Tambah Nilai Master' : '+ Cadang Nilai Baharu (`**`)'}
          </button>
        </div>
      </div>

      {/* Role Authority Indicator */}
      <div className={`p-4 rounded-2xl border text-xs flex items-center gap-3 ${
        isAdmin ? 'bg-purple-50 border-purple-200 text-purple-900' : 'bg-blue-50 border-blue-200 text-blue-900'
      }`}>
        <ShieldCheck className={`w-5 h-5 shrink-0 ${isAdmin ? 'text-purple-600' : 'text-blue-600'}`} />
        <div>
          <span className="font-bold">
            {isAdmin ? 'Hak Akses Admin 1 & 2 (Cadang Sahaja):' : 'Hak Kuasa Kelulusan (Supervisor & Management):'}
          </span>
          <p className="mt-0.5 leading-relaxed">
            {isAdmin
              ? 'Mengikut Peraturan 1.1 j-status.doc, Admin boleh mencadangkan penambahan atau suntingan data induk `**`. Entiti kekal sebagai PENDING sehingga diluluskan oleh Supervisor. Entiti yang telah diluluskan dikunci daripada suntingan kaunter.'
              : 'Supervisor dan Pengarah berkuasa meluluskan atau menolak cadangan entiti baharu dengan ulasan wajib. Selepas diluluskan, entiti dikunci dan berkuatkuasa serta-merta pada semua dropdown pendaftaran pelajar, jadual dan perbelanjaan.'}
          </p>
        </div>
      </div>

      {/* Grid: 21 Entities Selector & Master Items Table */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: 21 Entity Category List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-1 max-h-[700px] overflow-y-auto">
          <div className="px-3 py-2 border-b border-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between">
            <span>21 Entiti Dinamik (`**`)</span>
            <span className="text-[10px] text-slate-400">Master Data</span>
          </div>
          {ENTITY_CATEGORIES.map(cat => {
            const isSelected = selectedEntity === cat.id;
            const Icon = cat.icon;
            const pendingInCat = masterData.filter(i => i.category === cat.id && i.status === 'PENDING').length;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedEntity(cat.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{cat.name}</span>
                </div>
                {pendingInCat > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md shrink-0 ${
                    isSelected ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {pendingInCat}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Master Lookup Table for Selected Entity */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{activeCategory.name}</h3>
              <p className="text-xs text-slate-500">Senarai nilai pilihan yang aktif dalam dropdown sistem operasi tuisyen.</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              {[
                { id: 'ALL', label: 'Semua' },
                { id: 'APPROVED', label: 'Aktif & Dikunci (Approved)' },
                { id: 'PENDING', label: 'Menunggu Kelulusan' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    filterStatus === tab.id ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Kod Entiti</th>
                  <th className="py-3.5 px-4">Nilai Paparan Dropdown</th>
                  <th className="py-3.5 px-4">Maklumat Tambahan (Meta)</th>
                  <th className="py-3.5 px-4">Pencadang</th>
                  <th className="py-3.5 px-4">Status & Pengesah</th>
                  <th className="py-3.5 px-4 text-right">Tindakan Dual-Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-slate-400">
                      Tiada rekod data induk untuk status ini. Klik butang tambah di atas untuk mencadangkan data baharu.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => {
                    const isPending = item.status === 'PENDING';
                    const isApproved = item.status === 'APPROVED';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700">{item.code}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {item.label}
                          {(item.rejection_reason || item.comment) && (
                            <div className="text-[10px] text-rose-600 mt-0.5 font-normal">
                              Ulasan: {item.rejection_reason || item.comment}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {item.category === GRADE_CATEGORY ? (
                            <span className="font-sans">
                              {LEVEL_LABELS[item.meta_info?.level] || item.meta_info?.level || '-'} • susunan {item.meta_info?.order ?? '-'}
                              {' '}• seterusnya: <strong>{item.meta_info?.next || 'tamat'}</strong>
                              {item.meta_info?.description && <div className="text-slate-500">{item.meta_info.description}</div>}
                            </span>
                          ) : typeof item.meta_info === 'object' && item.meta_info !== null
                            ? Object.entries(item.meta_info).map(([k, v]) => `${k}: ${v}`).join(' | ') || '-'
                            : (item.meta || '-')}
                          {item.proposal_note && <div className="text-[10px] text-slate-500 font-sans mt-0.5">Justifikasi: {item.proposal_note}</div>}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          <div>{item.created_by || item.createdBy || 'Admin 1'}</div>
                          <div className="text-[10px] text-slate-400">
                            {item.created_at ? new Date(item.created_at).toLocaleDateString('ms-MY') : (item.date || '-')}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {isApproved && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <Lock className="w-3 h-3 text-emerald-600" /> Aktif & Dikunci
                            </span>
                          )}
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                              <Clock className="w-3 h-3" /> Menunggu Pengesahan
                            </span>
                          )}
                          {(item.approved_by || item.approvedBy) && (
                            <div className="text-[10px] text-slate-400 mt-0.5">Oleh: {item.approved_by || item.approvedBy}</div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isPending ? (
                            canApprove ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleAction(item.id, 'APPROVED')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                                  title="Luluskan nilai ini ke dalam dropdown aktif"
                                >
                                  ✓ Luluskan
                                </button>
                                <button
                                  onClick={() => handleAction(item.id, 'REJECTED')}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-bold text-[11px] cursor-pointer"
                                  title="Tolak cadangan dengan ulasan"
                                >
                                  ✕ Tolak
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Menunggu Supervisor</span>
                            )
                          ) : (
                            <div className="flex items-center justify-end gap-1 text-[11px] text-slate-400">
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                              {canApprove ? (
                                <button
                                  onClick={() => startEdit(item)}
                                  className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                                >
                                  Laras Semula
                                </button>
                              ) : (
                                <span>Terkunci (SOP 1.1)</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Propose / Add New Master Entity Item */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {canApprove ? 'Tambah Nilai Master Baharu' : 'Cadang Nilai Baharu (`**`)'}
                </h3>
                <p className="text-[11px] text-slate-400">Entiti: {activeCategory.name}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                {currentRole}
              </span>
            </div>

            <form onSubmit={handleProposeNew} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kod Entiti (Singkatan / ID) *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: KEA1007 / SRC-IG"
                  value={newItem.code}
                  onChange={(e) => setNewItem({ ...newItem, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 uppercase font-mono font-bold outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama / Nilai Paparan Penuh *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: SMK Sultan Yahya Petra 1"
                  value={newItem.label}
                  onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold outline-none focus:border-indigo-500"
                />
              </div>

              {isGrade ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="font-semibold text-slate-700">Tahap
                    <select value={newItem.level} onChange={(e) => setNewItem({ ...newItem, level: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                      {Object.entries(LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  <label className="font-semibold text-slate-700">Susunan (1 = terendah)
                    <input type="number" min="0" required value={newItem.order} onChange={(e) => setNewItem({ ...newItem, order: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
                  </label>
                  <label className="col-span-2 font-semibold text-slate-700">Gred seterusnya (untuk naik tingkatan akhir tahun)
                    <select value={newItem.next} onChange={(e) => setNewItem({ ...newItem, next: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                      <option value="">Tiada (gred akhir)</option>
                      {gradeCodes.map((g) => <option key={g.code} value={g.code}>{g.code} - {g.label}</option>)}
                    </select>
                  </label>
                  <label className="col-span-2 font-semibold text-slate-700">Penerangan
                    <input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
                  </label>
                </div>
              ) : (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Maklumat Lanjut (Meta / Kategori / TIN / Pautan Progresi)</label>
                <input
                  type="text"
                  placeholder="Contoh: Kategori: SMK / Next Grade: F5 / TIN: C12345"
                  value={newItem.meta}
                  onChange={(e) => setNewItem({ ...newItem, meta: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
                />
              </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sebab & Justifikasi Cadangan *</label>
                <textarea
                  rows="2"
                  required
                  placeholder="Huraian keperluan penambahan entiti ini..."
                  value={newItem.comment}
                  onChange={(e) => setNewItem({ ...newItem, comment: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600">
                <strong>Aliran Dwi-Kawalan:</strong> {canApprove
                  ? 'Sebagai Supervisor/Management, nilai ini akan diluluskan dan aktif serta-merta pada dropdown sistem.'
                  : 'Sebagai Admin, nilai ini akan dihantar ke senarai semak kelulusan Supervisor/Management sebelum aktif.'}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer shadow-sm"
                >
                  {canApprove ? 'Simpan & Aktifkan' : 'Hantar Cadangan (Pending)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
          <form onSubmit={saveEdit} className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Laras Data Induk: <span className="font-mono text-indigo-700">{editing.code}</span></h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Tutup" className="text-slate-400 cursor-pointer">✕</button>
            </div>
            <label className="block font-semibold text-slate-700">Nama / nilai paparan
              <input required value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
            </label>
            {editing.category === GRADE_CATEGORY ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-700">Tahap
                  <select value={editing.level} onChange={(e) => setEditing({ ...editing, level: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                    {Object.entries(LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="font-semibold text-slate-700">Susunan
                  <input type="number" min="0" value={editing.order} onChange={(e) => setEditing({ ...editing, order: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
                </label>
                <label className="col-span-2 font-semibold text-slate-700">Gred seterusnya
                  <select value={editing.next} onChange={(e) => setEditing({ ...editing, next: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                    <option value="">Tiada (gred akhir)</option>
                    {gradeCodes.filter((g) => g.code !== editing.code).map((g) => <option key={g.code} value={g.code}>{g.code} - {g.label}</option>)}
                  </select>
                </label>
                <label className="col-span-2 font-semibold text-slate-700">Penerangan
                  <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
                </label>
              </div>
            ) : (
              <label className="block font-semibold text-slate-700">Maklumat lanjut
                <input value={editing.meta} onChange={(e) => setEditing({ ...editing, meta: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
              </label>
            )}
            <p className="text-slate-500">Kod tidak boleh diubah kerana ia digunakan dalam rekod sedia ada.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer">Simpan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
