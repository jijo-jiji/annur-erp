import React from 'react';
import {
  LayoutDashboard, UserPlus, Calendar, CalendarSync, GraduationCap,
  Receipt, FileText, Sliders, QrCode, Filter, Users, BookOpen, Shield,
  CheckSquare, TrendingUp, DollarSign, Award, Clock
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, currentRole }) {
  // Strict Role-Based Menu Definitions matching j-status.doc
  const adminMenu = [
    { id: 'dashboard', label: 'Dashboard Kaunter & Operasi', icon: LayoutDashboard, badge: 'Kaunter' },
    { id: 'leads', label: 'Pertanyaan & Prospek (CRM)', icon: Filter, badge: 'Prospek' },
    { id: 'students', label: 'Pendaftaran & Senarai Pelajar', icon: UserPlus },
    { id: 'attendance', label: 'Kehadiran Pelajar', icon: CheckSquare },
    { id: 'timetable', label: 'Semak Jadual Waktu 2026', icon: Calendar },
    { id: 'reschedules', label: 'Catatan Batal & Ganti Kelas', icon: CalendarSync },
    { id: 'handouts', label: 'Modul & Nota (Cetakan)', icon: BookOpen },
    { id: 'teachers', label: 'Senarai Guru (Tanpa Kadar)', icon: GraduationCap, badge: 'Kadar Sulit' },
    { id: 'teacher_attendance', label: 'Kehadiran Guru', icon: CheckSquare },
    { id: 'billing', label: 'Kutipan Yuran & DuitNow QR', icon: Receipt },
    { id: 'expenses', label: 'Baucar Bayaran (< RM500)', icon: FileText, badge: 'Petty Cash' },
    { id: 'staff_hr', label: 'Perakam Waktu & Cuti Staf', icon: Clock },
    { id: 'dynamic_master_data', label: 'Cadang Data Induk', icon: Sliders },
    { id: 'parent_qr', label: 'Imbasan QR Kaunter', icon: QrCode },
  ];

  const supervisorMenu = [
    { id: 'dashboard', label: 'Dashboard Analitik & Kualiti', icon: LayoutDashboard, badge: 'Analitik' },
    { id: 'leads', label: 'Pertanyaan & Prospek (CRM)', icon: Filter },
    { id: 'students', label: 'Pemantauan Pelajar & Gred', icon: UserPlus },
    { id: 'attendance', label: 'Kehadiran Pelajar', icon: CheckSquare },
    { id: 'timetable', label: 'Pengurusan Jadual & Kapasiti', icon: Calendar, badge: 'Laras Bilik' },
    { id: 'reschedules', label: 'Kelulusan Sesi Gantian Kelas', icon: CalendarSync, badge: 'Pengesahan' },
    { id: 'handouts', label: 'Repositori Modul & Nota', icon: BookOpen },
    { id: 'teachers', label: 'Direktori & Elaun Guru (Kadar Penuh)', icon: GraduationCap, badge: 'Kadar Penuh' },
    { id: 'teacher_attendance', label: 'Kehadiran Guru', icon: CheckSquare },
    { id: 'teacher_payroll', label: 'Gaji Guru (Kira & Sahkan)', icon: DollarSign },
    { id: 'staff_hr', label: 'Staf: Kehadiran, Cuti & KPI', icon: Users, badge: 'Kelulusan' },
    { id: 'billing', label: 'Kutipan Yuran & Diskaun', icon: Receipt },
    { id: 'expenses', label: 'Kelulusan Baucar (RM500 - RM3,000)', icon: FileText, badge: 'Had RM3k' },
    { id: 'dynamic_master_data', label: 'Kelulusan Data Induk', icon: Sliders },
    { id: 'reports_suite', label: 'Pusat Laporan', icon: TrendingUp },
    { id: 'management_config', label: 'Katalog Subjek & Kapasiti', icon: Sliders, badge: 'No-Code' },
  ];

  const managementMenu = [
    { id: 'dashboard', label: 'Dashboard Eksekutif Pengarah', icon: LayoutDashboard, badge: 'Eksekutif' },
    { id: 'reports_suite', label: 'Pusat Laporan', icon: TrendingUp },
    { id: 'billing', label: 'Laporan Jualan & Kutipan Yuran', icon: Receipt },
    { id: 'expenses', label: 'Kelulusan Baucar (> RM3,000)', icon: FileText, badge: 'Kuasa Pengarah' },
    { id: 'teachers', label: 'Guru, Kadar & Aduan', icon: GraduationCap },
    { id: 'teacher_payroll', label: 'Gaji Guru (Kelulusan)', icon: DollarSign },
    { id: 'teacher_attendance', label: 'Kehadiran Guru', icon: CheckSquare },
    { id: 'dynamic_master_data', label: 'Data Induk', icon: Sliders },
    { id: 'management_config', label: 'Hab Konfigurasi Perniagaan', icon: Sliders, badge: 'No-Code' },
    { id: 'students', label: 'Audit Enrolmen & Hasil Pelajar', icon: UserPlus },
    { id: 'attendance', label: 'Kehadiran Pelajar', icon: CheckSquare },
    { id: 'timetable', label: 'Jadual Induk: Kapasiti & Kelulusan', icon: Calendar },
    { id: 'reschedules', label: 'Pengesahan Kelas Ganti / Tambahan', icon: CalendarSync },
    { id: 'staff_hr', label: 'Staf HR: Profil, Cuti & KPI', icon: Users },
  ];

  const currentMenuItems =
    currentRole === 'ADMIN'
      ? adminMenu
      : currentRole === 'SUPERVISOR'
      ? supervisorMenu
      : managementMenu;

  const roleMeta = {
    ADMIN: {
      title: 'PORTAL KAUNTER (ADMIN)',
      desc: 'Pengurusan pendaftaran & kutipan harian',
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-200'
    },
    SUPERVISOR: {
      title: 'PORTAL OPERASI (SUPERVISOR)',
      desc: 'Pemantauan kualiti akademik & jadual',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    MANAGEMENT: {
      title: 'PORTAL PENGARAH (MANAGEMENT)',
      desc: 'Keputusan kewangan, polisi & kelulusan utama',
      badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200'
    }
  }[currentRole] || { title: 'MENU OPERASI', desc: '', badgeClass: 'bg-slate-100 text-slate-700' };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between py-4 shrink-0 min-h-[calc(100vh-65px)]">
      <div className="px-3 space-y-1">
        {/* Role Header Banner */}
        <div className="p-3 mb-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-wider uppercase text-slate-500">
              {roleMeta.title}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            {roleMeta.desc}
          </p>
        </div>

        {/* Dynamic RBAC Menu Items */}
        <div className="space-y-1">
          {currentMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span className="text-left">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                      isActive ? 'bg-indigo-700 text-indigo-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* System Status Footer */}
      <div className="px-4 py-3 mx-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700">Peranan Aktif:</span>
          <span className="font-bold text-indigo-700">{currentRole}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span>Had Kuasa PV:</span>
          <span className="text-slate-700 font-semibold">
            {currentRole === 'ADMIN' ? '< RM500' : currentRole === 'SUPERVISOR' ? 'RM500 - RM3,000' : '> RM3,000 (Penuh)'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span>Kadar Elaun Guru:</span>
          <span className={currentRole === 'ADMIN' ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
            {currentRole === 'ADMIN' ? 'Dirahsiakan' : 'Akses Diberikan'}
          </span>
        </div>
      </div>
    </aside>
  );
}
