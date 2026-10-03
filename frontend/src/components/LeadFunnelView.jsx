import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, Clock, Download, Plus } from 'lucide-react';
import { leadsApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { CENTRE } from '../lib/config';
import { navigate } from '../lib/nav';
import { date, FORMS, formLabel, formShort, todayISO, waLink } from '../lib/format';
import { Donut } from './Donut';
import { downloadCsv } from '../lib/csv';
import { HBarList } from './charts';
import { Badge, Button, Card, CardHeader, Checkbox, cx, DescriptionList, EmptyState, filterClass, Input, Modal, PageHeader, Segmented, Select, Stat, Table, Td, Textarea, Th, WhatsAppIcon } from './ui';

// The 8 conversion stages, in order
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
const STAGE_LABEL = { ...Object.fromEntries(LEAD_STAGES.map((s) => [s.id, s.label])), LOST: 'Tidak berminat' };
// Registered comes from converting the lead; Active from the Supervisor approving that registration
const MOVABLE = LEAD_STAGES.slice(0, 6).map((s) => s.id);
const CLOSED = ['REGISTERED', 'ACTIVE', 'LOST'];
const ACTIONS = ['WhatsApp', 'Panggilan telefon', 'Hantar content', 'Kelas percubaan', 'Walk-in kaunter', 'E-mel', 'Lain-lain'];
const OUTCOMES = [
  { id: 'DONE', label: 'Selesai' },
  { id: 'WAITING_REPLY', label: 'Menunggu respons' },
  { id: 'NO_RESPONSE', label: 'Tiada respons' },
];

const isDue = (lead) => lead.next_follow_up && !CLOSED.includes(lead.status) && lead.next_follow_up <= todayISO();

function LeadFields({ value, onChange, sources, subjects, campaigns }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const toggleSubject = (code) => set({
    interested_subjects: value.interested_subjects.includes(code)
      ? value.interested_subjects.filter((c) => c !== code)
      : [...value.interested_subjects, code],
  });
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Nama pelajar" required value={value.student_name} onChange={(e) => set({ student_name: e.target.value })} />
        <Input label="Nama ibu bapa / penjaga" required value={value.parent_name} onChange={(e) => set({ parent_name: e.target.value })} />
        <Input label="No. telefon" type="tel" required value={value.phone} onChange={(e) => set({ phone: e.target.value })} />
        <Input label="E-mel" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} />
        <Select label="Tingkatan / darjah" required value={value.form_level} onChange={(e) => set({ form_level: e.target.value })}>
          {FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </Select>
        <Input label="Sekolah" value={value.school_name} onChange={(e) => set({ school_name: e.target.value })} />
        <Select label="Sumber" required value={value.lead_source} onChange={(e) => set({ lead_source: e.target.value })}>
          <option value="">Pilih sumber</option>
          {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <div>
          <Input label="Kempen" list="lead-campaigns" placeholder="cth. SPM 2027" value={value.campaign} onChange={(e) => set({ campaign: e.target.value })} />
          <datalist id="lead-campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-gray-700">Subjek diminati</p>
        <div className="flex flex-wrap gap-1.5">
          {subjects.filter((s) => s.is_active !== false).map((s) => {
            const on = value.interested_subjects.includes(s.code);
            return (
              <button
                type="button"
                key={s.code}
                onClick={() => toggleSubject(s.code)}
                aria-pressed={on}
                className={cx('rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors', on ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </div>
      <Textarea label="Catatan" rows={2} value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
    </>
  );
}

function AddLeadModal({ onClose, sources, subjects, campaigns }) {
  const { createLead } = useApp();
  const [f, setF] = useState({
    student_name: '', parent_name: '', phone: '', email: '', form_level: 'F5', school_name: '',
    lead_source: '', campaign: '', interested_subjects: [], notes: '', status: 'ENQUIRY', enquiry_date: todayISO(),
  });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createLead(f);
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Prospek baharu"
      description="Pertanyaan daripada panggilan, walk-in, media sosial atau booth. Peringatan susulan ditetapkan 7 hari dari tarikh pertanyaan."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="lead-form" variant="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </>
      }
    >
      <form id="lead-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tarikh pertanyaan" type="date" value={f.enquiry_date} onChange={(e) => setF({ ...f, enquiry_date: e.target.value })} />
          <Select label="Peringkat semasa" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {MOVABLE.map((id) => <option key={id} value={id}>{STAGE_LABEL[id]}</option>)}
          </Select>
        </div>
        <LeadFields value={f} onChange={setF} sources={sources} subjects={subjects} campaigns={campaigns} />
      </form>
    </Modal>
  );
}

function LeadDetailModal({ lead, onClose, sources, sourceLabel, subjects, subjectName, campaigns, onConverted }) {
  const { leadAction, updateLead, convertLeadToStudent } = useApp();
  const [activities, setActivities] = useState([]);
  const [edit, setEdit] = useState(null);
  const blankActivity = { activity_date: todayISO(), action: 'WhatsApp', remark: '', outcome: 'DONE', next_follow_up: '' };
  const [activity, setActivity] = useState(blankActivity);
  const [stage, setStage] = useState({ stage: '', remark: '' });
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
    if (await run(() => leadAction(lead.id, 'activities', payload, 'Tindakan direkodkan.'))) setActivity(blankActivity);
  };

  const moveStage = async (e) => {
    e.preventDefault();
    if (await run(() => leadAction(lead.id, 'move', stage, `Prospek dipindah ke ${STAGE_LABEL[stage.stage]}.`))) setStage({ stage: '', remark: '' });
  };

  const open = !CLOSED.includes(lead.status);
  const reachedIdx = LEAD_STAGES.findIndex((x) => x.id === lead.reached_stage);

  return (
    <Modal open side size="xl" onClose={onClose} title={lead.student_name} description={`${lead.lead_id} · ${formLabel(lead.form_level)} · ${STAGE_LABEL[lead.status]}`}>
      <div className="space-y-6">
        {isDue(lead) && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            Susulan perlu dibuat (dijadualkan {date(lead.next_follow_up)}). Rekod tindakan di bawah untuk menetapkan peringatan seterusnya.
          </p>
        )}
        {lead.status === 'LOST' && (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
            Tidak berminat semasa peringkat <span className="font-medium">{STAGE_LABEL[lead.lost_at_stage] || '—'}</span>: {lead.lost_reason}
          </p>
        )}

        {edit ? (
          <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => updateLead(lead.id, edit))) setEdit(null); }} className="space-y-4">
            <LeadFields value={edit} onChange={setEdit} sources={sources} subjects={subjects} campaigns={campaigns} />
            <Input label="Pegawai bertanggungjawab (PIC)" value={edit.assigned_to} onChange={(e) => setEdit({ ...edit, assigned_to: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)}>Batal</Button>
              <Button type="submit" variant="primary" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : (
          <section>
            <DescriptionList
              className="sm:grid-cols-3"
              items={[
                ['Ibu bapa', lead.parent_name],
                ['Telefon', lead.phone],
                ['Sekolah', lead.school_name],
                ['Sumber', sourceLabel(lead.lead_source)],
                ['Kempen', lead.campaign],
                ['PIC', lead.assigned_to],
                ['Tarikh pertanyaan', date(lead.enquiry_date)],
                ['Susulan seterusnya', open ? <span className={isDue(lead) ? 'font-medium text-red-700' : undefined}>{date(lead.next_follow_up)}</span> : '—'],
                ['Pelajar', lead.converted_student_code && <a href={`#/students/${lead.converted_student_code}`} className="text-brand-700 hover:underline">{lead.converted_student_code}</a>],
                ['Subjek diminati', lead.interested_subjects.map(subjectName).join(', ')],
                lead.notes && ['Catatan', lead.notes],
              ]}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button as="a" size="sm" href={waLink(lead.phone, `Assalamualaikum ${lead.parent_name}, kami dari ${CENTRE.name} ${CENTRE.branch}.`)} target="_blank" rel="noreferrer">
                <WhatsAppIcon className="size-3.5" /> WhatsApp
              </Button>
              <Button
                size="sm"
                onClick={() => setEdit({
                  student_name: lead.student_name, parent_name: lead.parent_name, phone: lead.phone, email: lead.email,
                  form_level: lead.form_level, school_name: lead.school_name, lead_source: lead.lead_source, campaign: lead.campaign,
                  interested_subjects: lead.interested_subjects, notes: lead.notes, assigned_to: lead.assigned_to,
                })}
              >
                Ubah maklumat
              </Button>
            </div>
          </section>
        )}

        <section className="space-y-3 border-t border-gray-200 pt-5">
          <h3 className="text-sm font-semibold text-gray-900">Peringkat</h3>
          <ol className="flex flex-wrap gap-1.5">
            {LEAD_STAGES.map((s, i) => (
              <li
                key={s.id}
                className={cx('rounded-md px-2 py-1 text-xs font-medium', s.id === lead.status ? 'bg-brand-700 text-white' : i <= reachedIdx ? 'bg-brand-50 text-brand-800' : 'bg-gray-100 text-gray-400')}
              >
                {i + 1}. {s.label}
              </li>
            ))}
          </ol>

          {(open || lead.status === 'LOST') && (
            <form onSubmit={moveStage} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[12rem_1fr_auto]">
              <Select label={lead.status === 'LOST' ? 'Buka semula ke' : 'Pindah ke'} required value={stage.stage} onChange={(e) => setStage({ ...stage, stage: e.target.value })}>
                <option value="">Pilih</option>
                {MOVABLE.filter((id) => id !== lead.status).map((id) => <option key={id} value={id}>{STAGE_LABEL[id]}</option>)}
              </Select>
              <Input label="Catatan" value={stage.remark} onChange={(e) => setStage({ ...stage, remark: e.target.value })} />
              <Button type="submit" variant="primary" disabled={busy}>Tukar peringkat</Button>
            </form>
          )}

          {open && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <form
                onSubmit={async (e) => { e.preventDefault(); if (await run(() => convertLeadToStudent(lead.id, { ic_number: ic }))) onConverted(); }}
                className="space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-4"
              >
                <Input label="Daftar sebagai pelajar" hint="Pendaftaran menunggu kelulusan supervisor. Kelas ditetapkan dalam profil pelajar." placeholder="No. KP pelajar (boleh diisi kemudian)" value={ic} onChange={(e) => setIc(e.target.value)} />
                <Button type="submit" size="sm" variant="primary" disabled={busy}>Daftar</Button>
              </form>
              <form
                onSubmit={async (e) => { e.preventDefault(); if (await run(() => leadAction(lead.id, 'lost', { reason: lostReason }, 'Prospek ditanda tidak berminat.'))) setLostReason(''); }}
                className="space-y-3 rounded-md border border-gray-200 p-4"
              >
                <Input label="Tidak berminat" required placeholder="Sebab (cth. yuran, jarak, masa)" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
                <Button type="submit" size="sm" variant="danger" disabled={busy}>Tanda tidak berminat</Button>
              </form>
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-gray-200 pt-5">
          <h3 className="text-sm font-semibold text-gray-900">Log tindakan</h3>
          <form onSubmit={addActivity} className="grid grid-cols-2 items-end gap-3 rounded-md bg-gray-50 p-4 sm:grid-cols-4">
            <Input label="Tarikh" type="date" required value={activity.activity_date} onChange={(e) => setActivity({ ...activity, activity_date: e.target.value })} />
            <Select label="Tindakan" value={activity.action} onChange={(e) => setActivity({ ...activity, action: e.target.value })}>
              {ACTIONS.map((a) => <option key={a}>{a}</option>)}
            </Select>
            <Select label="Status" value={activity.outcome} onChange={(e) => setActivity({ ...activity, outcome: e.target.value })}>
              {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
            <Input label="Susulan seterusnya" type="date" value={activity.next_follow_up} onChange={(e) => setActivity({ ...activity, next_follow_up: e.target.value })} />
            <Input label="Catatan" required className="col-span-2 sm:col-span-3" value={activity.remark} onChange={(e) => setActivity({ ...activity, remark: e.target.value })} />
            <Button type="submit" variant="primary" disabled={busy}>Rekod</Button>
            <p className="col-span-full text-xs text-gray-500">Jika susulan dibiarkan kosong, peringatan ditetapkan 7 hari selepas tarikh tindakan.</p>
          </form>
          {activities.length === 0 ? <p className="text-sm text-gray-500">Belum ada tindakan direkodkan.</p> : (
            <Table>
              <thead>
                <tr><Th>Tarikh</Th><Th>Peringkat</Th><Th>Tindakan</Th><Th>Catatan</Th><Th>PIC</Th><Th>Status</Th><Th>Susulan</Th></tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id} className="align-top">
                    <Td className="whitespace-nowrap">{date(a.activity_date)}</Td>
                    <Td className="whitespace-nowrap">{STAGE_LABEL[a.stage]}</Td>
                    <Td className="font-medium text-gray-900">{a.action}</Td>
                    <Td className="text-gray-600">{a.remark || '—'}</Td>
                    <Td className="whitespace-nowrap">{a.pic}</Td>
                    <Td className="whitespace-nowrap">{a.outcome_label}</Td>
                    <Td className="whitespace-nowrap">{a.next_follow_up ? date(a.next_follow_up) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </Modal>
  );
}

function LeadCard({ lead, onOpen, onAdvance, sourceLabel, subjectName }) {
  const due = isDue(lead);
  const idx = MOVABLE.indexOf(lead.status);
  const next = idx >= 0 && idx < MOVABLE.length - 1 ? MOVABLE[idx + 1] : null;
  return (
    <div className={cx('rounded-md border bg-white p-3 text-[13px]', due ? 'border-amber-300' : 'border-gray-200')}>
      <button type="button" onClick={onOpen} className="block text-left text-sm font-medium text-gray-900 hover:text-brand-700 hover:underline">{lead.student_name}</button>
      <p className="text-gray-500">{lead.lead_id} · {formShort(lead.form_level)} · {sourceLabel(lead.lead_source)}</p>
      {lead.interested_subjects.length > 0 && <p className="mt-1 text-gray-600">{lead.interested_subjects.map(subjectName).join(', ')}</p>}
      {lead.campaign && <p className="text-gray-500">Kempen: {lead.campaign}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
        <span className="truncate">PIC: {lead.assigned_to || '—'}</span>
        {!CLOSED.includes(lead.status) && lead.next_follow_up && (
          <span className={cx('flex shrink-0 items-center gap-1', due && 'font-medium text-amber-700')}><Clock className="size-3" /> {date(lead.next_follow_up)}</span>
        )}
        {lead.converted_student_code && <span className="font-medium text-brand-700">{lead.converted_student_code}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-1">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onOpen}>Log ({lead.activity_count})</Button>
        {next && (
          <Button size="sm" className="h-7 px-2 text-xs" title={`Pindah ke ${STAGE_LABEL[next]}`} onClick={() => onAdvance(lead, next)}>
            {STAGE_LABEL[next]} <ChevronRight className="size-3" />
          </Button>
        )}
        {lead.status === 'WAITING_PAYMENT' && (
          <Button size="sm" variant="primary" className="h-7 px-2 text-xs" onClick={onOpen}>Daftar <ChevronRight className="size-3" /></Button>
        )}
      </div>
    </div>
  );
}

export default function LeadFunnelView() {
  const { leads, leadAction, getMasterOptions, subjects } = useApp();
  const [filters, setFilters] = useState({ source: '', form: '', campaign: '', start: '', end: '' });
  const [dueOnly, setDueOnly] = useState(false);
  const [tab, setTab] = useState('board');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [stats, setStats] = useState(null);

  const sources = getMasterOptions('3_lead_source');
  const sourceMap = useMemo(() => Object.fromEntries(sources.map((s) => [s.value, s.label])), [sources]);
  const sourceLabel = useCallback((code) => sourceMap[code] || code || '—', [sourceMap]);
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

  const exportCsv = () => downloadCsv(`prospek-${todayISO()}.csv`,
    ['ID', 'Tarikh', 'Pelajar', 'Ibu bapa', 'Telefon', 'Tingkatan', 'Sumber', 'Kempen', 'Peringkat', 'PIC', 'Susulan', 'Subjek'],
    filtered.map((l) => [l.lead_id, l.enquiry_date, l.student_name, l.parent_name, l.phone, l.form_level, sourceLabel(l.lead_source),
      l.campaign, STAGE_LABEL[l.status], l.assigned_to, l.next_follow_up || '', l.interested_subjects.map(subjectName).join(' / ')]));

  return (
    <>
      <PageHeader
        title="Pertanyaan & prospek"
        description="Lapan peringkat dari Enquiry hingga Active. Setiap tindakan direkod dengan peringatan susulan seminggu."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} items={[{ value: 'board', label: 'Papan' }, { value: 'analysis', label: 'Analisis' }]} />
            <Button icon={Download} onClick={exportCsv}>Excel</Button>
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Prospek baharu</Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Jumlah prospek" value={stats?.total ?? '—'} hint={stats ? `${stats.open} masih dalam proses` : undefined} />
        <Stat label="Kadar penukaran" value={stats?.conversion_pct != null ? `${stats.conversion_pct}%` : '—'} hint={stats ? `${stats.registered} daripada ${stats.total} mendaftar` : undefined} />
        <Stat label="Susulan perlu dibuat" value={stats?.follow_ups_due ?? '—'} hint="Tarikh susulan hari ini atau lepas" tone={stats?.follow_ups_due ? 'red' : undefined} />
        <Stat label="Tidak berminat" value={stats?.lost ?? '—'} hint="Ditutup tanpa pendaftaran" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select aria-label="Sumber" value={filters.source} onChange={(e) => setFilter({ source: e.target.value })} className={filterClass}>
          <option value="">Semua sumber</option>
          {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Tingkatan" value={filters.form} onChange={(e) => setFilter({ form: e.target.value })} className={filterClass}>
          <option value="">Semua tingkatan</option>
          {FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select aria-label="Kempen" value={filters.campaign} onChange={(e) => setFilter({ campaign: e.target.value })} className={filterClass}>
          <option value="">Semua kempen</option>
          {campaigns.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">Dari <input type="date" value={filters.start} onChange={(e) => setFilter({ start: e.target.value })} className={filterClass} /></label>
        <label className="flex items-center gap-2 text-sm text-gray-600">Hingga <input type="date" value={filters.end} onChange={(e) => setFilter({ end: e.target.value })} className={filterClass} /></label>
        <Checkbox label="Susulan tertunggak sahaja" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
      </div>

      {tab === 'board' && (
        <>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3" style={{ minWidth: `${LEAD_STAGES.length * 236}px` }}>
              {LEAD_STAGES.map((s, i) => {
                const items = filtered.filter((l) => l.status === s.id);
                return (
                  <section key={s.id} aria-label={s.label} className="w-56 shrink-0 rounded-lg border border-gray-200 bg-gray-100/70 p-2.5">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <h2 className="text-[13px] font-semibold text-gray-700">{i + 1}. {s.label}</h2>
                      <span className="rounded bg-white px-1.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 tnum">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} onAdvance={advance} sourceLabel={sourceLabel} subjectName={subjectName} />)}
                      {items.length === 0 && <p className="rounded-md border border-dashed border-gray-300 py-6 text-center text-xs text-gray-400">Tiada prospek</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader title={`Tidak berminat (${lost.length})`} description="Boleh dibuka semula ke mana-mana peringkat." />
            {lost.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500">Tiada.</p> : (
              <Table>
                <thead>
                  <tr><Th>Prospek</Th><Th>Peringkat terakhir</Th><Th>Sebab</Th><Th>Tarikh</Th><Th className="w-0"><span className="sr-only">Tindakan</span></Th></tr>
                </thead>
                <tbody>
                  {lost.map((l) => (
                    <tr key={l.id}>
                      <Td className="font-medium text-gray-900">{l.student_name} <span className="font-normal text-gray-400">· {l.lead_id}</span></Td>
                      <Td>{STAGE_LABEL[l.lost_at_stage] || '—'}</Td>
                      <Td className="text-gray-600">{l.lost_reason}</Td>
                      <Td className="whitespace-nowrap">{date((l.stage_changed_at || '').slice(0, 10))}</Td>
                      <Td><Button size="sm" onClick={() => setOpenId(l.id)}>Buka</Button></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === 'analysis' && (!stats ? <Card><EmptyState title="Tiada data analisis" /></Card> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Kadar penukaran setiap peringkat"
              description="Bilangan prospek yang pernah sampai ke setiap peringkat, dan peratus daripada peringkat sebelumnya."
            />
            <div className="p-5">
              <HBarList
                labelWidth="10rem"
                max={stats.total || 1}
                rows={stats.funnel.map((row, i) => ({ label: `${i + 1}. ${row.label}`, value: row.reached, hint: `${row.reached} prospek`, rate: row.rate_from_previous }))}
                format={(v) => v}
              />
              <p className="mt-4 text-[13px] text-gray-500">
                {stats.funnel.filter((r) => r.rate_from_previous != null).map((r) => `${r.label} ${r.rate_from_previous}%`).join(' · ')}
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Sumber prospek" />
            <div className="p-5"><Donut rows={stats.by_source.map((r) => ({ label: sourceLabel(r.source), value: r.count }))} /></div>
          </Card>
          <Card>
            <CardHeader title="Peringkat semasa" />
            <div className="p-5"><Donut rows={[...stats.funnel.map((r) => ({ label: r.label, value: r.current })), { label: 'Tidak berminat', value: stats.lost }]} /></div>
          </Card>
          <Card>
            <CardHeader title="Kempen" />
            <div className="p-5"><Donut rows={stats.by_campaign.map((r) => ({ label: r.campaign, value: r.count }))} /></div>
          </Card>
          <Card>
            <CardHeader title="Sebab tidak berminat" />
            {stats.lost_reasons.length === 0 ? <p className="p-5 text-sm text-gray-500">Tiada rekod.</p> : (
              <ul className="divide-y divide-gray-100 text-sm">
                {stats.lost_reasons.map((r) => (
                  <li key={r.reason} className="flex justify-between gap-3 px-5 py-2.5"><span className="text-gray-800">{r.reason}</span><Badge>{r.count}</Badge></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ))}

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
          onConverted={() => { setOpenId(null); navigate('students?tab=approvals'); }}
        />
      )}
    </>
  );
}
