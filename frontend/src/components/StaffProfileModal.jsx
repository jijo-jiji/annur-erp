import React, { useCallback, useEffect, useState } from 'react';
import { X, Pencil, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { hrApi, authApi } from '../api/client';
import { today } from './studentShared';
import { AttachmentList, PhotoBox, DOC_TYPES } from './Attachments';

export const MARITAL = [
  { id: 'SINGLE', label: 'Bujang' },
  { id: 'MARRIED', label: 'Berkahwin' },
  { id: 'DIVORCED', label: 'Bercerai' },
  { id: 'WIDOWED', label: 'Balu / Duda' },
];
export const EMPLOYMENT = [
  { id: 'PERMANENT', label: 'Tetap' },
  { id: 'CONTRACT', label: 'Kontrak' },
  { id: 'PART_TIME', label: 'Sambilan' },
  { id: 'INTERN', label: 'Pelatih / Latihan Industri' },
];
export const WEEKDAYS = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad'];
export const LEAVE_LABELS = { AL: 'Tahunan (AL)', MC: 'Sakit (MC)', EL: 'Kecemasan (EL)', UL: 'Tanpa Gaji (UL)' };

const PERSONAL = ['name', 'ic_number', 'date_of_birth', 'marital_status', 'dependents', 'address', 'email', 'phone', 'skills'];
const EMERGENCY = ['emergency_name', 'emergency_phone', 'emergency_relation', 'emergency_email', 'emergency_address'];
const JOB = ['role', 'department', 'join_date', 'employment_type', 'contract_start', 'contract_end', 'work_start', 'work_end',
  'work_days', 'al_entitlement', 'mc_entitlement', 'el_entitlement', 'is_active', 'user'];
const LABELS = {
  name: 'Nama', ic_number: 'No. KP', date_of_birth: 'Tarikh lahir', marital_status: 'Status perkahwinan', dependents: 'Tanggungan',
  address: 'Alamat', email: 'E-mel', phone: 'Telefon', skills: 'Kemahiran',
  emergency_name: 'Nama', emergency_phone: 'Telefon', emergency_relation: 'Hubungan', emergency_email: 'E-mel', emergency_address: 'Alamat',
  role: 'Jawatan', department: 'Jabatan', join_date: 'Tarikh mula', employment_type: 'Jenis pekerjaan', contract_start: 'Kontrak mula',
  contract_end: 'Kontrak tamat', work_start: 'Waktu masuk', work_end: 'Waktu keluar', work_days: 'Hari bekerja',
  al_entitlement: 'Kelayakan AL / tahun', mc_entitlement: 'Kelayakan MC / tahun', el_entitlement: 'Kelayakan EL / tahun',
  is_active: 'Status', user: 'Akaun log masuk',
};
const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white';
const btn = 'px-2.5 py-1 rounded-lg font-semibold text-[11px] border cursor-pointer';

const errText = (err) => (err?.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : err?.message) || 'Ralat.';
const hhmm = (t) => (t ? String(t).slice(0, 5) : '-');

function display(field, value, staff) {
  if (value === null || value === undefined || value === '') return '-';
  if (field === 'marital_status') return staff.marital_status_label || value;
  if (field === 'employment_type') return staff.employment_type_label || value;
  if (field === 'work_start' || field === 'work_end') return hhmm(value);
  if (field === 'work_days') return String(value).split(',').map((d) => WEEKDAYS[Number(d)]).join(', ');
  if (field === 'is_active') return value ? 'Aktif' : 'Tidak aktif';
  if (field === 'user') return staff.username || '-';
  return String(value);
}

function FieldInput({ field, value, onChange, users }) {
  const set = (v) => onChange(field, v);
  if (field === 'marital_status') return <select value={value || ''} onChange={(e) => set(e.target.value)} className={input}><option value="">-</option>{MARITAL.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>;
  if (field === 'employment_type') return <select value={value} onChange={(e) => set(e.target.value)} className={input}>{EMPLOYMENT.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>;
  if (field === 'is_active') return <select value={value ? '1' : '0'} onChange={(e) => set(e.target.value === '1')} className={input}><option value="1">Aktif</option><option value="0">Tidak aktif</option></select>;
  if (field === 'user') return <select value={value || ''} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)} className={input}><option value="">Tiada akaun</option>{users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}</select>;
  if (field === 'work_days') {
    const days = new Set(String(value || '').split(',').filter(Boolean).map(Number));
    return (
      <div className="flex flex-wrap gap-1">
        {WEEKDAYS.map((d, i) => (
          <label key={d} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200">
            <input type="checkbox" checked={days.has(i)} onChange={(e) => {
              const next = new Set(days);
              if (e.target.checked) next.add(i); else next.delete(i);
              set([...next].sort().join(','));
            }} /> {d.slice(0, 3)}
          </label>
        ))}
      </div>
    );
  }
  if (['address', 'skills', 'emergency_address'].includes(field)) return <textarea rows="2" value={value || ''} onChange={(e) => set(e.target.value)} className={input} />;
  const type = ['date_of_birth', 'join_date', 'contract_start', 'contract_end'].includes(field) ? 'date'
    : ['work_start', 'work_end'].includes(field) ? 'time'
      : ['dependents', 'al_entitlement', 'mc_entitlement', 'el_entitlement'].includes(field) ? 'number' : 'text';
  return <input type={type} min={type === 'number' ? 0 : undefined} value={type === 'time' ? hhmm(value) : (value ?? '')} onChange={(e) => set(e.target.value)} className={input} />;
}

function Section({ title, fields, staff, canEdit, onSave, users, extra }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const start = () => setForm(Object.fromEntries(fields.map((f) => [f, staff[f]])));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    // Send only changed fields; blank dates become null
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== staff[k])
      .map(([k, v]) => [k, v === '' && !['address', 'skills', 'email', 'emergency_name', 'emergency_phone', 'emergency_relation', 'emergency_email', 'emergency_address', 'ic_number', 'marital_status'].includes(k) ? null : v]));
    if (extra?.remark) changed.history_remark = extra.remark;
    if (await onSave(changed)) setForm(null);
    setBusy(false);
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-slate-900">{title}</h4>
        {canEdit && !form && <button onClick={start} className={`${btn} bg-white border-slate-200 text-slate-700 inline-flex items-center gap-1`}><Pencil className="w-3 h-3" /> Edit</button>}
      </div>
      {form ? (
        <form onSubmit={submit} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fields.map((f) => (
              <label key={f} className={`font-semibold text-slate-700 ${['address', 'skills', 'emergency_address', 'work_days'].includes(f) ? 'sm:col-span-2' : ''}`}>{LABELS[f]}
                <div className="mt-1"><FieldInput field={f} value={form[f]} users={users} onChange={(k, v) => setForm({ ...form, [k]: v })} /></div>
              </label>
            ))}
          </div>
          {extra?.node}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className={`${btn} bg-white border-slate-200`}>Batal</button>
            <button type="submit" disabled={busy} className={`${btn} bg-indigo-600 border-indigo-700 text-white`}>Simpan</button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {fields.map((f) => (
            <div key={f} className={['address', 'skills', 'emergency_address', 'work_days'].includes(f) ? 'col-span-2' : ''}>
              <span className="text-[10px] uppercase text-slate-400 font-semibold">{LABELS[f]}</span>
              <div className="text-slate-800 whitespace-pre-line">{display(f, staff[f], staff)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function StaffProfileModal({ staffId, currentRole, onClose }) {
  const { staff: allStaff, staffAction, user } = useApp();
  const staff = allStaff.find((s) => s.id === staffId);
  const [history, setHistory] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [jobRemark, setJobRemark] = useState('');
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState({});
  const isManagement = currentRole === 'MANAGEMENT';
  const isApprover = currentRole === 'SUPERVISOR' || isManagement;
  const isOwn = staff?.username && staff.username === user?.username;

  const load = useCallback(() => {
    hrApi.history(staffId).then(setHistory).catch(() => setHistory([]));
    hrApi.kpis({ staff: staffId }).then(setKpis).catch(() => setKpis([]));
    if (isApprover) hrApi.records(staffId).then(setRecords).catch(() => setRecords([]));
  }, [staffId, isApprover]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isManagement) authApi.users().then(setUsers).catch(() => setUsers([])); }, [isManagement]);

  if (!staff) return null;

  const save = async (data) => {
    try {
      await staffAction(() => hrApi.updateStaff(staff.id, data), 'Maklumat staf disimpan.');
      load();
      setJobRemark('');
      return true;
    } catch { return false; }
  };
  const run = async (call, message) => {
    try { await staffAction(call, message); setPanel(null); load(); } catch { /* toast shown */ }
  };
  const open = (name, preset) => { setPanel(name); setForm(preset); };

  const year = new Date().getFullYear();
  const yearKpis = kpis.filter((k) => k.year === year);
  const weight = yearKpis.reduce((s, k) => s + k.weight, 0);

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-start sm:items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 text-xs my-4">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <PhotoBox kind="STAFF_PHOTO" objectId={staff.id} name={staff.name} canUpload={isApprover || isOwn} />
            <div>
              <h3 className="text-base font-bold text-slate-900">{staff.name} {!staff.is_active && <span className="text-slate-400">(tidak aktif)</span>}</h3>
              <p className="text-slate-500"><span className="font-mono font-bold text-indigo-700">{staff.staff_id}</span> • {staff.role} • {staff.department} • {staff.employment_type_label}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
          <div className="space-y-5">
            <Section title="Maklumat Peribadi" fields={PERSONAL} staff={staff} canEdit={isApprover || isOwn} onSave={save} />
            <Section title="Waris Kecemasan" fields={EMERGENCY} staff={staff} canEdit={isApprover || isOwn} onSave={save} />
            <Section title="Maklumat Kerja (Management)" fields={JOB} staff={staff} canEdit={isManagement} onSave={save} users={users}
              extra={{ remark: jobRemark, node: <label className="block font-semibold text-slate-700">Catatan sejarah (cth. sebab kenaikan pangkat)<input value={jobRemark} onChange={(e) => setJobRemark(e.target.value)} className={`${input} mt-1`} /></label> }} />
            {(isApprover || isOwn) && (
              <AttachmentList kind="STAFF_DOC" objectId={staff.id} title="Dokumen Sokongan" docTypes={DOC_TYPES} locked
                canUpload={isApprover || isOwn} emptyText="Belum ada dokumen dihantar."
                hint="IC, resume, surat tawaran dan lain-lain: PDF, gambar atau Word, maksimum 10 MB. Hanya staf berkenaan, Supervisor dan Management boleh melihatnya." />
            )}
          </div>

          <div className="space-y-5">
            <section className="space-y-2">
              <h4 className="font-bold text-slate-900">Cuti {year}</h4>
              <table className="w-full text-left">
                <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-1">Jenis</th><th>Layak</th><th>Diguna</th><th>Menunggu</th><th>Baki</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(staff.leave_balances || {}).map(([k, v]) => (
                    <tr key={k}><td className="py-1 font-semibold">{LEAVE_LABELS[k]}</td><td>{v.entitled ?? '-'}</td><td>{v.used}</td><td>{v.pending || '-'}</td>
                      <td className={`font-bold ${v.balance !== null && v.balance <= 0 ? 'text-rose-600' : ''}`}>{v.balance ?? 'Tiada had'}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">Sejarah Kerja</h4>
                {isManagement && <button onClick={() => open('history', { date: today(), change: '', remark: '' })} className={`${btn} bg-white border-slate-200 inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Tambah</button>}
              </div>
              {panel === 'history' && (
                <form onSubmit={(e) => { e.preventDefault(); run(() => hrApi.addHistory(staff.id, form), 'Sejarah ditambah.'); }} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
                  <input required placeholder="Perubahan (cth. dilantik Ketua Kaunter)" value={form.change} onChange={(e) => setForm({ ...form, change: e.target.value })} className={input} />
                  <input placeholder="Catatan" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} className={input} />
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => setPanel(null)} className={`${btn} bg-white border-slate-200`}>Batal</button><button type="submit" className={`${btn} bg-indigo-600 border-indigo-700 text-white`}>Simpan</button></div>
                </form>
              )}
              {history.length === 0 ? <p className="text-slate-400">Tiada sejarah direkodkan.</p> : (
                <ul className="space-y-1.5">
                  {history.map((h) => <li key={h.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100"><span className="font-semibold">{h.date}</span> • {h.change}{h.remark && <div className="text-slate-500">{h.remark}</div>}<div className="text-[10px] text-slate-400">{h.recorded_by}</div></li>)}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">KPI {year} {weight > 0 && <span className={`font-normal ${weight === 100 ? 'text-slate-500' : 'text-amber-700'}`}>(pemberat {weight}%)</span>}</h4>
                {isApprover && <button onClick={() => open('kpi', { year, title: '', target: '', weight: '' })} className={`${btn} bg-white border-slate-200 inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Tetapkan KPI</button>}
              </div>
              {panel === 'kpi' && (
                <form onSubmit={(e) => { e.preventDefault(); run(() => hrApi.addKpi({ ...form, staff: staff.id, weight: Number(form.weight || 0) }), 'KPI ditetapkan.'); }} className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2">
                  <input required placeholder="KPI (cth. Kutipan yuran)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${input} col-span-2`} />
                  <input required placeholder="Sasaran (cth. 95% dikutip sebelum 7hb)" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className={`${input} col-span-2`} />
                  <label className="font-semibold text-slate-700">Tahun<input type="number" required value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className={`${input} mt-1`} /></label>
                  <label className="font-semibold text-slate-700">Pemberat (%)<input type="number" min="0" max="100" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className={`${input} mt-1`} /></label>
                  <div className="col-span-2 flex justify-end gap-2"><button type="button" onClick={() => setPanel(null)} className={`${btn} bg-white border-slate-200`}>Batal</button><button type="submit" className={`${btn} bg-indigo-600 border-indigo-700 text-white`}>Simpan</button></div>
                </form>
              )}
              {kpis.length === 0 ? <p className="text-slate-400">Tiada KPI ditetapkan.</p> : (
                <ul className="space-y-1.5">
                  {kpis.map((k) => (
                    <li key={k.id} className="p-2 rounded-lg border border-slate-200 space-y-1">
                      <div className="flex justify-between gap-2"><span className="font-semibold">{k.year} • {k.title}</span><span className="text-slate-500">{k.weight}%</span></div>
                      <div className="text-slate-600">Sasaran: {k.target}</div>
                      {k.status === 'REVIEWED' ? (
                        <div className="text-emerald-800">Pencapaian: {k.achieved || '-'} • Skor <strong>{k.score}%</strong>{k.review_comment && ` • ${k.review_comment}`}<div className="text-[10px] text-slate-400">Disemak {k.reviewed_by} ({k.reviewed_at})</div></div>
                      ) : isApprover && (panel === `review-${k.id}` ? (
                        <form onSubmit={(e) => { e.preventDefault(); run(() => hrApi.reviewKpi(k.id, form), 'KPI disemak.'); }} className="grid grid-cols-3 gap-2 pt-1">
                          <input placeholder="Pencapaian sebenar" value={form.achieved} onChange={(e) => setForm({ ...form, achieved: e.target.value })} className={`${input} col-span-2`} />
                          <input type="number" required min="0" max="100" placeholder="Skor %" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} className={input} />
                          <input placeholder="Ulasan" value={form.review_comment} onChange={(e) => setForm({ ...form, review_comment: e.target.value })} className={`${input} col-span-3`} />
                          <div className="col-span-3 flex justify-end gap-2"><button type="button" onClick={() => setPanel(null)} className={`${btn} bg-white border-slate-200`}>Batal</button><button type="submit" className={`${btn} bg-emerald-600 border-emerald-700 text-white`}>Simpan semakan</button></div>
                        </form>
                      ) : (
                        <div className="flex gap-1.5">
                          <button onClick={() => open(`review-${k.id}`, { achieved: '', score: '', review_comment: '' })} className={`${btn} bg-emerald-50 border-emerald-200 text-emerald-800`}>Semak KPI</button>
                          <button onClick={() => run(() => hrApi.deleteKpi(k.id), 'KPI dipadam.')} className={`${btn} bg-white border-slate-200 text-slate-500`}>Padam</button>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {isApprover && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">Rekod</h4>
                  <button onClick={() => open('record', { date: today(), description: '', remark: '' })} className={`${btn} bg-white border-slate-200 inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Tambah rekod</button>
                </div>
                {panel === 'record' && (
                  <form onSubmit={(e) => { e.preventDefault(); run(() => hrApi.addRecord({ ...form, staff: staff.id }), 'Rekod ditambah.'); }} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
                    <textarea required rows="2" placeholder="Keterangan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
                    <input placeholder="Catatan" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} className={input} />
                    <div className="flex justify-end gap-2"><button type="button" onClick={() => setPanel(null)} className={`${btn} bg-white border-slate-200`}>Batal</button><button type="submit" className={`${btn} bg-indigo-600 border-indigo-700 text-white`}>Simpan</button></div>
                  </form>
                )}
                {records.length === 0 ? <p className="text-slate-400">Tiada rekod.</p> : (
                  <ul className="space-y-1.5">
                    {records.map((r) => <li key={r.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100"><span className="font-semibold">{r.date}</span> • {r.description}{r.remark && <div className="text-slate-500">{r.remark}</div>}<div className="text-[10px] text-slate-400">{r.recorded_by}</div></li>)}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { errText };
