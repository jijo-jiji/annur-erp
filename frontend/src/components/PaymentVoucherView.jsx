import React, { useState } from 'react';
import {
  FileText, Plus, ShieldCheck, CheckCircle, AlertCircle, CheckCircle2,
  Clock, Building, Search, Printer, X, PenTool, Check, ExternalLink, Loader2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AttachmentList, SignaturePad } from './Attachments';

// Attachments can change until the voucher is approved or rejected
const PV_OPEN = ['DRAFT', 'VERIFIED_ADMIN', 'PENDING_SUPERVISOR', 'PENDING_MANAGEMENT'];

export default function PaymentVoucherView({ currentRole = 'ADMIN' }) {
  const { vouchers: backendVouchers, vendors: backendVendors, createVoucher, approveVoucher, rejectVoucher, getMasterOptions } = useApp();
  const [activeSubTab, setActiveSubTab] = useState('vouchers'); // 'vouchers' | 'vendors'
  const [showModal, setShowModal] = useState(false);
  const [selectedPVForView, setSelectedPVForView] = useState(null);

  const isAdmin = currentRole === 'ADMIN';
  const isSupervisor = currentRole === 'SUPERVISOR';
  const isManagement = currentRole === 'MANAGEMENT';

  const vendors = backendVendors.map(v => ({
    id: v.id,
    name: v.vendor_name,
    ssm: v.vendor_id,
    tin: v.tin_number || '-',
    cat: v.pic_name ? `PIC: ${v.pic_name}` : '-',
    phone: v.phone_number || '-',
    bank: `${v.bank_name || ''} ${v.bank_account || ''}`.trim() || '-',
    status: v.status || 'ACTIVE'
  }));

  // Payment Vouchers (PV)
  const vouchers = backendVouchers.map(v => ({
        id: v.id,
        pv_no: v.pv_number,
        date: v.date,
        vendor: v.vendor_name || '-',
        tin: v.vendor_tin || '-',
        bank: v.vendor_bank || '-',
        subcategory: v.subcategory,
        method: v.payment_method,
        ref: v.ref_number,
        remarks: v.remarks,
        category: v.category,
        amount: parseFloat(v.amount),
        tier: v.tier_level,
        status: v.status,
        desc: v.items_description,
        preparedBy: v.prepared_by || '-',
        verifiedBy: v.status === 'VERIFIED_ADMIN' ? v.prepared_by : '-',
        approvedBy: v.approved_by || '-',
        rejectReason: v.status === 'REJECTED' ? v.approval_comment : '',
        signedAt: v.created_at ? new Date(v.created_at).toLocaleString('ms-MY') : null,
        raw: v
      }));

  // Categories and subcategories come from master data so budget-vs-actual can match them
  const categories = getMasterOptions('18_expense_cat');
  const subcategoryOptions = (categoryLabel) => {
    const cat = categories.find((c) => c.label === categoryLabel);
    return getMasterOptions('19_expense_subcat').filter((s) => !cat || s.meta?.cat === cat.value);
  };
  const paymentMethods = [
    ['ONLINE_TRANSFER', 'Pindahan Dalam Talian'],
    ['CASH', 'Tunai'],
    ['CHEQUE', 'Cek'],
    ['DUITNOW_QR', 'DuitNow QR'],
    ['AUTO_DEBIT', 'Auto Debit'],
  ];

  const emptyPV = { vendorId: '', category: '', subcategory: '', method: 'ONLINE_TRANSFER', ref: '', amount: '', desc: '', remarks: '' };
  const [newPV, setNewPV] = useState(emptyPV);

  const handleCreate = async (e) => {
    e.preventDefault();
    const amt = parseFloat(newPV.amount);
    try {
      await createVoucher({
        vendor: Number(newPV.vendorId),
        category: newPV.category,
        subcategory: newPV.subcategory,
        payment_method: newPV.method,
        ref_number: newPV.ref,
        amount: amt,
        items_description: newPV.desc,
        remarks: newPV.remarks,
      });
      setShowModal(false);
      setNewPV(emptyPV);
    } catch (err) {
      console.error('Error creating voucher:', err);
    }
  };

  const handleApprove = async (id) => {
    try {
      await approveVoucher(id);
    } catch (err) {
      console.error('Error approving voucher:', err);
    }
  };

  const handleReject = async (id) => {
    const comment = window.prompt('Sebab penolakan baucar (wajib):');
    if (!comment || !comment.trim()) return;
    try {
      await rejectVoucher(id, comment.trim());
    } catch (err) {
      console.error('Error rejecting voucher:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Modul Perbelanjaan & Baucar Bayaran (PV)</h2>
          <p className="text-xs text-slate-500">
            SOP Seksyen 6: Format PVYY-MM01, Pangkalan Data Pembekal (TIN/SSM), Matriks 3-Had & Cop Kelulusan Digital
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setActiveSubTab('vouchers')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeSubTab === 'vouchers' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Senarai Baucar ({vouchers.length})
            </button>
            <button
              onClick={() => setActiveSubTab('vendors')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeSubTab === 'vendors' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Pangkalan Pembekal ({vendors.length})
            </button>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> + Cipta PV Baru
          </button>
        </div>
      </div>

      {/* Role Authority Banner */}
      {isAdmin && (
        <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl flex items-center gap-3 text-purple-900 text-xs">
          <ShieldCheck className="w-5 h-5 text-purple-600 shrink-0" />
          <div>
            <span className="font-bold">Had Kuasa Kaunter (Admin - Petty Cash):</span>
            <p className="text-purple-700 mt-0.5">
              Admin hanya boleh mengesahkan pembelian runcit bawah RM500 (Alat tulis, kecemasan pejabat). Permohonan melebihi RM500 memerlukan kelulusan Supervisor atau Pengarah.
            </p>
          </div>
        </div>
      )}

      {isSupervisor && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-center gap-3 text-blue-900 text-xs">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <span className="font-bold">Had Kuasa Kelulusan (Supervisor - RM500 hingga RM3,000):</span>
            <p className="text-blue-700 mt-0.5">
              Supervisor berkuasa meluluskan perbelanjaan operasi, penyelenggaraan dan fasiliti antara RM500 dan RM3,000. Perbelanjaan melebihi RM3,000 berada di bawah bidang kuasa Pengarah.
            </p>
          </div>
        </div>
      )}

      {isManagement && (
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl flex items-center gap-3 text-indigo-900 text-xs">
          <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <span className="font-bold">Kuasa Kelulusan Pengarah Penuh (Management - Melebihi RM3,000):</span>
            <p className="text-indigo-700 mt-0.5">
              Pengarah mempunyai kuasa penuh meluluskan semua perbelanjaan strategik, percetakan besar, sewaan, dan perolehan melebihi RM3,000.
            </p>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: VOUCHERS LIST */}
      {activeSubTab === 'vouchers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
              <tr>
                <th className="py-3.5 px-4">No. PV</th>
                <th className="py-3.5 px-4">Tarikh</th>
                <th className="py-3.5 px-4">Pembekal (Vendor)</th>
                <th className="py-3.5 px-4">Kategori Perbelanjaan</th>
                <th className="py-3.5 px-4">Jumlah (RM)</th>
                <th className="py-3.5 px-4">Had Kelulusan</th>
                <th className="py-3.5 px-4">Status Pengesahan</th>
                <th className="py-3.5 px-4 text-right">Tindakan RBAC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vouchers.map((pv) => {
                const isPendingSup = pv.status === 'PENDING_SUPERVISOR';
                const isPendingMgmt = pv.status === 'PENDING_MANAGEMENT';

                return (
                  <tr key={pv.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-bold text-indigo-700">{pv.pv_no}</td>
                    <td className="py-3.5 px-4 text-slate-500">{pv.date}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{pv.vendor}</div>
                      <div className="text-[10px] text-slate-400">{pv.desc}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{pv.category}{pv.subcategory && <div className="text-[10px] text-slate-400">{pv.subcategory}</div>}</td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">RM {pv.amount.toFixed(2)}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                        {pv.tier === 'TIER_1' ? '< RM500 (Admin)' : pv.tier === 'TIER_2' ? 'RM500-3K (Supervisor)' : '> RM3K (Management)'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {pv.status === 'VERIFIED_ADMIN' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Disahkan Kaunter (&lt;RM500)
                        </span>
                      )}
                      {pv.status === 'PENDING_SUPERVISOR' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                          <Clock className="w-3 h-3" /> Menunggu Kelulusan Supervisor
                        </span>
                      )}
                      {pv.status === 'APPROVED_SUPERVISOR' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                          <CheckCircle2 className="w-3 h-3" /> Diluluskan Supervisor
                        </span>
                      )}
                      {pv.status === 'PENDING_MANAGEMENT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 animate-pulse">
                          <Clock className="w-3 h-3" /> Menunggu Kuasa Pengarah
                        </span>
                      )}
                      {pv.status === 'APPROVED_MANAGEMENT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                          <CheckCircle2 className="w-3 h-3" /> Diluluskan Pengarah
                        </span>
                      )}
                      {pv.status === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800" title={pv.rejectReason}>
                          Ditolak{pv.rejectReason ? `: ${pv.rejectReason}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => setSelectedPVForView(pv)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                        title="Lihat Baucar Penuh & Cop Digital"
                      >
                        <Printer className="w-3 h-3" /> Cetak PV
                      </button>

                      {isPendingSup && (
                        <>
                          {isSupervisor || isManagement ? (
                            <>
                              <button
                                onClick={() => handleApprove(pv.id)}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                              >
                                ✓ Luluskan
                              </button>
                              <button
                                onClick={() => handleReject(pv.id)}
                                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] cursor-pointer"
                              >
                                ✕ Tolak
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Tiada Kuasa Melulus</span>
                          )}
                        </>
                      )}

                      {isPendingMgmt && (
                        <>
                          {isManagement ? (
                            <>
                              <button
                                onClick={() => handleApprove(pv.id)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                              >
                                ✓ Luluskan (Pengarah)
                              </button>
                              <button
                                onClick={() => handleReject(pv.id)}
                                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] cursor-pointer"
                              >
                                ✕ Tolak
                              </button>
                            </>
                          ) : isSupervisor ? (
                            <span className="text-[10px] text-amber-600 font-semibold">Perlu Pengarah (&gt;RM3k)</span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Tiada Kuasa Melulus</span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SUB-TAB 2: VENDOR MASTER DATABASE (SOP Seksyen 6.2) */}
      {activeSubTab === 'vendors' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-600" /> Pangkalan Data Pembekal Berdaftar (Vendor Master Database)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Senarai vendor sah yang mempunyai pendaftaran SSM, Nombor Pengenalan Cukai (TIN) dan butiran akaun bank rasmi
              </p>
            </div>
            <button
              onClick={() => alert("Borang penambahan vendor baharu dibuka untuk kelulusan Supervisor.")}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> + Tambah Pembekal Baru
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-3">Nama Pembekal</th>
                  <th className="py-3 px-3">No. SSM</th>
                  <th className="py-3 px-3">No. Cukai (TIN)</th>
                  <th className="py-3 px-3">PIC</th>
                  <th className="py-3 px-3">No. Telefon</th>
                  <th className="py-3 px-3">Maklumat Bank Pembayaran</th>
                  <th className="py-3 px-3">Status Pengesahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-bold text-slate-900">{v.name}</td>
                    <td className="py-3 px-3 font-medium text-slate-600">{v.ssm}</td>
                    <td className="py-3 px-3 font-semibold text-indigo-700">{v.tin}</td>
                    <td className="py-3 px-3 text-slate-600">{v.cat}</td>
                    <td className="py-3 px-3 text-slate-600">{v.phone}</td>
                    <td className="py-3 px-3 font-medium text-slate-800">{v.bank}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit ${v.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {v.status === 'ACTIVE' && <Check className="w-3 h-3" />} {v.status === 'ACTIVE' ? 'Aktif' : 'Tidak Aktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE PV MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Cipta Baucar Bayaran (PV) Baru</h3>
                <p className="text-xs text-slate-500">No. PV dijana automatik (PVYY-MM01)</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pilih Pembekal Berdaftar (Vendor Master) *</label>
                <select
                  required
                  value={newPV.vendorId}
                  onChange={(e) => setNewPV({ ...newPV, vendorId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="">Pilih pembekal…</option>
                  {vendors.filter(v => v.status === 'ACTIVE').map(v => (
                    <option key={v.id} value={v.id}>{v.name} (TIN: {v.tin})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kategori Perbelanjaan *</label>
                <select
                  required
                  value={newPV.category}
                  onChange={(e) => setNewPV({ ...newPV, category: e.target.value, subcategory: '' })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="">Pilih kategori…</option>
                  {categories.map((c) => <option key={c.value} value={c.label}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subkategori</label>
                <select
                  value={newPV.subcategory}
                  onChange={(e) => setNewPV({ ...newPV, subcategory: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="">Tiada / pilih…</option>
                  {subcategoryOptions(newPV.category).map((c) => <option key={c.value} value={c.label}>{c.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kaedah Bayaran *</label>
                  <select
                    value={newPV.method}
                    onChange={(e) => setNewPV({ ...newPV, method: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
                  >
                    {paymentMethods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Rujukan</label>
                  <input
                    value={newPV.ref}
                    onChange={(e) => setNewPV({ ...newPV, ref: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jumlah Bayaran (RM) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Contoh: 450.00"
                  value={newPV.amount}
                  onChange={(e) => setNewPV({ ...newPV, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-indigo-900 outline-none focus:border-indigo-500"
                />
                <div className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1">
                  <span>Aliran Kelulusan:</span>
                  {parseFloat(newPV.amount || 0) > 3000 ? (
                    <strong className="text-purple-700 font-bold">&gt; RM3,000 (Kelulusan Pengarah)</strong>
                  ) : parseFloat(newPV.amount || 0) >= 500 ? (
                    <strong className="text-blue-700 font-bold">RM500 - RM3,000 (Kelulusan Supervisor)</strong>
                  ) : (
                    <strong className="text-emerald-700 font-bold">&lt; RM500 (Petty Cash Admin)</strong>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Perincian Item / Tujuan Pembayaran *</label>
                <textarea
                  rows="2"
                  required
                  placeholder="Huraian item perbelanjaan..."
                  value={newPV.desc}
                  onChange={(e) => setNewPV({ ...newPV, desc: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan</label>
                <input
                  value={newPV.remarks}
                  onChange={(e) => setNewPV({ ...newPV, remarks: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer">
                  Simpan & Ajukan Baucar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE / VIEWABLE PV VOUCHER MODAL (SOP Seksyen 6.3) */}
      {selectedPVForView && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5 text-xs max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="text-center border-b pb-4">
              <h2 className="text-base font-bold text-slate-900">PUSAT TUISYEN AN NUR</h2>
              <p className="text-[11px] text-slate-500">PT 105 Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan</p>
              <p className="text-[11px] text-slate-500">Tel: 013-983 8085 • TIN: C9821049201</p>
              <div className="mt-2 font-black text-sm text-indigo-800 tracking-wider">BAUCAR BAYARAN (PAYMENT VOUCHER)</div>
            </div>

            {/* Voucher Metadata */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div>
                <span className="text-slate-400 block text-[10px]">NO. BAUCAR:</span>
                <strong className="text-indigo-700 text-sm">{selectedPVForView.pv_no}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">TARIKH PENGELUARAN:</span>
                <strong className="text-slate-800">{selectedPVForView.date}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">DIBAYAR KEPADA:</span>
                <strong className="text-slate-900">{selectedPVForView.vendor}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">NO. CUKAI (TIN):</span>
                <span className="text-slate-700 font-mono">{selectedPVForView.tin}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[10px]">AKAUN BANK PENERIMA:</span>
                <span className="text-slate-800 font-semibold">{selectedPVForView.bank}</span>
              </div>
            </div>

            {/* Description & Amount */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100 px-3 py-2 font-bold text-slate-700 flex justify-between">
                <span>Keterangan Perbelanjaan</span>
                <span>Jumlah (MYR)</span>
              </div>
              <div className="p-3 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-slate-900">{selectedPVForView.desc}</div>
                  <div className="text-[10px] text-slate-400">Kategori: {selectedPVForView.category}</div>
                </div>
                <div className="font-black text-slate-900 text-sm">RM {selectedPVForView.amount.toFixed(2)}</div>
              </div>
              <div className="bg-indigo-50 px-3 py-2.5 border-t border-slate-200 flex justify-between items-center font-bold">
                <span className="text-indigo-950">JUMLAH KESELURUHAN:</span>
                <span className="text-indigo-900 font-black text-base">RM {selectedPVForView.amount.toFixed(2)}</span>
              </div>
            </div>

            {/* 3-Tier Digital Signatures Audit Box */}
            <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 space-y-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
                Jejak Audit & Cop Digital Pengesahan (SOP 6.3)
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block">Disediakan Oleh</span>
                  <strong className="text-slate-800 block mt-1">{selectedPVForView.preparedBy}</strong>
                  <span className="text-[9px] text-emerald-600 font-bold">✓ Rekod Kaunter</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block">Disahkan Oleh</span>
                  <strong className="text-slate-800 block mt-1">{selectedPVForView.verifiedBy}</strong>
                  <span className="text-[9px] font-bold text-blue-600">
                    {selectedPVForView.verifiedBy !== '-' ? '✓ Disahkan' : '⏳ Menunggu'}
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block">Diluluskan Oleh</span>
                  <strong className="text-slate-800 block mt-1">{selectedPVForView.approvedBy}</strong>
                  <span className="text-[9px] font-bold text-indigo-600">
                    {selectedPVForView.approvedBy !== '-' ? '✓ Kuasa Pengarah' : (selectedPVForView.amount <= 3000 ? 'Bawah Had RM3k' : '⏳ Menunggu')}
                  </span>
                </div>
              </div>
              {selectedPVForView.signedAt && (
                <div className="text-center text-[9px] text-slate-400">
                  Dicipta: {selectedPVForView.signedAt}
                </div>
              )}
            </div>

            <AttachmentList
              kind="VOUCHER"
              objectId={selectedPVForView.id}
              title="Lampiran (resit, invois vendor, sebut harga)"
              canUpload={PV_OPEN.includes(selectedPVForView.status)}
              canDelete={PV_OPEN.includes(selectedPVForView.status)}
              emptyText="Tiada lampiran."
              hint={PV_OPEN.includes(selectedPVForView.status) ? 'PDF atau gambar, maksimum 10 MB setiap fail. Lampiran dikunci selepas baucar diluluskan atau ditolak.' : 'Baucar telah diputuskan; lampiran dikunci.'}
            />

            <SignaturePad objectId={selectedPVForView.id} canSign={selectedPVForView.status !== 'REJECTED'} />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedPVForView(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
              >
                Tutup
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak / PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}