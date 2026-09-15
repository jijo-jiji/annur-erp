import React from 'react';
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
