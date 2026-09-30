import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, MessageSquare, Phone, Mail, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { billingApi, studentsApi } from '../api/client';
import { STATUS_META, FORM_LABELS, GRADES, waLink, today } from './studentShared';
import { PhotoBox } from './Attachments';
import { StudentFeedbackPanel } from './FeedbackViews';

const EVENT_STYLE = {
  REGISTERED: 'bg-slate-100 text-slate-700',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  ADD_SUBJECT: 'bg-indigo-100 text-indigo-700',
  DROP_SUBJECT: 'bg-rose-100 text-rose-700',
  CHANGE_CLASS: 'bg-blue-100 text-blue-700',
  WAITLIST: 'bg-amber-100 text-amber-800',
  ON_HOLD: 'bg-amber-100 text-amber-800',
  RESUME: 'bg-emerald-100 text-emerald-800',
  TERMINATE: 'bg-rose-200 text-rose-900',
  NOTE: 'bg-purple-100 text-purple-700',
  FEEDBACK: 'bg-pink-100 text-pink-700',
};

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-400 uppercase">{label}</div>
      <div className="text-slate-800 font-medium break-words">{children || '-'}</div>
    </div>
  );
}

export default function StudentDetailModal({ studentId, currentRole, onClose }) {
  const { students, timetable, subjects, getMasterOptions, studentAction, refreshStudents, showToast } = useApp();
  const student = students.find((s) => s.id === studentId);
  const [history, setHistory] = useState([]);
  const [results, setResults] = useState([]);
  const [panel, setPanel] = useState(null); // which inline form is open
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [discounts, setDiscounts] = useState([]);

  const canApprove = currentRole === 'SUPERVISOR' || currentRole === 'MANAGEMENT';
  const dropReasons = getMasterOptions('14_drop_reason');
  const examTypes = getMasterOptions('10_exam_type');
  const ageBands = Object.fromEntries(getMasterOptions('7_parent_age').map((o) => [o.value, o.label]));

  const loadExtras = useCallback(async () => {
    const [h, r] = await Promise.all([studentsApi.history({ student: studentId }), studentsApi.results(studentId)]);
    setHistory(h);
    setResults(r);
  }, [studentId]);

  useEffect(() => { loadExtras().catch(() => {}); }, [loadExtras]);
  // Recurring discounts that can be assigned to the student (e.g. siblings)
  useEffect(() => {
    if (canApprove) billingApi.getDiscounts().then((rows) => setDiscounts(rows.filter((d) => d.recurring && d.is_active))).catch(() => {});
  }, [canApprove]);

  const enrolledIds = useMemo(() => new Set(student?.enrolled_classes || []), [student]);
  const classOptions = useMemo(() => timetable
    .filter((c) => c.form_level === student?.form_level && !enrolledIds.has(c.id))
    .sort((a, b) => a.class_code.localeCompare(b.class_code)), [timetable, student, enrolledIds]);

  if (!student) return null;
  const status = STATUS_META[student.status] || { label: student.status, cls: 'bg-slate-100 text-slate-700' };
  const isLive = ['ACTIVE', 'ON_HOLD', 'PENDING'].includes(student.status);

  const open = (name, preset = {}) => {
    setPanel(name);
    setForm({ date: today(), ...preset });
  };

  const run = async (name, data, message) => {
    setBusy(true);
    try {
      await studentAction(student.id, name, data, message);
      setPanel(null);
      await loadExtras();
    } catch {
      // toast already shown
    } finally {
      setBusy(false);
    }
  };

  const saveOther = async (e, save, message) => {
    e.preventDefault();
    setBusy(true);
    try {
      await save();
      setPanel(null);
      await Promise.all([loadExtras(), refreshStudents()]);
      showToast(message);
    } catch (err) {
      showToast(err.message || 'Ralat menyimpan.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800';
  const btn = 'px-3 py-1.5 rounded-lg font-semibold text-[11px] border cursor-pointer disabled:opacity-50';
  const classCode = (id) => timetable.find((c) => c.id === Number(id))?.class_code || `#${id}`;
  const preferredPhone = student.preferred_contact === 'PARENT_2' && student.parent2_phone ? student.parent2_phone : student.parent1_phone;

  const formPanel = (onSubmit, children, submitLabel) => (
    <form onSubmit={onSubmit} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
      {children}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setPanel(null)} className={`${btn} bg-white border-slate-200 text-slate-600`}>Batal</button>
        <button type="submit" disabled={busy} className={`${btn} bg-indigo-600 border-indigo-700 text-white`}>{busy ? 'Menyimpan…' : submitLabel}</button>
      </div>
    </form>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-start sm:items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 text-xs my-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-start gap-4">
          <PhotoBox kind="STUDENT_PHOTO" objectId={student.id} name={student.full_name} canUpload />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">{student.full_name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status.cls}`}>{status.label}</span>
            </div>
            <p className="text-slate-500 mt-0.5">
              <span className="font-mono font-bold text-indigo-700">{student.student_id}</span> • {FORM_LABELS[student.form_level] || student.form_level}
              {' '}• {student.student_type === 'WALK_IN' ? 'Walk-in' : 'Bulanan'} • Daftar {student.join_date}
              {student.on_hold_until && ` • Tangguh hingga ${student.on_hold_until}`}
              {student.left_date && ` • Berhenti ${student.left_date}`}
            </p>
            {student.registration_comment && (
              <p className="text-slate-500 mt-0.5">Keputusan pendaftaran ({student.registration_decided_by}): {student.registration_comment}</p>
            )}
          </div>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5">
          {/* Left: profile */}
          <div className="space-y-4">
            <section className="space-y-2">
              <h4 className="font-bold text-slate-900">Maklumat Pelajar</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="No. KP">{student.ic_number}</Field>
                <Field label="Sekolah">{[student.school_name, student.school_category, student.school_code].filter(Boolean).join(' • ')}</Field>
                <Field label="Telefon">{student.phone_number}</Field>
                <Field label="E-mel">{student.email}</Field>
                <Field label="Alamat">{student.address}</Field>
                <Field label="Sumber">{student.lead_source}</Field>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {student.phone_number && <a href={waLink(student.phone_number)} target="_blank" rel="noreferrer" className={`${btn} bg-emerald-50 border-emerald-200 text-emerald-700 inline-flex items-center gap-1`}><MessageSquare className="w-3 h-3" /> WhatsApp Pelajar</a>}
                {student.phone_number && <a href={`tel:${student.phone_number}`} className={`${btn} bg-blue-50 border-blue-200 text-blue-700 inline-flex items-center gap-1`}><Phone className="w-3 h-3" /> Panggil</a>}
                {student.email && <a href={`mailto:${student.email}`} className={`${btn} bg-slate-50 border-slate-200 text-slate-700 inline-flex items-center gap-1`}><Mail className="w-3 h-3" /> E-mel</a>}
              </div>
            </section>

            <section className="space-y-2">
              <h4 className="font-bold text-slate-900">Ibu Bapa / Penjaga</h4>
              {[1, 2].map((n) => student[`parent${n}_name`] && (
                <div key={n} className="p-3 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{student[`parent${n}_name`]} <span className="text-slate-400 font-medium">({student[`parent${n}_relation`]})</span></span>
                    {student.preferred_contact === `PARENT_${n}` && <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">Hubungan Utama</span>}
                  </div>
                  <div className="text-slate-600">
                    {student[`parent${n}_phone`]}{student[`parent${n}_email`] ? ` • ${student[`parent${n}_email`]}` : ''}
                    {student[`parent${n}_age`] ? ` • ${ageBands[student[`parent${n}_age`]] || student[`parent${n}_age`]}` : ''}
                    {student[`parent${n}_occupation`] ? ` • ${student[`parent${n}_occupation`]}` : ''}
                  </div>
                  <div className="flex gap-1.5">
                    {student[`parent${n}_phone`] && <a href={waLink(student[`parent${n}_phone`])} target="_blank" rel="noreferrer" className={`${btn} bg-emerald-50 border-emerald-200 text-emerald-700`}>WhatsApp</a>}
                    {student[`parent${n}_phone`] && <a href={`tel:${student[`parent${n}_phone`]}`} className={`${btn} bg-blue-50 border-blue-200 text-blue-700`}>Panggil</a>}
                    {student[`parent${n}_email`] && <a href={`mailto:${student[`parent${n}_email`]}`} className={`${btn} bg-slate-50 border-slate-200 text-slate-700`}>E-mel</a>}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">Yuran</h4>
                {canApprove && isLive && (
                  <div className="flex gap-1.5">
                    <button onClick={() => open('fee', { special_monthly_fee: student.special_monthly_fee ?? '', special_fee_note: student.special_fee_note })} className={`${btn} bg-white border-slate-200 text-slate-700`}>Kadar Khas</button>
                    <button onClick={() => open('discount', { standing_discount: student.standing_discount ?? '' })} className={`${btn} bg-white border-slate-200 text-slate-700`}>Diskaun Tetap</button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kadar Khas">{student.special_monthly_fee ? `RM ${student.special_monthly_fee}${student.special_fee_note ? ` (${student.special_fee_note})` : ''}` : 'Tiada (ikut pakej)'}</Field>
                <Field label="Baki Kredit (lebihan bayar)">RM {Number(student.credit_balance || 0).toFixed(2)}</Field>
                <Field label="Diskaun Tetap">{student.standing_discount_name || 'Tiada'}</Field>
              </div>
              {panel === 'discount' && formPanel((e) => saveOther(e, () => studentsApi.update(student.id, {
                standing_discount: form.standing_discount === '' ? null : Number(form.standing_discount),
              }), 'Diskaun tetap disimpan.'), (
                <>
                  <p className="text-slate-500">Ditolak daripada yuran bulanan setiap kali invois bulanan dijana. Diskaun baharu dicipta di Kutipan Yuran → Diskaun.</p>
                  <select aria-label="Diskaun tetap" value={form.standing_discount} onChange={(e) => setForm({ ...form, standing_discount: e.target.value })} className={inputCls}>
                    <option value="">Tiada diskaun</option>
                    {discounts.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code}) • {d.mode === 'PERCENT' ? `${Number(d.value)}%` : `RM ${d.value}`}</option>)}
                  </select>
                </>
              ), 'Simpan')}
              {panel === 'fee' && formPanel((e) => saveOther(e, () => studentsApi.update(student.id, {
                special_monthly_fee: form.special_monthly_fee === '' ? null : form.special_monthly_fee,
                special_fee_note: form.special_fee_note || '',
              }), 'Kadar khas disimpan.'), (
                <>
                  <p className="text-slate-500">Untuk kes khas (kadar lain atau kurang daripada subjek minimum). Kosongkan untuk ikut pakej biasa.</p>
                  <input type="number" step="0.01" min="0" placeholder="Yuran bulanan (RM)" value={form.special_monthly_fee} onChange={(e) => setForm({ ...form, special_monthly_fee: e.target.value })} className={inputCls} />
                  <input placeholder="Sebab / catatan" value={form.special_fee_note || ''} onChange={(e) => setForm({ ...form, special_fee_note: e.target.value })} className={inputCls} />
                </>
              ), 'Simpan')}
            </section>
          </div>

          {/* Right: classes, actions, results, history */}
          <div className="space-y-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">Kelas ({student.enrolled_classes_details?.length || 0})</h4>
                {isLive && <button onClick={() => open('enroll', { class_id: '' })} className={`${btn} bg-indigo-50 border-indigo-200 text-indigo-700 inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Tambah Subjek</button>}
              </div>
              {student.student_type === 'WALK_IN' && (
                <p className="text-slate-600">Walk-in: {student.walk_in_description || '-'}</p>
              )}
              {(student.enrolled_classes_details || []).length === 0 && <p className="text-slate-400">Tiada kelas.</p>}
              {(student.enrolled_classes_details || []).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-900">{c.class_code}</div>
                    <div className="text-slate-500">{c.day} {c.period_label} • {c.current_enrolled}/{c.max_seats} kerusi</div>
                  </div>
                  {isLive && (
                    <div className="flex gap-1">
                      <button onClick={() => open('change_class', { from_class: c.id, to_class: '' })} className={`${btn} bg-white border-slate-200 text-slate-700`}>Tukar</button>
                      <button onClick={() => open('drop', { class_id: c.id, reason_code: '' })} className={`${btn} bg-rose-50 border-rose-200 text-rose-700`}>Gugur</button>
                    </div>
                  )}
                </div>
              ))}
              {(student.waiting_for || []).map((w) => (
                <div key={w.id} className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900">
                  Senarai menunggu: <strong>{w.class_code}</strong>
                </div>
              ))}

              {panel === 'enroll' && formPanel((e) => { e.preventDefault(); run('enroll', { class_id: Number(form.class_id), date: form.date }, 'Subjek dikemaskini.'); }, (
                <>
                  <select required aria-label="Kelas" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className={inputCls}>
                    <option value="">Pilih kelas {FORM_LABELS[student.form_level]}…</option>
                    {classOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.class_code} • {c.day} {c.period_label} • {c.available_seats > 0 ? `baki ${c.available_seats}` : c.available_seats === 0 ? 'PENUH: senarai menunggu' : `LEBIH ${Math.abs(c.available_seats)}: senarai menunggu`}
                      </option>
                    ))}
                  </select>
                  <input type="date" aria-label="Tarikh" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
                </>
              ), 'Tambah')}

              {panel === 'drop' && formPanel((e) => { e.preventDefault(); run('drop', form, `Subjek ${classCode(form.class_id)} digugurkan.`); }, (
                <>
                  <div className="font-semibold">Gugur {classCode(form.class_id)}</div>
                  <select required aria-label="Sebab gugur" value={form.reason_code} onChange={(e) => setForm({ ...form, reason_code: e.target.value })} className={inputCls}>
                    <option value="">Sebab gugur subjek…</option>
                    {dropReasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <textarea rows="2" placeholder="Catatan (pilihan)" value={form.reason_text || ''} onChange={(e) => setForm({ ...form, reason_text: e.target.value })} className={inputCls} />
                  <input type="date" aria-label="Tarikh" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
                </>
              ), 'Gugurkan')}

              {panel === 'change_class' && formPanel((e) => { e.preventDefault(); run('change_class', form, 'Kelas ditukar.'); }, (
                <>
                  <div className="font-semibold">Tukar dari {classCode(form.from_class)}</div>
                  <select required aria-label="Kelas baharu" value={form.to_class} onChange={(e) => setForm({ ...form, to_class: e.target.value })} className={inputCls}>
                    <option value="">Kelas baharu…</option>
                    {classOptions.map((c) => <option key={c.id} value={c.id}>{c.class_code} • {c.day} {c.period_label} • {c.current_enrolled}/{c.max_seats}</option>)}
                  </select>
                  <input placeholder="Sebab (pilihan)" value={form.reason_text || ''} onChange={(e) => setForm({ ...form, reason_text: e.target.value })} className={inputCls} />
                </>
              ), 'Tukar')}
            </section>

            {['ACTIVE', 'ON_HOLD'].includes(student.status) && (
              <section className="space-y-2">
                <h4 className="font-bold text-slate-900">Status</h4>
                <div className="flex flex-wrap gap-1.5">
                  {student.status === 'ACTIVE' && <button onClick={() => open('hold', { start: today(), until: '' })} className={`${btn} bg-amber-50 border-amber-200 text-amber-800`}>Tangguh (On Hold)</button>}
                  {student.status === 'ON_HOLD' && <button disabled={busy} onClick={() => run('resume', {}, 'Pelajar aktif semula.')} className={`${btn} bg-emerald-50 border-emerald-200 text-emerald-700`}>Aktifkan Semula</button>}
                  <button onClick={() => open('terminate', { reason_code: '' })} className={`${btn} bg-rose-50 border-rose-200 text-rose-700`}>Berhenti (Tidak Aktif)</button>
                </div>
                {panel === 'hold' && formPanel((e) => { e.preventDefault(); run('hold', form, 'Pelajar ditangguhkan.'); }, (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="font-semibold">Mula<input type="date" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={inputCls} /></label>
                      <label className="font-semibold">Hingga<input type="date" required value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} className={inputCls} /></label>
                    </div>
                    <input required placeholder="Sebab tangguh" value={form.reason_text || ''} onChange={(e) => setForm({ ...form, reason_text: e.target.value })} className={inputCls} />
                  </>
                ), 'Tangguhkan')}
                {panel === 'terminate' && formPanel((e) => { e.preventDefault(); run('terminate', form, 'Pelajar ditandakan berhenti.'); }, (
                  <>
                    <p className="text-rose-700">Semua kelas akan dikosongkan dan tempat dilepaskan.</p>
                    <select required aria-label="Sebab berhenti" value={form.reason_code} onChange={(e) => setForm({ ...form, reason_code: e.target.value })} className={inputCls}>
                      <option value="">Sebab berhenti…</option>
                      {dropReasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <textarea rows="2" placeholder="Catatan (pilihan)" value={form.reason_text || ''} onChange={(e) => setForm({ ...form, reason_text: e.target.value })} className={inputCls} />
                    <input type="date" aria-label="Tarikh berhenti" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
                  </>
                ), 'Sahkan Berhenti')}
              </section>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">Keputusan Peperiksaan ({results.length})</h4>
                <button onClick={() => open('result', { exam_name: examTypes[0]?.label || '', subject: '', grade: 'A', mark: '' })} className={`${btn} bg-indigo-50 border-indigo-200 text-indigo-700`}>+ Keputusan</button>
              </div>
              {panel === 'result' && formPanel((e) => saveOther(e, () => studentsApi.addResult({
                student: student.id, exam_name: form.exam_name, subject: Number(form.subject), grade: form.grade,
                mark: form.mark === '' ? null : Number(form.mark), exam_date: form.date,
              }), 'Keputusan disimpan.'), (
                <div className="grid grid-cols-2 gap-2">
                  <select required aria-label="Jenis peperiksaan" value={form.exam_name} onChange={(e) => setForm({ ...form, exam_name: e.target.value })} className={`${inputCls} col-span-2`}>
                    {examTypes.map((t) => <option key={t.value} value={t.label}>{t.label}</option>)}
                  </select>
                  <select required aria-label="Subjek" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={`${inputCls} col-span-2`}>
                    <option value="">Subjek…</option>
                    {subjects.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select aria-label="Gred" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={inputCls}>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input type="number" min="0" max="100" placeholder="Markah %" value={form.mark} onChange={(e) => setForm({ ...form, mark: e.target.value })} className={inputCls} />
                  <input type="date" aria-label="Tarikh peperiksaan" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${inputCls} col-span-2`} />
                </div>
              ), 'Simpan')}
              {results.length === 0 ? <p className="text-slate-400">Tiada keputusan direkodkan.</p> : (
                <table className="w-full text-left">
                  <thead className="text-slate-400 text-[10px] uppercase"><tr><th className="py-1">Tarikh</th><th>Peperiksaan</th><th>Subjek</th><th>Gred</th><th>Markah</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5">{r.exam_date}</td>
                        <td>{r.exam_name} {r.form_level && <span className="text-slate-400">({r.form_level})</span>}</td>
                        <td>{r.subject_name}</td>
                        <td className="font-bold">{r.grade}</td>
                        <td>{r.mark ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <StudentFeedbackPanel studentId={student.id} canDelete={canApprove} onChanged={() => loadExtras().catch(() => {})} />

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">Sejarah & Catatan</h4>
                <button onClick={() => open('note', { description: '', action: '' })} className={`${btn} bg-purple-50 border-purple-200 text-purple-700`}>+ Catatan</button>
              </div>
              {panel === 'note' && formPanel((e) => { e.preventDefault(); run('note', form, 'Catatan disimpan.'); }, (
                <>
                  <textarea required rows="2" placeholder="Keterangan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
                  <input placeholder="Tindakan" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} className={inputCls} />
                  <input type="date" aria-label="Tarikh" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
                </>
              ), 'Simpan')}
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {history.map((ev) => (
                  <div key={ev.id} className="p-2 rounded-lg border border-slate-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${EVENT_STYLE[ev.event_type] || 'bg-slate-100'}`}>{ev.event_label}</span>
                      <span className="text-slate-500">{ev.event_date}</span>
                      {ev.class_label && <span className="font-semibold text-slate-800">{ev.class_label}</span>}
                    </div>
                    {(ev.reason_code || ev.reason_text) && (
                      <div className="text-slate-600 mt-0.5">Sebab: {[dropReasons.find((r) => r.value === ev.reason_code)?.label || ev.reason_code, ev.reason_text].filter(Boolean).join(' - ')}</div>
                    )}
                    {ev.hold_until && <div className="text-slate-600">Hingga {ev.hold_until}</div>}
                    {ev.description && <div className="text-slate-700 mt-0.5">{ev.description}</div>}
                    {ev.action && <div className="text-slate-600">Tindakan: {ev.action}</div>}
                    <div className="text-[10px] text-slate-400">Oleh {ev.recorded_by || '-'}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
        <div className="px-5 pb-4 text-[11px] text-slate-400">Hubungan utama untuk resit dan notis: {preferredPhone}</div>
      </div>
    </div>
  );
}
