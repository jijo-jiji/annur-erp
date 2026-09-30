import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, Plus, MessageSquare, ChevronRight, X, Save, AlertCircle, Clock, UserPlus, Ban, RotateCcw, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { leadsApi } from '../api/client';
import { FORMS, FORM_LABELS, today, waLink, downloadCsv } from './studentShared';
import { Donut } from './charts';

// j-status.doc: the 8 conversion stages, in order
export const LEAD_STAGES = [
  { id: 'ENQUIRY', label: 'Enquiry' },
  { id: 'CONTACTED', label: 'Contacted' },
  { id: 'CONTENT_1', label: 'Content 1' },
  { id: 'CONTENT_2', label: 'Content 2' },
  { id: 'TRIAL', label: 'Free Trial' },
  { id: 'WAITING_PAYMENT', label: 'Waiting Payment' },
  { id: 'REGISTERED', label: 'Registered' },
  { id: 'ACTIVE', label: 'Active' },
];
const STAGE_LABEL = { ...Object.fromEntries(LEAD_STAGES.map((s) => [s.id, s.label])), LOST: 'Tidak Berminat' };
// Registered comes from converting the lead; Active from the Supervisor approving that registration
const MOVABLE = LEAD_STAGES.slice(0, 6).map((s) => s.id);
const CLOSED = ['REGISTERED', 'ACTIVE', 'LOST'];
const ACTIONS = ['WhatsApp', 'Panggilan telefon', 'Hantar content', 'Kelas percubaan', 'Walk-in kaunter', 'E-mel', 'Lain-lain'];
const OUTCOMES = [
  { id: 'DONE', label: 'Selesai' },
  { id: 'WAITING_REPLY', label: 'Menunggu respons' },
  { id: 'NO_RESPONSE', label: 'Tiada respons' },
];

const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:border-indigo-500';
const labelCls = 'block font-semibold text-slate-700 mb-1';

const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
const isDue = (lead) => lead.next_follow_up && !CLOSED.includes(lead.status) && lead.next_follow_up <= today();

