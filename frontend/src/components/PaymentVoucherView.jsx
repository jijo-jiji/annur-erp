import React, { useState } from 'react';
import { FileText, Plus, ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react';

export default function PaymentVoucherView({ currentRole }) {
  const [vouchers, setVouchers] = useState([
    { id: 1, pv_no: "PV26-0301", date: "2026-03-02", vendor: "Pustaka Sri Telipot", category: "Alat Tulis & Kertas", amount: 350.0, tier: "TIER_1", status: "VERIFIED_ADMIN", desc: "Pembelian 10 rim kertas A4 & modul latihan SPM" },
    { id: 2, pv_no: "PV26-0302", date: "2026-03-05", vendor: "Sri Telipot Aircond Services", category: "Penyelenggaraan & Fasiliti", amount: 1200.0, tier: "TIER_2", status: "APPROVED_SUPERVISOR", desc: "Servis 4 unit penghawa dingin bilik darjah tingkat 1 & 2" },
    { id: 3, pv_no: "PV26-0303", date: "2026-03-10", vendor: "Percetakan Kota Bharu", category: "Buku Teks & Modul 2026", amount: 3400.0, tier: "TIER_3", status: "APPROVED_MANAGEMENT", desc: "Percetakan buku modul SPM 2026 untuk semua subjek teras" },
  ]);

  const [showModal, setShowModal] = useState(false);
  const [newPV, setNewPV] = useState({
    vendor: '',
    category: 'Alat Tulis & Buku Modul',
    amount: '',
    desc: ''
  });

  const handleCreate = (e) => {
    e.preventDefault();
    const amt = parseFloat(newPV.amount);
    let tier = 'TIER_1';
    let stat = 'VERIFIED_ADMIN';
    if (amt > 3000) {
      tier = 'TIER_3';
      stat = 'APPROVED_MANAGEMENT';
    } else if (amt >= 500) {
      tier = 'TIER_2';
      stat = 'APPROVED_SUPERVISOR';
    }

    const nextNo = `PV26-030${vouchers.length + 1}`;
    setVouchers([
      {
        id: vouchers.length + 1,
        pv_no: nextNo,
        date: new Date().toISOString().split('T')[0],
        vendor: newPV.vendor,
        category: newPV.category,
        amount: amt,
        tier: tier,
        status: stat,
        desc: newPV.desc
      },
      ...vouchers
    ]);
    setShowModal(false);
    alert(`Baucar Bayaran ${nextNo} berjaya dijana mengikut had kelulusan ${tier}!`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Modul Perbelanjaan & Baucar Bayaran (PV)</h2>
          <p className="text-xs text-slate-500">
            Had Kelulusan 3-Peringkat: Bawah RM500 (Admin), RM500 - RM3,000 (Supervisor), Melebihi RM3,000 (Management)
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> + Cipta Baucar Bayaran (PV)
        </button>
      </div>

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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vouchers.map((pv) => (
              <tr key={pv.id} className="hover:bg-slate-50 transition">
                <td className="py-3.5 px-4 font-bold text-indigo-700">{pv.pv_no}</td>
                <td className="py-3.5 px-4 text-slate-500">{pv.date}</td>
                <td className="py-3.5 px-4 font-semibold text-slate-900">{pv.vendor}</td>
                <td className="py-3.5 px-4 text-slate-600">{pv.category}</td>
                <td className="py-3.5 px-4 font-extrabold text-slate-900">RM {pv.amount.toFixed(2)}</td>
                <td className="py-3.5 px-4">
                  <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                    {pv.tier === 'TIER_1' ? '< RM500 (Admin)' : pv.tier === 'TIER_2' ? 'RM500-3K (Supervisor)' : '> RM3K (Management)'}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {pv.status === 'VERIFIED_ADMIN' ? 'Disahkan Kaunter' : pv.status === 'APPROVED_SUPERVISOR' ? 'Diluluskan Supervisor' : 'Diluluskan Pengarah'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cipta Baucar Bayaran (PV) Baru</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Pembekal / Penerima Bayaran *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pustaka Sri Telipot"
                  value={newPV.vendor}
                  onChange={(e) => setNewPV({ ...newPV, vendor: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kategori Perbelanjaan *</label>
                <select
                  value={newPV.category}
                  onChange={(e) => setNewPV({ ...newPV, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="Alat Tulis & Buku Modul">Alat Tulis & Buku Modul</option>
                  <option value="Penyelenggaraan & Fasiliti">Penyelenggaraan & Fasiliti</option>
                  <option value="Utiliti & Sewa">Utiliti (Elektrik/Air/Internet) & Sewa</option>
                  <option value="Elaun Tambahan Guru">Elaun Tambahan Guru</option>
                  <option value="Pemasaran & Banner">Pemasaran & Banner / Flyers</option>
                </select>
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
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-indigo-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Perincian Item / Tujuan Pembayaran *</label>
                <textarea
                  rows="2"
                  required
                  placeholder="Huraian item perbelanjaan..."
                  value={newPV.desc}
                  onChange={(e) => setNewPV({ ...newPV, desc: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">
                  Simpan & Sahkan PV
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}