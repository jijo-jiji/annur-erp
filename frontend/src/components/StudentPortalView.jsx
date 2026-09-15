import React, { useState } from 'react';
import { Calendar, Receipt, BookOpen, Award, CheckCircle2, MessageSquare, QrCode, Phone, Download } from 'lucide-react';
import ParentQRView from './ParentQRView';

export default function StudentPortalView() {
  const [portalTab, setPortalTab] = useState('jadual');

  const studentData = {
    id: "AN-2026-001",
    name: "Ahmad Daniyal bin Razali",
    ic: "090514-03-5511",
    form: "Tingkatan 5 (SPM 2026)",
    stream: "Aliran Sains Tulen",
    school: "SMK Telipot, Kota Bharu",
    parent: "Encik Razali bin Mahmud",
    parentPhone: "012-987 6541",
    enrolledClasses: [
      { code: "F5 FIZIK (A)", day: "Jumaat", time: "9.00 - 10.30 Pagi", teacher: "Cikgu Nik Ahmad Khan (NAK)", room: "Bilik Al-Farabi" },
      { code: "F5 KIMIA (A)", day: "Sabtu", time: "2.15 - 3.45 Petang", teacher: "Cikgu Saiful (SF)", room: "Bilik Ibnu Sina" },
      { code: "F5 BIOLOGI (A)", day: "Khamis", time: "8.30 - 10.00 Malam", teacher: "Cikgu Diana (D)", room: "Bilik Al-Khawarizmi" },
      { code: "F5 ADD MATH (A)", day: "Jumaat", time: "3.00 - 4.30 Petang", teacher: "Cikgu Zakir / Zamri (Z)", room: "Bilik Ibnu Khaldun" },
    ],
    billing: {
      invoiceNo: "INV-2026-001",
      month: "Mac 2026",
      monthlyFee: 240.0,
      regFee: 30.0,
      total: 270.0,
      status: "PAID",
      receiptNo: "REC-2026-0001",
      paymentDate: "04/03/2026",
      method: "DuitNow QR"
    },
    results: [
      { subject: "Fizik", grade: "A", marks: 82 },
      { subject: "Kimia", grade: "A-", marks: 78 },
      { subject: "Biologi", grade: "B+", marks: 74 },
      { subject: "Matematik Tambahan", grade: "A", marks: 85 },
    ]
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Student Welcome Header Card */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-200 uppercase tracking-wider">
            Portal Pelajar & Ibu Bapa
          </span>
          <h2 className="text-xl sm:text-2xl font-black mt-2">{studentData.name}</h2>
          <p className="text-xs text-emerald-100/90 mt-1">
            {studentData.id} • {studentData.form} • {studentData.stream} • {studentData.school}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://wa.me/60139838085"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-xl bg-white text-emerald-900 font-bold text-xs hover:bg-emerald-50 transition shadow-sm flex items-center gap-1.5"
          >
            <MessageSquare className="w-4 h-4 text-[#25D366]" /> Bantuan Kaunter (WhatsApp)
          </a>
        </div>
      </div>

      {/* Portal Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setPortalTab('jadual')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            portalTab === 'jadual'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" /> Jadual Kelas Saya
        </button>
        <button
          onClick={() => setPortalTab('resit')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            portalTab === 'resit'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" /> Yuran & Resit Rasmi
        </button>
        <button
          onClick={() => setPortalTab('prestasi')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            portalTab === 'prestasi'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Award className="w-3.5 h-3.5" /> Prestasi & Keputusan (SAPS)
        </button>
        <button
          onClick={() => setPortalTab('daftar_baru')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            portalTab === 'daftar_baru'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" /> Borang Pendaftaran Baru (QR)
        </button>
      </div>

      {/* Tab 1: Jadual Kelas Pelajar */}
      {portalTab === 'jadual' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Jadual Kelas Mingguan (4 Subjek Berdaftar)</h3>
            <span className="text-xs text-indigo-600 font-semibold">1 Sesi = 1 Jam 30 Minit</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {studentData.enrolledClasses.map((cls, idx) => (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700">
                    {cls.day} • {cls.time}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">{cls.room}</span>
                </div>
                <h4 className="text-base font-extrabold text-slate-900">{cls.code}</h4>
                <p className="text-xs text-slate-600">Guru Pengajar: <strong>{cls.teacher}</strong></p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Status: Terdaftar
                  </span>
                  <span className="text-slate-400">Pusat Tuisyen An Nur Telipot</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Yuran & Resit Rasmi */}
      {portalTab === 'resit' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Selesai Dibayar (Lunas)
              </span>
              <h3 className="text-lg font-black text-slate-900 mt-1">Invois & Resit Rasmi Mac 2026</h3>
              <p className="text-xs text-slate-500">No. Invois: {studentData.billing.invoiceNo} • Tarikh Bayaran: {studentData.billing.paymentDate}</p>
            </div>
            <button
              onClick={() => alert(`Memuat turun Salinan Resit Rasmi ${studentData.billing.receiptNo}...`)}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-sm flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Muat Turun Resit PDF
            </button>
          </div>

          <div className="space-y-2 text-xs text-slate-700">
            <div className="flex justify-between py-2 border-b">
              <span>Yuran Bulanan (Pakej 4 Subjek Menengah):</span>
              <span className="font-bold text-slate-900">RM 240.00</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>Yuran Pendaftaran Rasmi (Sekali Semasa Mendaftar):</span>
              <span className="font-bold text-slate-900">RM 30.00</span>
            </div>
            <div className="flex justify-between py-3 text-sm font-black text-slate-900">
              <span>JUMLAH DIBAYAR:</span>
              <span className="text-base text-emerald-600">RM 270.00 (Lunas)</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 pt-1">
              <span>Kaedah Pembayaran:</span>
              <span>DuitNow QR Kebangsaan</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>No. Siri Resit Rasmi:</span>
              <span className="font-bold text-indigo-700">{studentData.billing.receiptNo}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Prestasi SAPS MOE */}
      {portalTab === 'prestasi' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Rekod Keputusan Peperiksaan Terkini</h3>
              <p className="text-xs text-slate-500">Dipantau bersama keputusan SAPS MOE (sapsnkra.moe)</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
              Peperiksaan Pertengahan Tahun 2026
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {studentData.results.map((r, i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
                <span className="text-xs text-slate-600 font-semibold">{r.subject}</span>
                <div className="text-2xl font-black text-indigo-900">{r.grade}</div>
                <span className="text-[11px] text-emerald-600 font-bold">{r.marks}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Pendaftaran Baru */}
      {portalTab === 'daftar_baru' && (
        <ParentQRView />
      )}
    </div>
  );
}