import React, { useState } from 'react';
import { Receipt, QrCode, MessageSquare, Printer, CheckCircle2, Calculator } from 'lucide-react';

export default function BillingView() {
  const [invoices, setInvoices] = useState([
    { id: 1, inv_no: "INV-2026-001", student: "Ahmad Daniyal bin Razali", form: "F5", amount: 270.0, paid: 270.0, status: "PAID", receipt: "REC-2026-0001", phone: "012-9876541", parent: "Razali bin Mahmud" },
    { id: 2, inv_no: "INV-2026-002", student: "Nur Aisyah binti Mohd Zaki", form: "F5", amount: 240.0, paid: 240.0, status: "PAID", receipt: "REC-2026-0002", phone: "012-9876542", parent: "Mohd Zaki bin Salleh" },
    { id: 3, inv_no: "INV-2026-003", student: "Muhammad Haziq bin Imran", form: "F4", amount: 240.0, paid: 240.0, status: "PAID", receipt: "REC-2026-0003", phone: "012-9876543", parent: "Imran bin Abdullah" },
    { id: 4, inv_no: "INV-2026-004", student: "Farah Nadiah binti Azman", form: "F3", amount: 240.0, paid: 0.0, status: "UNPAID", receipt: null, phone: "012-9876544", parent: "Azman bin Yusof" },
    { id: 5, inv_no: "INV-2026-005", student: "Amirul Hakim bin Shukri", form: "S6", amount: 200.0, paid: 200.0, status: "PAID", receipt: "REC-2026-0004", phone: "012-9876545", parent: "Shukri bin Ramli" },
  ]);

  const [selectedInv, setSelectedInv] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Dynamic Calculator
  const [calcForm, setCalcForm] = useState('SECONDARY');
  const [calcCount, setCalcCount] = useState(4);
  const [calcRegFee, setCalcRegFee] = useState(true);

  const getMonthlyRate = () => {
    if (calcForm === 'SECONDARY') {
      if (calcCount === 4) return 240;
      if (calcCount === 5) return 275;
      if (calcCount === 6) return 330;
      if (calcCount === 7) return 350;
      if (calcCount === 8) return 400;
      return calcCount * 50;
    } else if (calcForm === 'DARJAH_5') {
      return 100;
    } else if (calcForm === 'DARJAH_6') {
      return 200;
    }
    return 50;
  };

  const monthlyFee = getMonthlyRate();
  const regFee = calcRegFee ? 30 : 0;
  const totalPayable = monthlyFee + regFee;

  const handlePay = (inv) => {
    setSelectedInv(inv);
    setShowQRModal(true);
  };

  const confirmPayment = () => {
    if (!selectedInv) return;
    const nextRec = `REC-2026-000${invoices.length + 1}`;
    setInvoices(
      invoices.map((inv) =>
        inv.id === selectedInv.id ? { ...inv, status: 'PAID', paid: inv.amount, receipt: nextRec } : inv
      )
    );
    setShowQRModal(false);
    alert(`Pembayaran RM${selectedInv.amount} disahkan! No. Resit: ${nextRec}. Sedia untuk dihantar ke WhatsApp.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Modul Pengebilan, DuitNow QR & Resit Rasmi</h2>
          <p className="text-xs text-slate-500">
            Penjanaan Invois Mengikut Pakej Harga, Resit Bersiri Berformat PDF, dan Notifikasi WhatsApp Berjadual
          </p>
        </div>
      </div>

      {/* Dynamic Price Calculator (Pakej Yuran) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-indigo-600" /> Kalkulator Pakej Yuran Rasmi (PACKANGE HARGA)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Peringkat Sekolah</label>
            <select
              value={calcForm}
              onChange={(e) => setCalcForm(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
            >
              <option value="SECONDARY">Sekolah Menengah (Form 1 - 5)</option>
              <option value="DARJAH_5">Darjah 5 (Pakej 2 Subjek)</option>
              <option value="DARJAH_6">Darjah 6 (Pakej 4 Subjek)</option>
            </select>
          </div>

          {calcForm === 'SECONDARY' && (
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Bilangan Subjek</label>
              <select
                value={calcCount}
                onChange={(e) => setCalcCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value={4}>4 Subjek (RM60 / subjek)</option>
                <option value={5}>5 Subjek (RM55 / subjek)</option>
                <option value={6}>6 Subjek (RM55 / subjek)</option>
                <option value={7}>7 Subjek (RM50 / subjek)</option>
                <option value={8}>8 Subjek (RM50 / subjek)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Bayaran Pendaftaran (RM30)</label>
            <label className="flex items-center gap-2 mt-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={calcRegFee}
                onChange={(e) => setCalcRegFee(e.target.checked)}
              />
              Sertakan Yuran Pendaftaran (+RM30)
            </label>
          </div>

          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-indigo-700">Jumlah Yuran Dikira:</span>
            <div className="text-xl font-extrabold text-indigo-950 mt-0.5">RM {totalPayable.toFixed(2)}</div>
            <span className="text-[10px] text-indigo-600">
              Bulanan: RM{monthlyFee} {calcRegFee ? '+ Pendaftaran: RM30' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Invoices and Payments Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
            <tr>
              <th className="py-3.5 px-4">No. Invois</th>
              <th className="py-3.5 px-4">Nama Pelajar</th>
              <th className="py-3.5 px-4">Tingkatan</th>
              <th className="py-3.5 px-4">Penjaga & Tel</th>
              <th className="py-3.5 px-4">Jumlah (RM)</th>
              <th className="py-3.5 px-4">Status Bayaran</th>
              <th className="py-3.5 px-4">No. Resit</th>
              <th className="py-3.5 px-4 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50 transition">
                <td className="py-3.5 px-4 font-bold text-slate-800">{inv.inv_no}</td>
                <td className="py-3.5 px-4 font-semibold text-slate-900">{inv.student}</td>
                <td className="py-3.5 px-4 font-medium text-slate-600">{inv.form}</td>
                <td className="py-3.5 px-4">
                  <div className="font-medium text-slate-800">{inv.parent}</div>
                  <div className="text-slate-400 text-[10px]">{inv.phone}</div>
                </td>
                <td className="py-3.5 px-4 font-extrabold text-slate-900">RM {inv.amount.toFixed(2)}</td>
                <td className="py-3.5 px-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      inv.status === 'PAID'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {inv.status === 'PAID' ? 'Selesai Bayar' : 'Belum Bayar'}
                  </span>
                </td>
                <td className="py-3.5 px-4 font-semibold text-indigo-600">{inv.receipt || '-'}</td>
                <td className="py-3.5 px-4 text-right space-x-2">
                  {inv.status === 'UNPAID' ? (
                    <button
                      onClick={() => handlePay(inv)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold text-[11px] hover:bg-indigo-700 transition"
                    >
                      Bayar Sekarang (QR)
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedInv(inv);
                          setShowReceiptModal(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition font-semibold text-[11px] flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" /> Cetak Resit
                      </button>
                      <a
                        href={`https://wa.me/60${inv.phone.replace(/[^0-9]/g, '').replace(/^0/, '')}?text=Assalamualaikum%20${encodeURIComponent(inv.parent)},%20terima%20kasih%20atas%20pembayaran%20yuran%20Pusat%20Tuisyen%20An%20Nur%20bagi%20pelajar%20${encodeURIComponent(inv.student)}.%0A%0ANo%20Resit:%20${inv.receipt}%0AJumlah:%20RM${inv.amount}.00%0AStatus:%20SELESAI%20DITERIMA%0A%0ASila%20simpan%20resit%20ini%20untuk%20rekod.%20Terima%20kasih.`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-[#25D366] border border-emerald-200 hover:bg-emerald-100 transition font-semibold text-[11px] inline-flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> WhatsApp Resit
                      </a>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DuitNow QR Payment Modal */}
      {showQRModal && selectedInv && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-slate-200 text-center space-y-4">
            <h3 className="text-base font-bold text-slate-900">Pembayaran DuitNow QR Rasmi</h3>
            <p className="text-xs text-slate-500">
              Pusat Tuisyen An Nur • Akaun Maybank 5640 0012 3456
            </p>

            <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 inline-block mx-auto">
              <div className="w-44 h-44 bg-white p-2 rounded-lg border flex flex-col items-center justify-center text-slate-400">
                <QrCode className="w-32 h-32 text-slate-800" />
                <span className="text-[10px] font-bold text-slate-600 mt-1">DuitNow QR Kebangsaan</span>
              </div>
            </div>

            <div className="text-sm font-extrabold text-indigo-900">
              Jumlah Perlu Dibayar: RM {selectedInv.amount.toFixed(2)}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowQRModal(false)}
                className="w-1/2 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Tutup
              </button>
              <button
                onClick={confirmPayment}
                className="w-1/2 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
              >
                Sahkan Bayaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {showReceiptModal && selectedInv && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl border border-slate-200 space-y-4 text-xs">
            <div className="text-center border-b pb-4">
              <h2 className="text-base font-bold text-slate-900">PUSAT TUISYEN AN NUR</h2>
              <p className="text-[11px] text-slate-500">Tingkat 1, PT 105, Seksyen 23, Jalan Telipot, Kota Bharu</p>
              <p className="text-[11px] text-slate-500">Tel: 013-983 8085</p>
              <div className="mt-2 font-bold text-sm text-indigo-700 uppercase">RESIT RASMI PEMBAYARAN</div>
            </div>

            <div className="space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span>No. Resit:</span>
                <strong className="text-slate-900">{selectedInv.receipt}</strong>
              </div>
              <div className="flex justify-between">
                <span>Tarikh:</span>
                <span>13/03/2026</span>
              </div>
              <div className="flex justify-between">
                <span>Nama Pelajar:</span>
                <strong className="text-slate-900">{selectedInv.student}</strong>
              </div>
              <div className="flex justify-between">
                <span>Tingkatan:</span>
                <span>{selectedInv.form}</span>
              </div>
              <div className="flex justify-between">
                <span>Nama Pembayar (Penjaga):</span>
                <span>{selectedInv.parent}</span>
              </div>
              <div className="flex justify-between">
                <span>Kaedah Pembayaran:</span>
                <span>DuitNow QR</span>
              </div>
            </div>

            <div className="border-t border-b py-3 flex justify-between items-center text-sm">
              <span className="font-bold text-slate-800">JUMLAH DITERIMA:</span>
              <span className="font-extrabold text-indigo-900 text-base">RM {selectedInv.amount.toFixed(2)}</span>
            </div>

            <p className="text-[10px] text-slate-400 text-center italic">
              Resit ini dijana secara komputer oleh Sistem ERP Pusat Tuisyen An Nur. Tiada tandatangan fizikal diperlukan.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-semibold"
              >
                Tutup
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold"
              >
                Cetak / Simpan PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}