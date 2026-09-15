import React, { useState, useEffect } from 'react';
import { Users, UserCheck, Banknote, AlertTriangle, AlertCircle, CheckCircle2, MessageSquare, ArrowUpRight } from 'lucide-react';

export default function DashboardView({ onNavigate }) {
  const [summary, setSummary] = useState({
    total_students: 5,
    active_monthly: 5,
    walk_in_students: 0,
    monthly_sales: 1210.0,
    outstanding_arrears: 0.0,
    teachers_active: 23,
    overcapacity_classes: ['F5 ADDMT (A) Z', 'F4 ADDMT (A) Z'],
    near_full_classes: ['F4 BI (A) Z', 'F3 SEJ (A) M', 'F3 SAINS (A) AZ'],
    recent_reschedules: [
      { class_code: 'F5 MATH (A) NAK', batal: '2025-12-09', ganti: '2025-12-30', remarks: 'Hari Krismas (PH)', is_extra: false },
      { class_code: 'F5 BIO (A) D', batal: '2026-01-23', ganti: '2026-01-30', remarks: 'Cg marking paper', is_extra: false },
      { class_code: 'F4 FIZIK (A) NAK', batal: '2026-01-24', ganti: '2026-01-31', remarks: 'Cg silap tgk masa batal 30 min', is_extra: false },
      { class_code: 'F5 KIM (A) SF', batal: null, ganti: '2026-01-31', remarks: 'Sesi intensif kelas tambahan', is_extra: true },
    ],
    alerts: [
      { type: 'danger', msg: 'Amaran Kapasiti: 2 kelas melebihi had 20 kerusi (F5 ADDMT A: 21/20, F4 ADDMT A: 22/20)!' },
      { type: 'warning', msg: 'Kutipan Yuran Bulanan: Tarikh akhir sebelum 7hb. Sila semak status resit & peringatan WhatsApp.' },
      { type: 'info', msg: 'Jadual Master 2026: Sesi gantian kelas telah disahkan oleh Supervisor.' }
    ]
  });

  useEffect(() => {
    fetch('/api/v1/dashboard/summary/')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSummary(data);
      })
      .catch((err) => console.log('Using initial dashboard state:', err));
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 text-white rounded-2xl p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-indigo-500/30 text-indigo-200 uppercase tracking-wider">
            Sesi Akademik 2026
          </span>
          <h2 className="text-xl font-bold mt-2">Pusat Tuisyen An Nur (Telipot)</h2>
          <p className="text-xs text-indigo-200 mt-1 max-w-xl">
            Tingkat 1, PT 105, Seksyen 23, Jalan Telipot, Kota Bharu. Sistem pemantauan kapasiti bilik darjah,
            pendaftaran berpusat, jadual waktu, dan resit WhatsApp secara automatik.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('students')}
            className="px-4 py-2.5 rounded-xl bg-white text-indigo-900 font-semibold text-xs hover:bg-indigo-50 transition shadow-sm"
          >
            + Pendaftaran Pelajar
          </button>
          <button
            onClick={() => onNavigate('billing')}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 transition border border-indigo-400/30"
          >
            Rekod Yuran & Resit
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pelajar Aktif</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{summary.total_students}</div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <span className="text-emerald-600 font-semibold">{summary.active_monthly} Tetap</span> • {summary.walk_in_students} Walk-in
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Kutipan Yuran Mac '26</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">RM {summary.monthly_sales.toFixed(2)}</div>
          <p className="text-xs text-emerald-600 mt-1 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Berbayar melalui DuitNow QR
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Kapasiti Terhad</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600">{summary.overcapacity_classes.length} Kelas</div>
          <p className="text-xs text-rose-500 mt-1 font-medium">Melebihi had kerusi (Contoh: -2)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Guru Berdaftar</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{summary.teachers_active} Orang</div>
          <p className="text-xs text-slate-500 mt-1">Cikgu Permanent & Ganti Aktif</p>
        </div>
      </div>

      {/* Real-time Alerts Feed */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-indigo-600" /> Pusat Notifikasi & Makluman Operasi
        </h3>
        <div className="space-y-2">
          {summary.alerts.map((al, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${
                al.type === 'danger'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : al.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              <span className="mt-0.5">•</span>
              <span>{al.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: Overcapacity Classes & Recent Reschedule Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Pemantauan Kapasiti Kerusi Langsung</h3>
            <button
              onClick={() => onNavigate('timetable')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              Lihat Jadual <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2.5">
            {summary.overcapacity_classes.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs">
                <span className="font-bold text-rose-900">{c}</span>
                <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-bold text-[11px]">
                  Lebihan -{i + 1} Kerusi
                </span>
              </div>
            ))}
            {summary.near_full_classes.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                <span className="font-semibold text-amber-900">{c}</span>
                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white font-semibold text-[11px]">
                  Hampir Penuh (Baki 1-2)
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Catatan Gantian & Kelas Tambahan Terkini</h3>
            <button
              onClick={() => onNavigate('reschedules')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              Semua Log <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2.5 text-xs">
            {summary.recent_reschedules.map((r, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-2">
                    {r.class_code}
                    {r.is_extra && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 font-bold text-[10px]">
                        EXTRA
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {r.batal ? `Batal: ${r.batal} ➔ Ganti: ${r.ganti}` : `Tarikh: ${r.ganti}`} ({r.remarks})
                  </p>
                </div>
                <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                  Disahkan
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}