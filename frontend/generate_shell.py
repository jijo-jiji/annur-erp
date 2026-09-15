import os

# 1. Header.jsx
with open("src/components/Header.jsx", "w", encoding="utf-8") as f:
    f.write('''import React from 'react';
import { GraduationCap, ShieldCheck, Bell, MessageSquare, PhoneCall } from 'lucide-react';

export default function Header({ currentRole, setRole }) {
  const roles = [
    { id: 'ADMIN', label: 'Admin (Kaunter)', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'SUPERVISOR', label: 'Supervisor (Akademik)', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { id: 'MANAGEMENT', label: 'Management (Pengarah)', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'PARENT_QR', label: 'Portal Ibu Bapa (QR)', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Pusat Tuisyen An Nur</h1>
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
              Telipot
            </span>
          </div>
          <p className="text-xs text-slate-500">Sistem Pengurusan Operasi & Pendaftaran ERP</p>
        </div>
      </div>

      {/* Role Quick Switcher Pills (Figma Prototype Style) */}
      <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200">
        <span className="text-xs font-semibold text-slate-500 px-2 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Peranan:
        </span>
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => setRole(r.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              currentRole === r.id
                ? `${r.color} font-semibold shadow-sm ring-2 ring-indigo-500/20`
                : 'bg-white text-slate-600 border-transparent hover:bg-slate-50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Header Utilities */}
      <div className="flex items-center gap-3">
        <a
          href="https://wa.me/60139838085"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" /> Hotline: 013-983 8085
        </a>
      </div>
    </header>
  );
}
''')

# 2. Sidebar.jsx
with open("src/components/Sidebar.jsx", "w", encoding="utf-8") as f:
    f.write('''import React from 'react';
import {
  LayoutDashboard,
  UserPlus,
  Calendar,
  CalendarSync,
  GraduationCap,
  Receipt,
  FileText,
  Sliders,
  QrCode
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, currentRole }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard & Analitik', icon: LayoutDashboard, roles: ['ADMIN', 'SUPERVISOR', 'MANAGEMENT'] },
    { id: 'students', label: 'Pendaftaran & Pelajar', icon: UserPlus, roles: ['ADMIN', 'SUPERVISOR', 'MANAGEMENT'] },
    { id: 'timetable', label: 'Jadual Master 2026', icon: Calendar, roles: ['ADMIN', 'SUPERVISOR', 'MANAGEMENT'] },
    { id: 'reschedules', label: 'Catatan Pembatalan & Ganti', icon: CalendarSync, roles: ['ADMIN', 'SUPERVISOR', 'MANAGEMENT'] },
    { id: 'teachers', label: 'Elaun & Guru 2026', icon: GraduationCap, roles: ['ADMIN', 'SUPERVISOR', 'MANAGEMENT'] },
    { id: 'billing', label: 'Yuran & Resit Rasmi', icon: Receipt, roles: ['ADMIN', 'SUPERVISOR', 'MANAGEMENT'] },
    { id: 'expenses', label: 'Baucar Bayaran (PV)', icon: FileText, roles: ['ADMIN', 'SUPERVISOR', 'MANAGEMENT'] },
    {
      id: 'management_config',
      label: 'Tetapan Perniagaan',
      icon: Sliders,
      badge: 'No-Code',
      roles: ['SUPERVISOR', 'MANAGEMENT']
    },
    { id: 'parent_qr', label: 'Portal Ibu Bapa (QR)', icon: QrCode, roles: ['ADMIN', 'SUPERVISOR', 'MANAGEMENT', 'PARENT_QR'] },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between py-4 shrink-0 min-h-[calc(100vh-65px)]">
      <div className="px-3 space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold tracking-wider uppercase text-slate-400">
          Menu Operasi
        </div>
        {menuItems
          .filter((item) => item.roles.includes(currentRole))
          .map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      isActive ? 'bg-indigo-700 text-indigo-100' : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* System Status Footer */}
      <div className="px-4 py-3 mx-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700">Tahun Sesi:</span>
          <span className="font-bold text-indigo-600">2026</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span>Kapasiti Kerusi:</span>
          <span className="text-emerald-600 font-semibold">Aktif Memantau</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span>WhatsApp API:</span>
          <span className="text-emerald-600 font-semibold">Tersambung</span>
        </div>
      </div>
    </aside>
  );
}
''')

print("HEADER_AND_SIDEBAR_WRITTEN")
