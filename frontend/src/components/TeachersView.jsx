import React, { useState } from 'react';
import { GraduationCap, ShieldCheck, Phone, MessageSquare, Award, Clock } from 'lucide-react';

export default function TeachersView() {
  const [filterType, setFilterType] = useState('ALL');

  // Seeded directly from ELAUN GURU 2026 (2).pdf
  const teachers = [
    { id: 1, code: "NAK", name: "Cikgu Nik Ahmad Khan", type: "PERMANENT", sub: "Fizik (F4, F5)", phone: "019-9110001", rate: 65.0, status: "Aktif", years: "2014 - 2026" },
    { id: 2, code: "AZ", name: "Cikgu Azahari", type: "PERMANENT", sub: "Sains (F2, F3)", phone: "019-9110002", rate: 60.0, status: "Aktif", years: "2015 - 2026" },
    { id: 3, code: "D", name: "Cikgu Diana", type: "PERMANENT", sub: "Biologi (F5, F4 Ganti)", phone: "019-9110003", rate: 60.0, status: "Aktif", years: "2016 - 2026" },
    { id: 4, code: "F", name: "Cikgu Fadzlul", type: "PERMANENT", sub: "Matematik (F3)", phone: "019-9110004", rate: 60.0, status: "Aktif", years: "2018 - 2026" },
    { id: 5, code: "G", name: "Cikgu Ghazani", type: "PERMANENT", sub: "Bahasa Melayu (F4, F5, F3, F2)", phone: "019-9110005", rate: 60.0, status: "Aktif", years: "2014 - 2026" },
    { id: 6, code: "HK", name: "Cikgu Hakimi", type: "PERMANENT", sub: "Matematik (F4, F5)", phone: "019-9110006", rate: 60.0, status: "Aktif", years: "2017 - 2026" },
    { id: 7, code: "K", name: "Cikgu Kamal", type: "PERMANENT", sub: "BM (F2, F3, STD 5/6)", phone: "019-9110007", rate: 60.0, status: "Aktif", years: "2016 - 2026" },
    { id: 8, code: "SAF", name: "Cikgu Safran", type: "PERMANENT", sub: "Matematik (F4, F5, F2, F3)", phone: "019-9110008", rate: 60.0, status: "Aktif", years: "2016 - 2026" },
    { id: 9, code: "SF", name: "Cikgu Saiful", type: "PERMANENT", sub: "Kimia & Matematik (F2 - F5)", phone: "019-9110009", rate: 65.0, status: "Aktif", years: "2015 - 2026" },
    { id: 10, code: "Z", name: "Cikgu Zakir", type: "PERMANENT", sub: "Bahasa Inggeris (F3, F5)", phone: "019-9110010", rate: 60.0, status: "Aktif", years: "2015 - 2026" },
    { id: 11, code: "AZM", name: "Cikgu Zamri", type: "PERMANENT", sub: "Add Math & Bio (F4, F5)", phone: "019-9110011", rate: 65.0, status: "Aktif", years: "2014 - 2026" },
    { id: 12, code: "HS", name: "Cikgu Hasmini", type: "PERMANENT", sub: "Sains (STD 5, 6)", phone: "019-9110012", rate: 55.0, status: "Aktif", years: "2019 - 2026" },
    { id: 13, code: "AM", name: "Cikgu Amin", type: "PERMANENT", sub: "Bio & Sains (F2 - F5)", phone: "019-9110013", rate: 60.0, status: "Aktif", years: "2018 - 2026" },
    { id: 14, code: "A", name: "Cikgu Anis Sabreena", type: "PERMANENT", sub: "Bahasa Inggeris (STD 5/6, F2-F5)", phone: "019-9110014", rate: 55.0, status: "Aktif", years: "2020 - 2026" },
    { id: 15, code: "FQ", name: "Cikgu Faqihah", type: "PERMANENT", sub: "Matematik (STD 5, 6)", phone: "019-9110015", rate: 55.0, status: "Aktif", years: "2021 - 2026" },
    { id: 16, code: "M", name: "Cikgu Maheran", type: "PERMANENT", sub: "Sejarah (F3, F4, F5)", phone: "019-9110016", rate: 60.0, status: "Aktif", years: "2016 - 2026" },
    { id: 17, code: "AT", name: "Cikgu Atiqah", type: "PERMANENT", sub: "Prinsip Akaun (F4, F5)", phone: "019-9110017", rate: 60.0, status: "Aktif", years: "2018 - 2026" },
    // Cikgu Ganti Aktif
    { id: 18, code: "ROS", name: "Cikgu Roslan", type: "REPLACEMENT", sub: "Sejarah & BM", phone: "019-9220001", rate: 55.0, status: "Ganti Standby", years: "2022 - 2026" },
    { id: 19, code: "JUL", name: "Dr Juliana", type: "REPLACEMENT", sub: "Sains Menengah", phone: "019-9220002", rate: 55.0, status: "Ganti Standby", years: "2021 - 2026" },
    { id: 20, code: "ELY", name: "Cikgu Elyas", type: "REPLACEMENT", sub: "Kimia & Sains", phone: "019-9220003", rate: 55.0, status: "Ganti Standby", years: "2022 - 2026" },
    { id: 21, code: "BAH", name: "Cikgu Bahirah", type: "REPLACEMENT", sub: "Bahasa Inggeris (F4, F5)", phone: "019-9220004", rate: 55.0, status: "Ganti Standby", years: "2023 - 2026" },
    { id: 22, code: "SUL", name: "Cikgu Sulia", type: "REPLACEMENT", sub: "Sejarah (F2 - F5)", phone: "019-9220005", rate: 55.0, status: "Ganti Standby", years: "2020 - 2026" },
    { id: 23, code: "BAL", name: "Cikgu Balkhis", type: "REPLACEMENT", sub: "Kimia, Bio, Fizik (F4, F5)", phone: "019-9220006", rate: 55.0, status: "Ganti Standby", years: "2021 - 2026" },
  ];

  const filteredTeachers = teachers.filter((t) => {
    if (filterType === 'ALL') return true;
    return t.type === filterType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Direktori Guru & Jadual Elaun 2026</h2>
          <p className="text-xs text-slate-500">
            Pusat Tuisyen An Nur (Telipot) • Cikgu Permanent & Cikgu Ganti Aktif (Kadar Elaun per Sesi 1.5 Jam)
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filterType === 'ALL' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Semua ({teachers.length})
          </button>
          <button
            onClick={() => setFilterType('PERMANENT')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filterType === 'PERMANENT' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Cikgu Permanent (17)
          </button>
          <button
            onClick={() => setFilterType('REPLACEMENT')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filterType === 'REPLACEMENT' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Cikgu Ganti Aktif (6)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
            <tr>
              <th className="py-3.5 px-4">Kod</th>
              <th className="py-3.5 px-4">Nama Guru</th>
              <th className="py-3.5 px-4">Kategori</th>
              <th className="py-3.5 px-4">Subjek / Tingkatan</th>
              <th className="py-3.5 px-4">Kadar Sesi (1.5 Jam)</th>
              <th className="py-3.5 px-4">Tempoh Khidmat</th>
              <th className="py-3.5 px-4 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTeachers.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50 transition">
                <td className="py-3 px-4 font-bold text-indigo-600">{t.code}</td>
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-900">{t.name}</div>
                  <div className="text-slate-400 text-[10px]">{t.phone}</div>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      t.type === 'PERMANENT'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {t.type === 'PERMANENT' ? 'Cikgu Permanent' : 'Cikgu Ganti Aktif'}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-700 font-medium">{t.sub}</td>
                <td className="py-3 px-4 font-bold text-emerald-600">RM {t.rate.toFixed(2)}</td>
                <td className="py-3 px-4 text-slate-500">{t.years}</td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() =>
                      alert(
                        `Jana Slip Gaji & WhatsApp ke ${t.name} (${t.phone}):\nKadar Sesi: RM${t.rate}\nSesi Selesai Mac: 8 Sesi\nJumlah Elaun: RM${t.rate * 8}.00\n\nPayslip PDF dijana dan dihantar secara automatik!`
                      )
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-semibold text-[11px] hover:bg-indigo-100 transition border border-indigo-200"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" /> Slip Gaji WS
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}