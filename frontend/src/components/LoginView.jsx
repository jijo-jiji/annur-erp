import React, { useState } from 'react';
import { GraduationCap, Lock, User, ArrowRight, Shield, UserCheck, Users, QrCode } from 'lucide-react';

export default function LoginView({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('••••••••');
  const [selectedRole, setSelectedRole] = useState('ADMIN');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(selectedRole);
  };

  const handleQuickSelect = (role, user) => {
    setSelectedRole(role);
    setUsername(user);
    onLogin(role);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      {/* Centered Login Card - Modeled directly on Figma Prototype */}
      <div className="bg-white rounded-3xl p-8 sm:p-10 max-w-md w-full shadow-xl border border-slate-200/80 space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
        
        {/* Brand Education Logo */}
        <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-md shadow-indigo-200">
          <GraduationCap className="w-9 h-9" />
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Pusat Tuisyen An Nur
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Telipot, Kota Bharu • Sistem Operasi ERP
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Nama Pengguna (Username)</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="cth: admin / manager / student"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition font-medium text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Kata Laluan (Password)</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition font-medium text-slate-800"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-sm transition shadow-md shadow-indigo-200 flex items-center justify-center gap-2 mt-2"
          >
            <span>Log Masuk Sistem</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Role Cards (Exact Figma Prototype UI) */}
        <div className="pt-4 border-t border-slate-100 text-left">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 text-center">
            Pilih Peranan Pantas (Demonstrasi UX)
          </p>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <button
              onClick={() => handleQuickSelect('ADMIN', 'admin.kaunter')}
              className="p-3 rounded-2xl bg-purple-50 hover:bg-purple-100/80 border border-purple-200 text-purple-900 transition text-left flex flex-col justify-between"
            >
              <div className="flex items-center gap-1.5 font-bold text-[11px]">
                <Shield className="w-3.5 h-3.5 text-purple-600" /> Admin
              </div>
              <span className="text-[10px] text-purple-600/90 mt-1">Kaunter, Pelajar & Yuran</span>
            </button>

            <button
              onClick={() => handleQuickSelect('MANAGEMENT', 'pengarah.telipot')}
              className="p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 text-indigo-900 transition text-left flex flex-col justify-between"
            >
              <div className="flex items-center gap-1.5 font-bold text-[11px]">
                <UserCheck className="w-3.5 h-3.5 text-indigo-600" /> Manager
              </div>
              <span className="text-[10px] text-indigo-600/90 mt-1">Kewangan & No-Code Hub</span>
            </button>

            <button
              onClick={() => handleQuickSelect('SUPERVISOR', 'supervisor.akademik')}
              className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-900 transition text-left flex flex-col justify-between"
            >
              <div className="flex items-center gap-1.5 font-bold text-[11px]">
                <Users className="w-3.5 h-3.5 text-blue-600" /> Supervisor
              </div>
              <span className="text-[10px] text-blue-600/90 mt-1">Jadual & Gantian Kelas</span>
            </button>

            <button
              onClick={() => handleQuickSelect('STUDENT_PARENT', 'pelajar.danial')}
              className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 transition text-left flex flex-col justify-between"
            >
              <div className="flex items-center gap-1.5 font-bold text-[11px]">
                <QrCode className="w-3.5 h-3.5 text-emerald-600" /> Pelajar / Ibu Bapa
              </div>
              <span className="text-[10px] text-emerald-600/90 mt-1">Portal Jadual & Resit</span>
            </button>
          </div>
        </div>

      </div>

      <p className="text-[11px] text-slate-400 mt-6 text-center">
        Pusat Tuisyen An Nur • Telipot, Kota Bharu, Kelantan • Hotline: 013-983 8085
      </p>
    </div>
  );
}