import React, { useState } from 'react';
import { Calendar, Filter, Users, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

export default function TimetableView() {
  const [selectedDay, setSelectedDay] = useState('ALL');
  const [selectedForm, setSelectedForm] = useState('ALL');

  const timetableSlots = [
    { id: 1, day: "JUMAAT", time: "9.00 - 10.30", sub: "FIZIK", code: "F4 FIZIK (A) NAK", form: "F4", sec: "A", teacher: "Nik Ahmad Khan (NAK)", enrolled: 16, max: 20 },
    { id: 2, day: "JUMAAT", time: "9.00 - 10.30", sub: "MATH", code: "F3 MATH (A) F", form: "F3", sec: "A", teacher: "Fadzlul (F)", enrolled: 18, max: 20 },
    { id: 3, day: "JUMAAT", time: "9.00 - 10.30", sub: "SEJ", code: "F3 SEJ (B) M", form: "F3", sec: "B", teacher: "Maheran (M)", enrolled: 14, max: 20 },
    { id: 4, day: "JUMAAT", time: "9.00 - 10.30", sub: "BI", code: "F2 BI Z", form: "F2", sec: "A", teacher: "Zakir (Z)", enrolled: 15, max: 20 },
    { id: 5, day: "JUMAAT", time: "9.00 - 10.30", sub: "BM", code: "S6/S5 BM K", form: "S6", sec: "A", teacher: "Kamal (K)", enrolled: 12, max: 20 },

    { id: 6, day: "JUMAAT", time: "10.40 - 12.10", sub: "BI", code: "F4 BI (A) Z", form: "F4", sec: "A", teacher: "Zakir (Z)", enrolled: 19, max: 20 },
    { id: 7, day: "JUMAAT", time: "10.40 - 12.10", sub: "SEJ", code: "F3 SEJ (A) M", form: "F3", sec: "A", teacher: "Maheran (M)", enrolled: 20, max: 20 },
    { id: 8, day: "JUMAAT", time: "10.40 - 12.10", sub: "BM", code: "F3 BM (B) K", form: "F3", sec: "B", teacher: "Kamal (K)", enrolled: 15, max: 20 },
    { id: 9, day: "JUMAAT", time: "10.40 - 12.10", sub: "MATH", code: "F2 MATH F", form: "F2", sec: "A", teacher: "Fadzlul (F)", enrolled: 17, max: 20 },
    { id: 10, day: "JUMAAT", time: "10.40 - 12.10", sub: "BI", code: "S6/S5 BI A", form: "S6", sec: "A", teacher: "Anis Sabreena (A)", enrolled: 14, max: 20 },

    { id: 11, day: "JUMAAT", time: "3.00 - 4.30", sub: "ADDMT", code: "F5 ADDMT (A) Z", form: "F5", sec: "A", teacher: "Zamri / Zakir (Z)", enrolled: 21, max: 20, over: true },
    { id: 12, day: "JUMAAT", time: "3.00 - 4.30", sub: "BI", code: "F5 BI (B) Z", form: "F5", sec: "B", teacher: "Zakir (Z)", enrolled: 18, max: 20 },
    { id: 13, day: "JUMAAT", time: "3.00 - 4.30", sub: "SEJ", code: "F5 SEJ (C) M", form: "F5", sec: "C", teacher: "Maheran (M)", enrolled: 16, max: 20 },
    { id: 14, day: "JUMAAT", time: "3.00 - 4.30", sub: "ACC", code: "F4 ACC AT", form: "F4", sec: "A", teacher: "Atiqah (AT)", enrolled: 15, max: 20 },
    { id: 15, day: "JUMAAT", time: "3.00 - 4.30", sub: "BIO", code: "F4 BIO (A) AM", form: "F4", sec: "A", teacher: "Amin (AM)", enrolled: 17, max: 20 },

    { id: 16, day: "JUMAAT", time: "4.45 - 6.15", sub: "SEJ", code: "F5 SEJ (B) M", form: "F5", sec: "B", teacher: "Maheran (M)", enrolled: 19, max: 20 },
    { id: 17, day: "JUMAAT", time: "4.45 - 6.15", sub: "ACC", code: "F5 ACC (A) AT", form: "F5", sec: "A", teacher: "Atiqah (AT)", enrolled: 14, max: 20 },
    { id: 18, day: "JUMAAT", time: "4.45 - 6.15", sub: "SNS", code: "F5 SNS (C) AM", form: "F5", sec: "C", teacher: "Amin (AM)", enrolled: 18, max: 20 },
    { id: 19, day: "JUMAAT", time: "4.45 - 6.15", sub: "FIZIK", code: "F5 FIZIK (C) NAK", form: "F5", sec: "C", teacher: "Nik Ahmad Khan (NAK)", enrolled: 20, max: 20 },
    { id: 20, day: "JUMAAT", time: "4.45 - 6.15", sub: "ADDMT", code: "F4 ADDMT (A) Z", form: "F4", sec: "A", teacher: "Zamri (Z)", enrolled: 22, max: 20, over: true },

    { id: 21, day: "SABTU", time: "9.00 - 10.30", sub: "MATH", code: "S6 MATH FQ", form: "S6", sec: "A", teacher: "Faqihah (FQ)", enrolled: 15, max: 20 },
    { id: 22, day: "SABTU", time: "9.00 - 10.30", sub: "BI", code: "F4 BI (B) Z", form: "F4", sec: "B", teacher: "Zakir (Z)", enrolled: 17, max: 20 },
    { id: 23, day: "SABTU", time: "9.00 - 10.30", sub: "KIM", code: "F4 KIM (B) SF", form: "F4", sec: "B", teacher: "Saiful (SF)", enrolled: 16, max: 20 },
    { id: 24, day: "SABTU", time: "9.00 - 10.30", sub: "SAINS", code: "F3 SAINS (A) AZ", form: "F3", sec: "A", teacher: "Azahari (AZ)", enrolled: 19, max: 20 },
    { id: 25, day: "SABTU", time: "9.00 - 10.30", sub: "MATH", code: "F3 MATH (B) SAF", form: "F3", sec: "B", teacher: "Safran (SAF)", enrolled: 14, max: 20 },

    { id: 26, day: "ISNIN", time: "8.30 - 10.00", sub: "BIO", code: "F5 BIO (B) D", form: "F5", sec: "B", teacher: "Diana (D)", enrolled: 17, max: 20 },
    { id: 27, day: "ISNIN", time: "8.30 - 10.00", sub: "SNS", code: "F5 SNS (B) AM", form: "F5", sec: "B", teacher: "Amin (AM)", enrolled: 18, max: 20 },
    { id: 28, day: "ISNIN", time: "8.30 - 10.00", sub: "MATH", code: "F4 MATH (A) HK", form: "F4", sec: "A", teacher: "Hakimi (HK)", enrolled: 20, max: 20 },
    { id: 29, day: "SELASA", time: "8.30 - 10.00", sub: "BI", code: "F5 BI (A) Z", form: "F5", sec: "A", teacher: "Zakir (Z)", enrolled: 19, max: 20 },
    { id: 30, day: "RABU", time: "8.30 - 10.00", sub: "MATH", code: "F5 MATH (A) HK", form: "F5", sec: "A", teacher: "Hakimi (HK)", enrolled: 20, max: 20 },
    { id: 31, day: "KHAMIS", time: "8.30 - 10.00", sub: "BIO", code: "F5 BIO (A) D", form: "F5", sec: "A", teacher: "Diana (D)", enrolled: 18, max: 20 },
  ];

  const filteredSlots = timetableSlots.filter((s) => {
    const matchDay = selectedDay === 'ALL' || s.day === selectedDay;
    const matchForm = selectedForm === 'ALL' || s.form === selectedForm;
    return matchDay && matchForm;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Jadual Waktu Master 2026</h2>
          <p className="text-xs text-slate-500">
            Pusat Tuisyen An Nur (Telipot) • Sesi 1 Jam 30 Minit (Jumaat, Sabtu & Malam Isnin–Khamis)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
            {['ALL', 'JUMAAT', 'SABTU', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS'].map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  selectedDay === d ? 'bg-indigo-600 text-white font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {d === 'ALL' ? 'Semua Hari' : d}
              </button>
            ))}
          </div>

          <select
            value={selectedForm}
            onChange={(e) => setSelectedForm(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="ALL">Semua Tingkatan</option>
            <option value="F5">Tingkatan 5</option>
            <option value="F4">Tingkatan 4</option>
            <option value="F3">Tingkatan 3</option>
            <option value="F2">Tingkatan 2</option>
            <option value="S6">Darjah 6 & 5</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSlots.map((slot) => {
          const isOver = slot.enrolled > slot.max;
          const isFull = slot.enrolled === slot.max;
          return (
            <div
              key={slot.id}
              className={`p-5 rounded-2xl border transition-all bg-white ${
                isOver
                  ? 'border-rose-300 shadow-rose-50 ring-1 ring-rose-200'
                  : isFull
                  ? 'border-amber-300 shadow-amber-50'
                  : 'border-slate-200 hover:border-indigo-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                  {slot.day} • {slot.time}
                </span>
                <span
                  className={`font-bold px-2 py-0.5 rounded-md ${
                    isOver
                      ? 'bg-rose-100 text-rose-700'
                      : isFull
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isOver ? `Lebihan -${slot.enrolled - slot.max}` : `${slot.enrolled}/${slot.max} Kerusi`}
                </span>
              </div>

              <h4 className="text-base font-bold text-slate-900 mt-1">{slot.code}</h4>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" /> Guru: {slot.teacher}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">Seksyen: {slot.sec}</span>
                {isOver ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" /> Amaran Kapasiti
                  </span>
                ) : (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[11px]">
                    <CheckCircle className="w-3.5 h-3.5" /> Ada Kekosongan
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}