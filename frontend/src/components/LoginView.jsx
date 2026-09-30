import React, { useState } from 'react';
import { GraduationCap, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';

export default function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      setError(
        err.status === 429
          ? 'Terlalu banyak cubaan. Sila tunggu sebentar dan cuba lagi.'
          : err.message || 'Log masuk gagal. Sila cuba lagi.'
      );
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
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
            <label htmlFor="login-username" className="block font-semibold text-slate-700 mb-1.5">Nama Pengguna (Username)</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition font-medium text-slate-800"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block font-semibold text-slate-700 mb-1.5">Kata Laluan (Password)</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition font-medium text-slate-800"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait text-white font-bold text-sm transition shadow-md shadow-indigo-200 flex items-center justify-center gap-2 mt-2"
          >
            <span>{submitting ? 'Menyemak…' : 'Log Masuk Sistem'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-[11px] text-slate-400">
          Akaun diberikan oleh Management. Lupa kata laluan? Sila hubungi Management.
        </p>
      </div>

      <p className="text-[11px] text-slate-400 mt-6 text-center">
        Pusat Tuisyen An Nur • Telipot, Kota Bharu, Kelantan • Hotline: 013-983 8085
      </p>
    </div>
  );
}
