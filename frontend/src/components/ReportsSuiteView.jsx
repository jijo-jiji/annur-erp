import React, { useEffect, useState } from 'react';
import { DollarSign, Users, BookOpen, Download, AlertTriangle, ShieldAlert, CheckSquare } from 'lucide-react';
import { dashboardApi } from '../api/client';

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const money = (v) => `RM ${Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function downloadCsv(filename, header, rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CsvButton({ onClick }) {
  return (
    <button onClick={onClick} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
      <Download className="w-3.5 h-3.5" /> CSV
    </button>
  );
}

function Panel({ title, subtitle, action, children }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ShareBars({ rows }) {
  if (!rows.length) return <p className="text-xs text-slate-400">Tiada kutipan pada tahun ini.</p>;
  return (
    <div className="space-y-3 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-slate-700 font-semibold">
            <span>{r.label}</span>
            <span className="font-bold text-slate-900 whitespace-nowrap">{money(r.amount)} ({r.pct}%)</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${r.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsSuiteView({ currentRole = 'MANAGEMENT' }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [tab, setTab] = useState('sales');
  const [loaded, setLoaded] = useState({ year: null, data: null, error: '' });

  const isAdmin = currentRole === 'ADMIN';

  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    dashboardApi.getReports(year)
      .then((d) => { if (!cancelled) setLoaded({ year, data: d, error: '' }); })
      .catch((err) => { if (!cancelled) setLoaded({ year, data: null, error: err.message || 'Gagal memuat laporan.' }); });
    return () => { cancelled = true; };
  }, [year, isAdmin]);

  if (isAdmin) {
    return (
      <div className="bg-white rounded-3xl border border-rose-200 p-8 text-center max-w-xl mx-auto my-12 space-y-3">
        <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
        <h2 className="text-lg font-black text-slate-900">Laporan untuk Supervisor & Management sahaja</h2>
      </div>
    );
  }

  const data = loaded.year === year ? loaded.data : null;
  const error = loaded.year === year ? loaded.error : '';
  const tabs = [
    { id: 'sales', label: 'Jualan & Perbelanjaan', icon: DollarSign },
    { id: 'teachers', label: 'Bayaran Guru', icon: Users },
    { id: 'academic', label: 'Akademik & Status Pelajar', icon: BookOpen },
    { id: 'attendance', label: 'Kehadiran', icon: CheckSquare },
  ];

  const maxMonthly = data ? Math.max(1, ...data.sales.months.map((m) => Math.max(m.billed, m.collected, m.expenses))) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Pusat Laporan</h2>
          <p className="text-xs text-slate-500">Semua angka dikira daripada rekod sistem bagi tahun dipilih.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          Tahun
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold">
            {[thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-2xs text-xs font-bold">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 rounded-xl transition cursor-pointer ${
              tab === id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {error && <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{error}</div>}
      {!data && !error && <div className="text-xs text-slate-500">Memuatkan laporan…</div>}

      {data && tab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['Jumlah Ditagih', data.sales.total_billed, 'text-slate-900'],
              ['Jumlah Dikutip', data.sales.total_collected, 'text-emerald-600'],
              ['Tunggakan Semasa', data.sales.outstanding, 'text-rose-600'],
              ['Kutipan Walk-in', data.sales.walk_in_collected, 'text-indigo-700'],
            ].map(([label, value, tone]) => (
              <div key={label} className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-xs text-slate-500 font-medium block">{label} {data.year}</span>
                <span className={`text-xl font-black mt-1 block ${tone}`}>{money(value)}</span>
              </div>
            ))}
          </div>

          <Panel
            title={`Jualan Bulanan ${data.year}`}
            subtitle="Ditagih (invois), dikutip (resit) dan perbelanjaan (baucar disahkan/diluluskan)"
            action={<CsvButton onClick={() => downloadCsv(`jualan-bulanan-${data.year}.csv`,
              ['Bulan', 'Ditagih', 'Dikutip', 'Walk-in', 'Perbelanjaan'],
              data.sales.months.map((m) => [MONTHS[m.month - 1], m.billed, m.collected, m.walk_in_collected, m.expenses]))} />}
          >
            <div className="flex items-center gap-4 text-[11px] text-slate-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-300" /> Ditagih</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Dikutip</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-400" /> Perbelanjaan</span>
            </div>
            <div className="overflow-x-auto">
              <div className="grid grid-cols-12 gap-2 min-w-[560px] h-44 items-end">
                {data.sales.months.map((m) => (
                  <div key={m.month} className="flex flex-col items-center gap-1 h-full justify-end">
                    <div className="flex items-end gap-0.5 h-full w-full justify-center">
                      {[['bg-slate-300', m.billed], ['bg-emerald-500', m.collected], ['bg-rose-400', m.expenses]].map(([cls, v], i) => (
                        <div key={i} className={`${cls} w-2 rounded-t`} style={{ height: `${(v / maxMonthly) * 100}%` }} title={money(v)} />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500">{MONTHS[m.month - 1]}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel title="Sumbangan Hasil Mengikut Tingkatan" subtitle="Berdasarkan kutipan resit">
              <ShareBars rows={data.sales.by_form.map((f) => ({ label: `${f.label} (${f.students} pelajar)`, amount: f.amount, pct: f.pct }))} />
            </Panel>
            <Panel title="Sumbangan Mengikut Peringkat" subtitle="Menengah atas, rendah dan sekolah rendah">
              <ShareBars rows={data.sales.by_level.map((l) => ({ label: l.label, amount: l.amount, pct: l.pct }))} />
            </Panel>
            <Panel
              title="Perbelanjaan Mengikut Kategori"
              subtitle={data.expenses.pending_total > 0 ? `${money(data.expenses.pending_total)} lagi menunggu kelulusan` : 'Baucar disahkan / diluluskan'}
              action={<CsvButton onClick={() => downloadCsv(`perbelanjaan-${data.year}.csv`, ['Kategori', 'Bil. Baucar', 'Jumlah'],
                data.expenses.by_category.map((c) => [c.category, c.count, c.amount]))} />}
            >
              {data.expenses.by_category.length === 0 ? (
                <p className="text-xs text-slate-400">Tiada perbelanjaan.</p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {data.expenses.by_category.map((c) => (
                    <div key={c.category} className="py-2 flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{c.category} <span className="text-slate-400 font-normal">({c.count})</span></span>
                      <strong>{money(c.amount)}</strong>
                    </div>
                  ))}
                  <div className="py-2 flex justify-between font-black"><span>Jumlah</span><span>{money(data.expenses.total)}</span></div>
                </div>
              )}
            </Panel>
          </div>

          <Panel
            title={`Bajet vs Sebenar ${data.year}`}
            subtitle={`Bajet bulanan dari Data Induk (kategori perbelanjaan) × ${data.budget.months_elapsed} bulan`}
            action={<CsvButton onClick={() => downloadCsv(`bajet-vs-sebenar-${data.year}.csv`, ['Kategori', 'Bajet Bulanan', 'Bajet Setakat Ini', 'Sebenar', 'Varians'],
              data.budget.rows.map((r) => [r.category, r.monthly_budget, r.budget_to_date, r.actual, r.variance]))} />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Kategori</th><th className="px-3">Bajet / Bulan</th><th className="px-3">Bajet Setakat Ini</th><th className="px-3">Sebenar</th><th className="px-3">Varians</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.budget.rows.map((r) => (
                    <tr key={r.category}>
                      <td className="py-2 px-3 font-semibold">{r.category}{!r.monthly_budget && <span className="ml-1 text-[10px] text-amber-700">(tiada bajet)</span>}</td>
                      <td className="px-3">{money(r.monthly_budget)}</td>
                      <td className="px-3">{money(r.budget_to_date)}</td>
                      <td className="px-3 font-bold">{money(r.actual)}</td>
                      <td className={`px-3 font-bold ${r.variance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{r.variance < 0 ? '-' : '+'}{money(Math.abs(r.variance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">Varians positif bermaksud perbelanjaan di bawah bajet. Baucar lama dengan nama kategori lain dipaparkan sebagai "tiada bajet".</p>
          </Panel>
        </div>
      )}

      {data && tab === 'teachers' && (
        <Panel
          title={`Sesi & Elaun Guru ${data.year}`}
          subtitle="Daripada rekod kehadiran guru (guru hadir, atau guru ganti yang mengajar)"
          action={data.teacher_payments.length > 0 && <CsvButton onClick={() => downloadCsv(`elaun-guru-${data.year}.csv`,
            ['Kod', 'Nama', 'Kategori', 'Sesi', 'Kadar Semasa', 'Elaun Direkod'],
            data.teacher_payments.map((t) => [t.code, t.name, t.type, t.sessions, t.rate, t.allowance]))} />}
        >
          {data.teacher_payments.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Tiada rekod kehadiran guru bagi tahun {data.year}. Laporan ini akan terisi apabila kehadiran guru direkodkan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Guru</th>
                    <th className="py-3 px-4">Kategori</th>
                    <th className="py-3 px-4">Sesi</th>
                    <th className="py-3 px-4">Kadar Semasa</th>
                    <th className="py-3 px-4">Elaun Direkod</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.teacher_payments.map((t) => (
                    <tr key={t.code} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{t.name} ({t.code})</td>
                      <td className="py-3 px-4">{t.type === 'PERMANENT' ? 'Tetap' : 'Ganti'}</td>
                      <td className="py-3 px-4">{t.sessions}</td>
                      <td className="py-3 px-4">{money(t.rate)}</td>
                      <td className="py-3 px-4 font-black">{money(t.allowance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-400">Kelulusan gaji, slip gaji PDF dan penghantaran WhatsApp belum dibina.</p>
        </Panel>
      )}

      {data && tab === 'academic' && (
        <div className="space-y-6">
          <Panel
            title="Pelajar Dengan Keputusan Terkini D - G"
            subtitle="Keputusan terkini setiap subjek bagi pelajar aktif"
            action={data.academic.at_risk.length > 0 && <CsvButton onClick={() => downloadCsv('pelajar-berisiko.csv',
              ['ID', 'Nama', 'Tingkatan', 'Subjek', 'Peperiksaan', 'Gred', 'Markah'],
              data.academic.at_risk.map((s) => [s.student_id, s.name, s.form, s.subject, s.exam, s.grade, s.mark]))} />}
          >
            {data.academic.at_risk.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Tiada keputusan D - G direkodkan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Nama</th>
                      <th className="py-3 px-4">Tingkatan</th>
                      <th className="py-3 px-4">Subjek</th>
                      <th className="py-3 px-4">Peperiksaan</th>
                      <th className="py-3 px-4">Gred</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.academic.at_risk.map((s) => (
                      <tr key={`${s.student_id}-${s.subject}`} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700">{s.student_id}</td>
                        <td className="py-3 px-4 font-bold">{s.name}</td>
                        <td className="py-3 px-4">{s.form}</td>
                        <td className="py-3 px-4">{s.subject}</td>
                        <td className="py-3 px-4">{s.exam}{s.mark !== null ? ` • ${s.mark}%` : ''}</td>
                        <td className="py-3 px-4"><span className="px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">{s.grade}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              ['Pelajar Ditangguh (On Hold)', data.academic.on_hold, 'pelajar-ditangguh.csv'],
              ['Pelajar Tidak Aktif', data.academic.inactive, 'pelajar-tidak-aktif.csv'],
            ].map(([title, list, file]) => (
              <Panel
                key={title}
                title={`${title} (${list.length})`}
                action={list.length > 0 && <CsvButton onClick={() => downloadCsv(file, ['ID', 'Nama', 'Tingkatan', 'Telefon', 'Telefon Waris'],
                  list.map((s) => [s.student_id, s.full_name, s.form_level, s.phone_number, s.parent1_phone]))} />}
              >
                {list.length === 0 ? (
                  <p className="text-xs text-slate-400">Tiada.</p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {list.map((s) => (
                      <div key={s.student_id} className="py-2 flex justify-between gap-2">
                        <span className="font-semibold">{s.full_name} <span className="text-slate-400">({s.form_level})</span></span>
                        <span className="text-slate-500">{s.parent1_phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title={`Sebab Gugur Subjek & Berhenti ${data.year}`} subtitle="Daripada sejarah pelajar">
              {data.drop_reasons.length === 0 ? <p className="text-xs text-slate-400">Tiada rekod gugur subjek atau berhenti.</p> : (
                <div className="space-y-3 text-xs">
                  {data.drop_reasons.map((r) => {
                    const total = r.subject_drops + r.students_left;
                    const max = Math.max(...data.drop_reasons.map((x) => x.subject_drops + x.students_left));
                    return (
                      <div key={r.code || 'none'}>
                        <div className="flex justify-between gap-2 font-semibold text-slate-700"><span>{r.label}</span><span className="whitespace-nowrap">{r.subject_drops} subjek • {r.students_left} pelajar</span></div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden"><div className="bg-rose-500 h-full rounded-full" style={{ width: `${(total / max) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-12 gap-1 text-[10px] text-center text-slate-500 pt-2">
                {MONTHS.map((m, i) => (
                  <div key={m}>
                    <div className="font-bold text-slate-800">{data.drops_by_month[i] + data.left_by_month[i] || '-'}</div>
                    {m}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Peningkatan Keputusan" subtitle="Perubahan markah berbanding keputusan pertama setiap subjek">
              <div className="grid grid-cols-3 gap-2 text-xs">
                {data.result_improvement.summary.map((r) => (
                  <div key={r.months} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <div className="text-slate-500 font-semibold">Selepas {r.months} bulan</div>
                    <div className={`text-lg font-black ${r.avg_change === null ? 'text-slate-400' : r.avg_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {r.avg_change === null ? '-' : `${r.avg_change >= 0 ? '+' : ''}${r.avg_change}`}
                    </div>
                    <div className="text-[10px] text-slate-500">{r.pairs ? `${r.pairs} rekod • ${r.improved_pct}% meningkat` : 'Tiada data'}</div>
                  </div>
                ))}
              </div>
              {data.result_improvement.students.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-1">Pelajar</th><th>Subjek</th><th>Awal</th><th>3 bln</th><th>6 bln</th><th>9 bln</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.result_improvement.students.map((r) => (
                        <tr key={`${r.student_id}-${r.subject}`}>
                          <td className="py-1.5 font-semibold">{r.student}</td><td>{r.subject}</td><td>{r.baseline}</td>
                          <td>{r.m3 ?? '-'}</td><td>{r.m6 ?? '-'}</td><td>{r.m9 ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-slate-400">Markah dalam peratus. Keputusan dimasukkan melalui profil pelajar.</p>
            </Panel>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0 mt-px" />
            <span>Galeri maklum balas ibu bapa/pelajar belum dibina (memerlukan muat naik gambar/video).</span>
          </div>
        </div>
      )}

      {data && tab === 'attendance' && (
        <Panel
          title={`Kadar Kehadiran Pelajar ${data.year}`}
          subtitle="Setiap kelas: peratus dan pecahan (hadir / jumlah rekod)"
          action={data.attendance.length > 0 && <CsvButton onClick={() => downloadCsv(`kehadiran-${data.year}.csv`, ['Kelas', 'Sesi', 'Hadir', 'Jumlah', 'Kadar %'],
            data.attendance.map((r) => [r.class_code, r.sessions, r.present, r.total, r.rate]))} />}
        >
          {data.attendance.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">Tiada kehadiran direkodkan bagi tahun {data.year}.</p> : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2 px-3">Kelas</th><th className="px-3">Sesi</th><th className="px-3">Kehadiran</th><th className="px-3">Kadar</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.attendance.map((r) => (
                  <tr key={r.class_id}>
                    <td className="py-2 px-3 font-semibold">{r.class_code}</td>
                    <td className="px-3">{r.sessions}</td>
                    <td className="px-3">{r.present}/{r.total}</td>
                    <td className={`px-3 font-bold ${r.rate < 70 ? 'text-rose-600' : 'text-emerald-700'}`}>{r.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}