function Modal({ title, subtitle, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      <div className={`bg-white rounded-3xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Tutup" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LeadForm({ value, onChange, sources, subjects, campaigns }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const toggleSubject = (code) => set({
    interested_subjects: value.interested_subjects.includes(code)
      ? value.interested_subjects.filter((c) => c !== code)
      : [...value.interested_subjects, code],
  });
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label htmlFor="ld-name" className={labelCls}>Nama pelajar *</label><input id="ld-name" required value={value.student_name} onChange={(e) => set({ student_name: e.target.value })} className={input} /></div>
        <div><label htmlFor="ld-parent" className={labelCls}>Nama ibu bapa / penjaga *</label><input id="ld-parent" required value={value.parent_name} onChange={(e) => set({ parent_name: e.target.value })} className={input} /></div>
        <div><label htmlFor="ld-phone" className={labelCls}>No. telefon *</label><input id="ld-phone" type="tel" required value={value.phone} onChange={(e) => set({ phone: e.target.value })} className={input} /></div>
        <div><label htmlFor="ld-email" className={labelCls}>E-mel</label><input id="ld-email" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} className={input} /></div>
        <div>
          <label htmlFor="ld-form" className={labelCls}>Tingkatan / Darjah *</label>
          <select id="ld-form" value={value.form_level} onChange={(e) => set({ form_level: e.target.value })} className={input}>
            {FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div><label htmlFor="ld-school" className={labelCls}>Sekolah</label><input id="ld-school" value={value.school_name} onChange={(e) => set({ school_name: e.target.value })} className={input} /></div>
        <div>
          <label htmlFor="ld-source" className={labelCls}>Sumber lead *</label>
          <select id="ld-source" required value={value.lead_source} onChange={(e) => set({ lead_source: e.target.value })} className={input}>
            <option value="">Pilih sumber</option>
            {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ld-campaign" className={labelCls}>Kempen</label>
          <input id="ld-campaign" list="ld-campaigns" placeholder="cth. SPM 2027" value={value.campaign} onChange={(e) => set({ campaign: e.target.value })} className={input} />
          <datalist id="ld-campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>
      <div>
        <span className={labelCls}>Subjek diminati</span>
        <div className="flex flex-wrap gap-1.5">
          {subjects.map((s) => (
            <button type="button" key={s.code} onClick={() => toggleSubject(s.code)} aria-pressed={value.interested_subjects.includes(s.code)}
              className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer ${value.interested_subjects.includes(s.code) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <div><label htmlFor="ld-notes" className={labelCls}>Catatan</label><textarea id="ld-notes" rows="2" value={value.notes} onChange={(e) => set({ notes: e.target.value })} className={input} /></div>
    </div>
  );
}

function AddLeadModal({ onClose, sources, subjects, campaigns }) {
  const { createLead } = useApp();
  const [form, setForm] = useState({
    student_name: '', parent_name: '', phone: '', email: '', form_level: 'F5', school_name: '',
    lead_source: '', campaign: '', interested_subjects: [], notes: '', status: 'ENQUIRY', enquiry_date: today(),
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createLead(form);
      onClose();
    } catch {
      setSaving(false);
    }
  };
  return (
    <Modal title="Lead Baharu" subtitle="Pertanyaan dari panggilan, walk-in, media sosial atau booth" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="ld-date" className={labelCls}>Tarikh pertanyaan</label><input id="ld-date" type="date" value={form.enquiry_date} onChange={(e) => setForm({ ...form, enquiry_date: e.target.value })} className={input} /></div>
          <div>
            <label htmlFor="ld-stage" className={labelCls}>Peringkat semasa</label>
            <select id="ld-stage" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
              {MOVABLE.map((id) => <option key={id} value={id}>{STAGE_LABEL[id]}</option>)}
            </select>
          </div>
        </div>
        <LeadForm value={form} onChange={setForm} sources={sources} subjects={subjects} campaigns={campaigns} />
        <p className="text-slate-500">Peringatan susulan ditetapkan 7 hari dari tarikh pertanyaan.</p>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"><Save className="w-4 h-4" /> Simpan Lead</button>
        </div>
      </form>
    </Modal>
  );
}

function LeadDetailModal({ lead, onClose, sources, sourceLabel, subjects, subjectName, campaigns, onConverted }) {
  const { leadAction, updateLead, convertLeadToStudent } = useApp();
  const [activities, setActivities] = useState([]);
  const [edit, setEdit] = useState(null);
  const [activity, setActivity] = useState({ activity_date: today(), action: 'WhatsApp', remark: '', outcome: 'DONE', next_follow_up: '' });
  const [stage, setStage] = useState({ stage: '', remark: '', next_follow_up: '' });
  const [lostReason, setLostReason] = useState('');
  const [ic, setIc] = useState('');
  const [busy, setBusy] = useState(false);

  const loadActivities = useCallback(() => {
    leadsApi.activities(lead.id).then(setActivities).catch(() => setActivities([]));
  }, [lead.id]);
  // Reload the log whenever the lead changes (a move or new entry updates it)
  useEffect(() => { loadActivities(); }, [loadActivities, lead.updated_at]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); return true; } catch { return false; } finally { setBusy(false); }
  };

  const addActivity = async (e) => {
    e.preventDefault();
    const payload = { ...activity };
    if (!payload.next_follow_up) delete payload.next_follow_up;
    if (await run(() => leadAction(lead.id, 'activities', payload, 'Tindakan direkodkan.'))) {
      setActivity({ activity_date: today(), action: 'WhatsApp', remark: '', outcome: 'DONE', next_follow_up: '' });
    }
  };

  const moveStage = async (e) => {
    e.preventDefault();
    const payload = { ...stage };
    if (!payload.next_follow_up) delete payload.next_follow_up;
    if (await run(() => leadAction(lead.id, 'move', payload, `Lead dipindah ke ${STAGE_LABEL[stage.stage]}.`))) {
      setStage({ stage: '', remark: '', next_follow_up: '' });
    }
  };

  const open = !CLOSED.includes(lead.status);

  return (
    <Modal
      title={`${lead.student_name}`}
      subtitle={`${lead.lead_id} • ${FORM_LABELS[lead.form_level] || lead.form_level} • ${STAGE_LABEL[lead.status]}`}
      onClose={onClose}
      wide
    >
      {isDue(lead) && (
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          Susulan perlu dibuat (dijadualkan {fmtDate(lead.next_follow_up)}). Rekod tindakan di bawah untuk menetapkan peringatan seterusnya.
        </div>
      )}
      {lead.status === 'LOST' && (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-xs">
          Tidak berminat semasa peringkat <strong>{STAGE_LABEL[lead.lost_at_stage] || '-'}</strong>: {lead.lost_reason}
        </div>
      )}

      {/* Details */}
      {edit ? (
        <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => updateLead(lead.id, edit))) setEdit(null); }} className="space-y-3 text-xs">
          <LeadForm value={edit} onChange={setEdit} sources={sources} subjects={subjects} campaigns={campaigns} />
          <div><label htmlFor="ld-pic" className={labelCls}>PIC</label><input id="ld-pic" value={edit.assigned_to} onChange={(e) => setEdit({ ...edit, assigned_to: e.target.value })} className={input} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEdit(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer disabled:opacity-60">Simpan</button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
          <div><span className="text-slate-500">Ibu bapa</span><div className="font-semibold">{lead.parent_name}</div></div>
          <div><span className="text-slate-500">Telefon</span><div className="font-semibold">{lead.phone}</div></div>
          <div><span className="text-slate-500">Sekolah</span><div className="font-semibold">{lead.school_name || '-'}</div></div>
          <div><span className="text-slate-500">Sumber</span><div className="font-semibold">{sourceLabel(lead.lead_source)}</div></div>
          <div><span className="text-slate-500">Kempen</span><div className="font-semibold">{lead.campaign || '-'}</div></div>
          <div><span className="text-slate-500">PIC</span><div className="font-semibold">{lead.assigned_to || '-'}</div></div>
          <div><span className="text-slate-500">Tarikh pertanyaan</span><div className="font-semibold">{fmtDate(lead.enquiry_date)}</div></div>
          <div><span className="text-slate-500">Susulan seterusnya</span><div className={`font-semibold ${isDue(lead) ? 'text-rose-600' : ''}`}>{open ? fmtDate(lead.next_follow_up) : '-'}</div></div>
          <div><span className="text-slate-500">Pelajar</span><div className="font-semibold">{lead.converted_student_code || '-'}</div></div>
          <div className="col-span-full"><span className="text-slate-500">Subjek diminati</span><div className="font-semibold">{lead.interested_subjects.map(subjectName).join(', ') || '-'}</div></div>
          {lead.notes && <div className="col-span-full"><span className="text-slate-500">Catatan</span><div>{lead.notes}</div></div>}
          <div className="col-span-full flex flex-wrap gap-2 pt-1">
            <a href={waLink(lead.phone, `Assalamualaikum ${lead.parent_name}, kami dari Pusat Tuisyen An Nur Telipot.`)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</a>
            <button onClick={() => setEdit({
              student_name: lead.student_name, parent_name: lead.parent_name, phone: lead.phone, email: lead.email,
              form_level: lead.form_level, school_name: lead.school_name, lead_source: lead.lead_source, campaign: lead.campaign,
              interested_subjects: lead.interested_subjects, notes: lead.notes, assigned_to: lead.assigned_to,
            })} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold cursor-pointer">Edit maklumat</button>
          </div>
        </div>
      )}

      {/* Stage */}
      <div className="border-t border-slate-100 pt-3 space-y-3 text-xs">
        <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Peringkat</h4>
        <ol className="flex flex-wrap gap-1">
          {LEAD_STAGES.map((s, i) => {
            const reachedIdx = LEAD_STAGES.findIndex((x) => x.id === lead.reached_stage);
            const current = s.id === lead.status;
            return (
              <li key={s.id} className={`px-2 py-1 rounded-md font-semibold ${current ? 'bg-indigo-600 text-white' : i <= reachedIdx ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                {i + 1}. {s.label}
              </li>
            );
          })}
        </ol>

        {(open || lead.status === 'LOST') && (
          <form onSubmit={moveStage} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            <div>
              <label htmlFor="ld-move" className={labelCls}>{lead.status === 'LOST' ? 'Buka semula ke' : 'Pindah ke'}</label>
              <select id="ld-move" required value={stage.stage} onChange={(e) => setStage({ ...stage, stage: e.target.value })} className={input}>
                <option value="">Pilih</option>
                {MOVABLE.filter((id) => id !== lead.status).map((id) => <option key={id} value={id}>{STAGE_LABEL[id]}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label htmlFor="ld-move-remark" className={labelCls}>Catatan</label><input id="ld-move-remark" value={stage.remark} onChange={(e) => setStage({ ...stage, remark: e.target.value })} className={input} /></div>
            <button type="submit" disabled={busy} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer disabled:opacity-60">Tukar peringkat</button>
          </form>
        )}

        {open && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => leadAction(lead.id, 'lost', { reason: lostReason }, 'Lead ditanda tidak berminat.'))) setLostReason(''); }}
              className="p-3 rounded-xl border border-slate-200 space-y-2">
              <label htmlFor="ld-lost" className="font-bold text-slate-700 flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> Tidak berminat</label>
              <input id="ld-lost" required placeholder="Sebab (cth. yuran, jarak, masa)" value={lostReason} onChange={(e) => setLostReason(e.target.value)} className={input} />
              <button type="submit" disabled={busy} className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 font-semibold cursor-pointer">Tanda tidak berminat</button>
            </form>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => convertLeadToStudent(lead.id, { ic_number: ic }))) onConverted();
            }} className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
              <label htmlFor="ld-ic" className="font-bold text-emerald-800 flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Daftar sebagai pelajar</label>
              <input id="ld-ic" placeholder="No. KP pelajar (boleh diisi kemudian)" value={ic} onChange={(e) => setIc(e.target.value)} className={input} />
              <p className="text-[11px] text-emerald-800">Pendaftaran menunggu kelulusan Supervisor. Kelas ditetapkan dalam profil pelajar.</p>
              <button type="submit" disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer disabled:opacity-60">Daftar</button>
            </form>
          </div>
        )}
      </div>

      {/* Activity log */}
      <div className="border-t border-slate-100 pt-3 space-y-3 text-xs">
        <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Log tindakan</h4>
        <form onSubmit={addActivity} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div><label htmlFor="la-date" className={labelCls}>Tarikh</label><input id="la-date" type="date" required value={activity.activity_date} onChange={(e) => setActivity({ ...activity, activity_date: e.target.value })} className={input} /></div>
          <div>
            <label htmlFor="la-action" className={labelCls}>Tindakan</label>
            <select id="la-action" value={activity.action} onChange={(e) => setActivity({ ...activity, action: e.target.value })} className={input}>
              {ACTIONS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="la-outcome" className={labelCls}>Status</label>
            <select id="la-outcome" value={activity.outcome} onChange={(e) => setActivity({ ...activity, outcome: e.target.value })} className={input}>
              {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div><label htmlFor="la-next" className={labelCls}>Susulan seterusnya</label><input id="la-next" type="date" value={activity.next_follow_up} onChange={(e) => setActivity({ ...activity, next_follow_up: e.target.value })} className={input} /></div>
          <div className="col-span-2 sm:col-span-3"><label htmlFor="la-remark" className={labelCls}>Catatan</label><input id="la-remark" required value={activity.remark} onChange={(e) => setActivity({ ...activity, remark: e.target.value })} className={input} /></div>
          <button type="submit" disabled={busy} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer disabled:opacity-60">Rekod</button>
          <p className="col-span-full text-[11px] text-slate-500">Jika susulan dibiarkan kosong, peringatan ditetapkan 7 hari selepas tarikh tindakan.</p>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-1 pr-2">Tarikh</th><th className="pr-2">Peringkat</th><th className="pr-2">Tindakan</th><th className="pr-2">Catatan</th><th className="pr-2">PIC</th><th className="pr-2">Status</th><th>Susulan</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {activities.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(a.activity_date)}</td>
                  <td className="pr-2 whitespace-nowrap">{STAGE_LABEL[a.stage]}</td>
                  <td className="pr-2 font-semibold">{a.action}</td>
                  <td className="pr-2 text-slate-600">{a.remark || '-'}</td>
                  <td className="pr-2 whitespace-nowrap">{a.pic}</td>
                  <td className="pr-2 whitespace-nowrap">{a.outcome_label}</td>
                  <td className="whitespace-nowrap">{a.next_follow_up ? fmtDate(a.next_follow_up) : '-'}</td>
                </tr>
              ))}
              {activities.length === 0 && <tr><td colSpan="7" className="py-3 text-slate-400">Belum ada tindakan direkodkan.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function LeadCard({ lead, onOpen, onAdvance, sourceLabel, subjectName }) {
  const due = isDue(lead);
  const idx = MOVABLE.indexOf(lead.status);
  const next = idx >= 0 && idx < MOVABLE.length - 1 ? MOVABLE[idx + 1] : null;
  return (
    <div className={`bg-white p-3 rounded-xl border ${due ? 'border-amber-300' : 'border-slate-200'} space-y-1.5 text-xs`}>
      <div className="flex items-center justify-between gap-1 text-[10px]">
        <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{lead.lead_id} • {lead.form_level}</span>
        <span className="text-slate-500 truncate">{sourceLabel(lead.lead_source)}</span>
      </div>
      <button onClick={onOpen} className="block text-left font-bold text-slate-900 hover:text-indigo-700 cursor-pointer">{lead.student_name}</button>
      {lead.interested_subjects.length > 0 && <p className="text-[11px] text-slate-500">{lead.interested_subjects.map(subjectName).join(', ')}</p>}
      {lead.campaign && <p className="text-[11px] text-slate-500">Kempen: {lead.campaign}</p>}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
        <span>PIC: {lead.assigned_to || '-'}</span>
        {!CLOSED.includes(lead.status) && lead.next_follow_up && (
          <span className={`flex items-center gap-0.5 ${due ? 'text-amber-700 font-bold' : ''}`}><Clock className="w-3 h-3" /> {fmtDate(lead.next_follow_up)}</span>
        )}
        {lead.converted_student_code && <span className="font-semibold text-emerald-700">{lead.converted_student_code}</span>}
      </div>
      <div className="flex items-center justify-between gap-1 pt-1">
        <button onClick={onOpen} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-[10px] cursor-pointer">Butiran & log ({lead.activity_count})</button>
        {next && (
          <button onClick={() => onAdvance(lead, next)} title={`Pindah ke ${STAGE_LABEL[next]}`}
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] cursor-pointer">
            {STAGE_LABEL[next]} <ChevronRight className="w-3 h-3" />
          </button>
        )}
        {lead.status === 'WAITING_PAYMENT' && (
          <button onClick={onOpen} className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] cursor-pointer">Daftar <ChevronRight className="w-3 h-3" /></button>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, note, tone = 'text-slate-900' }) {
  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-200">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className={`text-2xl font-black mt-1 ${tone}`}>{value}</div>
      {note && <span className="text-[11px] text-slate-500">{note}</span>}
    </div>
  );
}

export default function LeadFunnelView({ onConvertToStudent }) {
  const { leads, leadAction, getMasterOptions, subjects } = useApp();
  const [filters, setFilters] = useState({ source: '', form: '', campaign: '', start: '', end: '' });
  const [dueOnly, setDueOnly] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [tab, setTab] = useState('board');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [stats, setStats] = useState(null);

  const sources = getMasterOptions('3_lead_source');
  const sourceMap = useMemo(() => Object.fromEntries(sources.map((s) => [s.value, s.label])), [sources]);
  const sourceLabel = useCallback((code) => sourceMap[code] || code || '-', [sourceMap]);
  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [s.code, s.name])), [subjects]);
  const subjectName = useCallback((code) => subjectMap[code] || code, [subjectMap]);
  const campaigns = useMemo(() => [...new Set(leads.map((l) => l.campaign).filter(Boolean))].sort(), [leads]);

  const filtered = useMemo(() => leads.filter((l) => (
    (!filters.source || l.lead_source === filters.source)
    && (!filters.form || l.form_level === filters.form)
    && (!filters.campaign || l.campaign === filters.campaign)
    && (!filters.start || l.enquiry_date >= filters.start)
    && (!filters.end || l.enquiry_date <= filters.end)
    && (!dueOnly || isDue(l))
  )), [leads, filters, dueOnly]);

  // Figures come from the server with the same filters; refetched whenever a lead changes
  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    leadsApi.stats(params).then(setStats).catch(() => setStats(null));
  }, [filters, leads]);

  const openLead = leads.find((l) => l.id === openId);
  const lost = filtered.filter((l) => l.status === 'LOST');
  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const advance = (lead, next) => leadAction(lead.id, 'move', { stage: next }, `${lead.student_name} dipindah ke ${STAGE_LABEL[next]}.`).catch(() => {});

  const exportCsv = () => downloadCsv(`lead-${today()}.csv`,
    ['ID', 'Tarikh', 'Pelajar', 'Ibu Bapa', 'Telefon', 'Tingkatan', 'Sumber', 'Kempen', 'Peringkat', 'PIC', 'Susulan', 'Subjek'],
    filtered.map((l) => [l.lead_id, l.enquiry_date, l.student_name, l.parent_name, l.phone, l.form_level, sourceLabel(l.lead_source),
      l.campaign, STAGE_LABEL[l.status], l.assigned_to, l.next_follow_up || '', l.interested_subjects.map(subjectName).join(' / ')]));

  const select = 'px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-slate-700 outline-none';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Pertanyaan & Prospek</h2>
          <p className="text-xs text-slate-500 mt-0.5">8 peringkat dari Enquiry hingga Active. Setiap tindakan direkod dengan peringatan susulan seminggu.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold cursor-pointer"><Download className="w-4 h-4" /> CSV</button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"><Plus className="w-4 h-4" /> Lead Baharu</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Jumlah lead" value={stats?.total ?? '-'} note={stats && `${stats.open} masih dalam proses`} />
        <Kpi label="Kadar konversi (lead → daftar)" value={stats?.conversion_pct != null ? `${stats.conversion_pct}%` : '-'}
          note={stats && `${stats.registered} daripada ${stats.total} lead`} tone="text-emerald-700" />
        <Kpi label="Susulan perlu dibuat" value={stats?.follow_ups_due ?? '-'} note="Tarikh susulan hari ini atau lepas" tone={stats?.follow_ups_due ? 'text-amber-600' : 'text-slate-900'} />
        <Kpi label="Tidak berminat" value={stats?.lost ?? '-'} note="Ditutup tanpa pendaftaran" />
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 text-xs">
        <Filter className="w-4 h-4 text-slate-400" />
        <select aria-label="Sumber" value={filters.source} onChange={(e) => setFilter({ source: e.target.value })} className={select}>
          <option value="">Semua sumber</option>
          {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Tingkatan" value={filters.form} onChange={(e) => setFilter({ form: e.target.value })} className={select}>
          <option value="">Semua tingkatan</option>
          {FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select aria-label="Kempen" value={filters.campaign} onChange={(e) => setFilter({ campaign: e.target.value })} className={select}>
          <option value="">Semua kempen</option>
          {campaigns.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1 font-semibold text-slate-600">Dari <input type="date" value={filters.start} onChange={(e) => setFilter({ start: e.target.value })} className={select} /></label>
        <label className="flex items-center gap-1 font-semibold text-slate-600">Hingga <input type="date" value={filters.end} onChange={(e) => setFilter({ end: e.target.value })} className={select} /></label>
        <label className="flex items-center gap-1.5 font-semibold text-amber-700"><input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Susulan tertunggak sahaja</label>
        <div className="ml-auto flex rounded-xl border border-slate-200 overflow-hidden">
          {[['board', 'Papan'], ['analysis', 'Analisis']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 font-bold cursor-pointer ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'board' && (
        <>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3" style={{ minWidth: `${LEAD_STAGES.length * 232}px` }}>
              {LEAD_STAGES.map((s, i) => {
                const items = filtered.filter((l) => l.status === s.id);
                return (
                  <section key={s.id} aria-label={s.label} className="w-[220px] shrink-0 bg-slate-100/70 p-2.5 rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[11px] font-bold text-slate-700">{i + 1}. {s.label}</span>
                      <span className="text-xs font-black text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} onAdvance={advance} sourceLabel={sourceLabel} subjectName={subjectName} />)}
                      {items.length === 0 && <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-300 rounded-xl">Tiada lead</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-xs space-y-2">
            <button onClick={() => setShowLost(!showLost)} className="font-bold text-slate-700 cursor-pointer">
              {showLost ? '▾' : '▸'} Tidak berminat ({lost.length})
            </button>
            {showLost && (
              <table className="w-full text-left">
                <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-1">Lead</th><th>Peringkat terakhir</th><th>Sebab</th><th>Tarikh</th><th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {lost.map((l) => (
                    <tr key={l.id}>
                      <td className="py-1.5 font-semibold">{l.student_name} <span className="text-slate-400">{l.lead_id}</span></td>
                      <td>{STAGE_LABEL[l.lost_at_stage] || '-'}</td>
                      <td className="text-slate-600">{l.lost_reason}</td>
                      <td>{fmtDate(l.stage_changed_at)}</td>
                      <td className="text-right"><button onClick={() => setOpenId(l.id)} className="flex items-center gap-1 ml-auto text-indigo-700 font-semibold cursor-pointer"><RotateCcw className="w-3 h-3" /> Buka</button></td>
                    </tr>
                  ))}
                  {lost.length === 0 && <tr><td colSpan="5" className="py-2 text-slate-400">Tiada.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'analysis' && stats && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Kadar konversi setiap peringkat</h3>
              <p className="text-[11px] text-slate-500">Bilangan lead yang pernah sampai ke setiap peringkat, dan peratus daripada peringkat sebelumnya. Lead tidak berminat dikira hingga peringkat terakhirnya.</p>
            </div>
            <div className="space-y-2 text-xs">
              {stats.funnel.map((row, i) => (
                <div key={row.stage} className="grid grid-cols-[120px_1fr_110px] items-center gap-3">
                  <span className="font-semibold text-slate-700">{i + 1}. {row.label}</span>
                  <div className="h-5 bg-slate-100 rounded" title={`${row.reached} lead sampai ke ${row.label}`}>
                    <div className="h-full rounded bg-[#2a78d6]" style={{ width: stats.total ? `${(row.reached / stats.total) * 100}%` : 0 }} />
                  </div>
                  <span className="text-right text-slate-600">
                    <strong className="text-slate-900">{row.reached}</strong>
                    {row.rate_from_previous != null && <> • {row.rate_from_previous}%</>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Sumber lead</h3>
              <Donut rows={stats.by_source.map((r) => ({ label: sourceLabel(r.source), value: r.count }))} />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Peringkat semasa</h3>
              <Donut rows={[...stats.funnel.map((r) => ({ label: r.label, value: r.current })), { label: 'Tidak Berminat', value: stats.lost }]} />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Kempen</h3>
              <Donut rows={stats.by_campaign.map((r) => ({ label: r.campaign, value: r.count }))} />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 text-xs">
              <h3 className="font-bold text-slate-900 text-sm">Sebab tidak berminat</h3>
              {stats.lost_reasons.length === 0 ? <p className="text-slate-400">Tiada rekod.</p> : (
                <ul className="divide-y divide-slate-100">
                  {stats.lost_reasons.map((r) => <li key={r.reason} className="flex justify-between py-1.5"><span>{r.reason}</span><strong>{r.count}</strong></li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {adding && <AddLeadModal onClose={() => setAdding(false)} sources={sources} subjects={subjects} campaigns={campaigns} />}
      {openLead && (
        <LeadDetailModal
          key={openLead.id}
          lead={openLead}
          onClose={() => setOpenId(null)}
          sources={sources}
          sourceLabel={sourceLabel}
          subjects={subjects}
          subjectName={subjectName}
          campaigns={campaigns}
          onConverted={() => { setOpenId(null); onConvertToStudent?.(); }}
        />
      )}
    </div>
  );
}
