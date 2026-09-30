import React, { useMemo, useState } from 'react';
import { Users, Clock, AlertTriangle, CheckCircle, Plus, Edit2, Trash2, X, Save, RefreshCw, MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DAYS = ['JUMAAT', 'SABTU', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS'];
const FORMS = [
  { value: 'F5', label: 'Tingkatan 5' },
  { value: 'F4', label: 'Tingkatan 4' },
  { value: 'F3', label: 'Tingkatan 3' },
  { value: 'F2', label: 'Tingkatan 2' },
  { value: 'F1', label: 'Tingkatan 1' },
  { value: 'S6', label: 'Darjah 6' },
  { value: 'S5', label: 'Darjah 5' },
];
const SECTIONS = ['A', 'B', 'C', 'D'];
const REASONS = [
  { value: 'PH', label: 'Cuti Umum / Hari Pelepasan Am' },
  { value: 'MARKING_PAPER', label: 'Guru Menanda Kertas Peperiksaan' },
  { value: 'TIME_MISTAKE', label: 'Pembetulan Jadual / Masa Bertindih' },
  { value: 'EMERGENCY_LEAVE', label: 'Kecemasan / Cuti Sakit Guru' },
  { value: 'EXTRA_SESSION', label: 'Kelas Tambahan Peperiksaan' },
  { value: 'OTHER', label: 'Lain-lain' },
];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'OGO', 'SEP', 'OKT', 'NOV', 'DIS'];
const DAY_ORDER = Object.fromEntries(DAYS.map((d, i) => [d, i]));

function monthLabel(isoDate) {
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? '' : `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

export default function TimetableView({ currentRole = 'ADMIN' }) {
  const { timetable, timeSlots, classrooms, subjects, teachers, saveClass, deleteClass, createReschedule } = useApp();
  const [selectedDay, setSelectedDay] = useState('ALL');
  const [selectedForm, setSelectedForm] = useState('ALL');
  const [modalMode, setModalMode] = useState(null); // 'edit' | 'add' | 'reschedule'
  const [currentSlot, setCurrentSlot] = useState(null);
  const [formData, setFormData] = useState({});
  const [rescheduleData, setRescheduleData] = useState({});
  const [saving, setSaving] = useState(false);

  const isAdmin = currentRole === 'ADMIN';
  // Supervisor sets the master timetable; Management may also adjust it
  const canEdit = currentRole === 'SUPERVISOR' || currentRole === 'MANAGEMENT';

  const activeTeachers = useMemo(
    () => teachers.filter((t) => t.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [teachers]
  );
  const sortedSlots = useMemo(
    () => [...timeSlots].sort((a, b) => (DAY_ORDER[a.day] - DAY_ORDER[b.day]) || a.start_time.localeCompare(b.start_time)),
    [timeSlots]
  );
  const activeSubjects = useMemo(() => subjects.filter((s) => s.is_active), [subjects]);

  const filteredClasses = useMemo(() => timetable
    .filter((c) => (selectedDay === 'ALL' || c.day === selectedDay) && (selectedForm === 'ALL' || c.form_level === selectedForm))
    .sort((a, b) => (DAY_ORDER[a.day] - DAY_ORDER[b.day]) || a.start_time.localeCompare(b.start_time) || a.class_code.localeCompare(b.class_code)),
  [timetable, selectedDay, selectedForm]);

  const handleOpenAdd = () => {
    const firstSlot = sortedSlots.find((s) => selectedDay === 'ALL' || s.day === selectedDay) || sortedSlots[0];
    setModalMode('add');
    setCurrentSlot(null);
    setFormData({
      slot: firstSlot?.id || '',
      subject: activeSubjects[0]?.id || '',
      form_level: selectedForm === 'ALL' ? 'F5' : selectedForm,
      section: 'A',
      teacher: '',
      classroom: classrooms[0]?.id || '',
      max_seats: 20,
    });
  };

  const handleOpenEdit = (cls) => {
    setModalMode('edit');
    setCurrentSlot(cls);
    setFormData({
      slot: cls.slot,
      subject: cls.subject,
      form_level: cls.form_level,
      section: cls.section,
      teacher: cls.teacher || '',
      classroom: cls.classroom || '',
      max_seats: cls.max_seats,
    });
  };

  const handleOpenReschedule = (cls) => {
    setModalMode('reschedule');
    setCurrentSlot(cls);
    setRescheduleData({
      tarikh_batal: new Date().toISOString().split('T')[0],
      tarikh_ganti: '',
      reason_type: 'PH',
      remarks: '',
      is_extra_class: false,
    });
  };

  const handleSaveSlot = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveClass(modalMode === 'edit' ? currentSlot.id : null, {
        slot: Number(formData.slot),
        subject: Number(formData.subject),
        form_level: formData.form_level,
        section: formData.section,
        teacher: formData.teacher ? Number(formData.teacher) : null,
        classroom: formData.classroom ? Number(formData.classroom) : null,
        max_seats: Number(formData.max_seats),
      });
      setModalMode(null);
    } catch {
      // toast already shown
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cls) => {
    if (!window.confirm(`Padam sesi ${cls.class_code} dari Jadual Master?`)) return;
    try {
      await deleteClass(cls.id, cls.class_code);
    } catch {
      // toast already shown
    }
  };

  const handleSaveReschedule = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createReschedule({
        ...rescheduleData,
        timetable_class: currentSlot.id,
        tarikh_batal: rescheduleData.tarikh_batal || null,
        month_label: monthLabel(rescheduleData.tarikh_ganti),
      });
      setModalMode(null);
    } catch {
      // toast already shown
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800';

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-900">Jadual Waktu Master</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
              {timetable.length} Sesi
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Pilih tingkatan untuk melihat jadual tingkatan. Bilangan pelajar dikira daripada pendaftaran kelas sebenar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tambah Sesi Kelas
            </button>
          )}

          <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs shadow-2xs">
            {['ALL', ...DAYS].map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  selectedDay === d ? 'bg-indigo-600 text-white font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {d === 'ALL' ? 'Semua Hari' : d}
              </button>
            ))}
          </div>

          <select
            aria-label="Tapis tingkatan"
            value={selectedForm}
            onChange={(e) => setSelectedForm(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none cursor-pointer shadow-2xs"
          >
            <option value="ALL">Semua Tingkatan</option>
            {FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl flex items-center gap-3 text-purple-900 text-xs">
          <Clock className="w-5 h-5 text-purple-600 shrink-0" />
          <p>
            <span className="font-bold">Mod semakan (Admin):</span> semak jadual dan kekosongan tempat untuk pendaftaran. Perubahan jadual dibuat oleh Supervisor.
          </p>
        </div>
      )}

      {filteredClasses.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-400">
          Tiada sesi kelas untuk pilihan ini.
        </div>
      )}

      {/* Class Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClasses.map((cls) => {
          const isOver = cls.available_seats < 0;
          const isFull = cls.available_seats === 0;
          const pct = cls.max_seats ? Math.round((cls.current_enrolled / cls.max_seats) * 100) : 0;
          return (
            <div
              key={cls.id}
              className={`p-5 rounded-2xl border transition-all bg-white flex flex-col justify-between group ${
                isOver
                  ? 'border-rose-300 ring-1 ring-rose-200'
                  : isFull
                  ? 'border-amber-300'
                  : 'border-slate-200 hover:border-indigo-300 hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs mb-2.5">
                  <span className="font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100/60 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-indigo-600" />
                    {cls.day} • {cls.period_label}
                  </span>
                  <span
                    className={`font-bold px-2.5 py-1 rounded-lg text-xs whitespace-nowrap ${
                      isOver
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : isFull
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {cls.current_enrolled}/{cls.max_seats}{isOver ? ` (${cls.available_seats})` : ''}
                  </span>
                </div>

                <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {cls.class_code}
                </h4>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" /> Guru:
                  <span className="font-semibold text-slate-700">{cls.teacher_details?.full_name || 'Belum ditetapkan'}</span>
                </p>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Bilik:
                  <span className="font-semibold text-slate-700">{cls.classroom_name || 'Belum ditetapkan'}</span>
                </p>

                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Seksyen <strong className="text-slate-800">{cls.section}</strong> • {pct}% penuh</span>
                  {isOver ? (
                    <span className="text-rose-600 font-bold flex items-center gap-1 text-[11px] bg-rose-50 px-2 py-0.5 rounded-md">
                      <AlertTriangle className="w-3.5 h-3.5" /> Lebih {Math.abs(cls.available_seats)} kerusi
                    </span>
                  ) : isFull ? (
                    <span className="text-amber-700 font-semibold text-[11px] bg-amber-50 px-2 py-0.5 rounded-md">Penuh</span>
                  ) : (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[11px] bg-emerald-50 px-2 py-0.5 rounded-md">
                      <CheckCircle className="w-3.5 h-3.5" /> {cls.available_seats} kekosongan
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1.5 text-xs">
                <button
                  onClick={() => handleOpenReschedule(cls)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer"
                  title="Rekod pembatalan atau gantian kelas ini"
                >
                  <RefreshCw className="w-3 h-3" /> Ganti / Batal
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={() => handleOpenEdit(cls)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" /> Ubah
                    </button>
                    <button
                      onClick={() => handleDelete(cls)}
                      aria-label={`Padam ${cls.class_code}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / Add Modal */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {modalMode === 'add' ? 'Tambah Sesi Jadual' : `Ubah Sesi: ${currentSlot?.class_code}`}
              </h3>
              <button onClick={() => setModalMode(null)} aria-label="Tutup" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSlot} className="space-y-4 text-xs">
              <div>
                <label htmlFor="tt-slot" className="block font-semibold text-slate-700 mb-1">Hari & Slot Masa</label>
                <select id="tt-slot" required value={formData.slot} onChange={(e) => setFormData({ ...formData, slot: e.target.value })} className={inputCls}>
                  {sortedSlots.map((s) => <option key={s.id} value={s.id}>{s.day} • {s.period_label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="tt-form" className="block font-semibold text-slate-700 mb-1">Tingkatan</label>
                  <select id="tt-form" value={formData.form_level} onChange={(e) => setFormData({ ...formData, form_level: e.target.value })} className={inputCls}>
                    {FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label htmlFor="tt-subject" className="block font-semibold text-slate-700 mb-1">Subjek</label>
                  <select id="tt-subject" required value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} className={inputCls}>
                    {activeSubjects.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="tt-section" className="block font-semibold text-slate-700 mb-1">Seksyen</label>
                  <select id="tt-section" value={formData.section} onChange={(e) => setFormData({ ...formData, section: e.target.value })} className={inputCls}>
                    {SECTIONS.map((s) => <option key={s} value={s}>Seksyen {s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="tt-room" className="block font-semibold text-slate-700 mb-1">Bilik</label>
                  <select id="tt-room" value={formData.classroom} onChange={(e) => setFormData({ ...formData, classroom: e.target.value })} className={inputCls}>
                    <option value="">Belum ditetapkan</option>
                    {classrooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="tt-max" className="block font-semibold text-slate-700 mb-1">Had Kerusi</label>
                  <input id="tt-max" type="number" min="1" max="100" required value={formData.max_seats} onChange={(e) => setFormData({ ...formData, max_seats: e.target.value })} className={inputCls} />
                </div>
              </div>

              <div>
                <label htmlFor="tt-teacher" className="block font-semibold text-slate-700 mb-1">Guru</label>
                <select id="tt-teacher" value={formData.teacher} onChange={(e) => setFormData({ ...formData, teacher: e.target.value })} className={inputCls}>
                  <option value="">Belum ditetapkan</option>
                  {activeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.teacher_code}){t.teacher_type === 'REPLACEMENT' ? ' - Ganti' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setModalMode(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer">
                  Batal
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer">
                  <Save className="w-4 h-4" /> {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {modalMode === 'reschedule' && currentSlot && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Rekod Pembatalan / Gantian</h3>
                <p className="text-xs text-slate-500">{currentSlot.class_code} ({currentSlot.day} {currentSlot.period_label})</p>
              </div>
              <button onClick={() => setModalMode(null)} aria-label="Tutup" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReschedule} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rs-batal" className="block font-semibold text-slate-700 mb-1">Tarikh Batal</label>
                  <input id="rs-batal" type="date" value={rescheduleData.tarikh_batal} onChange={(e) => setRescheduleData({ ...rescheduleData, tarikh_batal: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="rs-ganti" className="block font-semibold text-slate-700 mb-1">Tarikh Ganti *</label>
                  <input id="rs-ganti" type="date" required value={rescheduleData.tarikh_ganti} onChange={(e) => setRescheduleData({ ...rescheduleData, tarikh_ganti: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor="rs-reason" className="block font-semibold text-slate-700 mb-1">Sebab</label>
                <select id="rs-reason" value={rescheduleData.reason_type} onChange={(e) => setRescheduleData({ ...rescheduleData, reason_type: e.target.value })} className={inputCls}>
                  {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input type="checkbox" checked={rescheduleData.is_extra_class} onChange={(e) => setRescheduleData({ ...rescheduleData, is_extra_class: e.target.checked })} />
                Kelas Tambahan (Extra Class)
              </label>
              <div>
                <label htmlFor="rs-remarks" className="block font-semibold text-slate-700 mb-1">Catatan</label>
                <textarea id="rs-remarks" rows="2" value={rescheduleData.remarks} onChange={(e) => setRescheduleData({ ...rescheduleData, remarks: e.target.value })} className={inputCls} />
              </div>
              <p className="text-[11px] text-slate-500">
                {canEdit ? 'Rekod anda diluluskan terus.' : 'Rekod akan menunggu kelulusan Supervisor.'} Notis WhatsApp boleh disalin dari halaman Catatan Batal & Ganti selepas diluluskan.
              </p>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setModalMode(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer">
                  Batal
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer">
                  <Save className="w-4 h-4" /> {saving ? 'Menyimpan…' : 'Simpan Rekod'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
