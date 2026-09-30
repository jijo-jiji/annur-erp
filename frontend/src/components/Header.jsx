import React from 'react';
import { GraduationCap, ShieldCheck, LogOut, MessageSquare } from 'lucide-react';

export default function Header({ user, onLogout }) {
  const roleStyles = {
    ADMIN: { label: 'Admin (Kaunter)', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    SUPERVISOR: { label: 'Supervisor', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    MANAGEMENT: { label: 'Management', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  };
  const role = roleStyles[user.role] || { label: user.role, color: 'bg-slate-50 text-slate-700 border-slate-200' };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200 shrink-0">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">Pusat Tuisyen An Nur</h1>
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
              Telipot
            </span>
          </div>
          <p className="text-[11px] text-slate-500">Sistem Pengurusan Operasi & Pendaftaran ERP</p>
        </div>
      </div>

      {/* Signed-in user */}
      <div className="flex items-center gap-2 text-xs">
        <ShieldCheck className="w-4 h-4 text-indigo-600" />
        <span className="font-semibold text-slate-800">{user.full_name}</span>
        <span className={`font-semibold px-2.5 py-1 rounded-lg border ${role.color}`}>{role.label}</span>
      </div>

      {/* Utilities: Hotline & Logout */}
      <div className="flex items-center gap-2">
        <a
          href="https://wa.me/60139838085"
          target="_blank"
          rel="noreferrer"
          className="hidden md:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" /> 013-983 8085
        </a>
        <button
          onClick={onLogout}
          title="Log Keluar Sistem"
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar</span>
        </button>
      </div>
    </header>
  );
}