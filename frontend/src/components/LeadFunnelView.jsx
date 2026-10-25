import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Download, Plus, Upload } from 'lucide-react';
import { leadsApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { CENTRE } from '../lib/config';
import { THRESHOLDS, useThresholds } from '../lib/thresholds';
import { fillMessage } from '../lib/messages';
import { navigate } from '../lib/nav';
import { describeLeadFilters, LEAD_FILTERS, useDrill, useMatching } from '../lib/drilldown';
import { clock, date, daysAgoISO, fmtPhone, FORMS, formLabel, formShort, todayISO } from '../lib/format';
import DrilldownBar from './DrilldownBar';
import { Donut } from './Donut';
import { downloadCsv } from '../lib/csv';
import { HBarList } from './charts';
import LeadFields from './LeadFields';
import LeadImportModal from './LeadImportModal';
import { Badge, Button, Card, CardHeader, Checkbox, cx, DescriptionList, EmptyState, filterClass, Input, Modal, PageHeader, Segmented, Select, Stat, Table, Td, Th, useToast, WhatsAppIcon } from './ui';
import WhatsAppButton from './WhatsAppButton';
import { phoneMatches } from '../lib/phone';

// The 8 conversion stages, in order
// The order and the rules of the stages are fixed; their names are the centre's (Settings > Had & amaran)
export const LEAD_STAGES = ['ENQUIRY', 'CONTENT_1', 'CONTENT_2', 'CONTENT_3', 'TRIAL', 'WAITING_PAYMENT', 'REGISTERED', 'ACTIVE']
  .map((id) => ({ id, get label() { return THRESHOLDS[`lead_label_${id}`]; } }));
const STAGE_LABEL = new Proxy({}, { get: (_, id) => (id === 'LOST' ? 'Tidak berminat' : THRESHOLDS[`lead_label_${String(id)}`]) });
// Registered comes from registering the prospect as a student; Active from the Supervisor approving that registration
const MOVABLE = LEAD_STAGES.slice(0, 6).map((s) => s.id);
const CLOSED = ['REGISTERED', 'ACTIVE', 'LOST'];
// Used until the lists in Data induk have loaded (and if a centre empties them)
const DEFAULT_ACTIONS = ['WhatsApp', 'Panggilan telefon', 'Hantar content', 'Kelas percubaan', 'Walk-in kaunter', 'E-mel', 'Lain-lain'];
const OUTCOMES = [
  { id: 'DONE', label: 'Selesai' },
  { id: 'WAITING_REPLY', label: 'Menunggu respons' },
  { id: 'NO_RESPONSE', label: 'Tiada respons' },
];
const COLUMN_LIMIT = 30; // cards shown in a column before "Tunjuk lagi"
const ARCHIVE_PAGE = 25;
const OTHER_REASON = '__other__';

const isDue = (lead) => lead.next_follow_up && !CLOSED.includes(lead.status) && lead.next_follow_up <= todayISO();
const leadTitle = (lead) => lead.student_name || lead.parent_name || fmtPhone(lead.phone);

function AddLeadModal({ onClose, sources, campaigns, schools }) {
  const { createLead } = useApp();
  const [f, setF] = useState({
    student_name: '', parent_name: '', phone: '', email: '', form_level: '', school_name: '',
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
      description="Pertanyaan daripada panggilan, walk-in, media sosial atau booth. Simpan dengan apa yang diketahui; selebihnya dilengkapkan semasa susulan. Peringatan susulan ditetapkan 7 hari dari tarikh pertanyaan."
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
        <LeadFields value={f} onChange={setF} sources={sources} campaigns={campaigns} schools={schools} />
      </form>
    </Modal>
  );
}

function LeadDetailModal({ lead, onClose, sources, sourceLabel, subjectName, campaigns, schools, actions, lostReasons }) {
  const { leadAction, updateLead } = useApp();
  const [activities, setActivities] = useState([]);
  const [edit, setEdit] = useState(null);
  const blankActivity = { activity_date: todayISO(), action: actions[0], remark: '', outcome: 'DONE', next_follow_up: '' };
  const [activity, setActivity] = useState(blankActivity);
  const [stage, setStage] = useState({ stage: '', remark: '' });
  const [reason, setReason] = useState({ choice: '', typed: '' });
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

  const markLost = async (e) => {
    e.preventDefault();
    const text = reason.choice === OTHER_REASON ? reason.typed.trim() : reason.choice;
    if (await run(() => leadAction(lead.id, 'lost', { reason: text }, 'Prospek ditanda tidak berminat.'))) setReason({ choice: '', typed: '' });
  };

  const open = !CLOSED.includes(lead.status);
  const reachedIdx = LEAD_STAGES.findIndex((x) => x.id === lead.reached_stage);
  const missing = lead.missing_fields || [];
  const startEdit = () => setEdit({
    student_name: lead.student_name, parent_name: lead.parent_name, phone: lead.phone, email: lead.email,
    form_level: lead.form_level, school_name: lead.school_name, lead_source: lead.lead_source, campaign: lead.campaign,
    interested_subjects: lead.interested_subjects, notes: lead.notes, assigned_to: lead.assigned_to,
  });

  return (
    <Modal open side size="xl" onClose={onClose} title={leadTitle(lead)} description={`${lead.lead_id} · ${lead.form_level ? formLabel(lead.form_level) : 'Tingkatan belum diketahui'} · ${STAGE_LABEL[lead.status]}`}>
      <div className="space-y-6">
        {isDue(lead) && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            Susulan perlu dibuat (dijadualkan {date(lead.next_follow_up)}). Rekod tindakan di bawah untuk menetapkan peringatan seterusnya.
          </p>
        )}
        {open && missing.length > 0 && !edit && (
          <p className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertCircle className="size-4 shrink-0 text-amber-600" />
            <span>Maklumat belum lengkap: <span className="font-medium">{missing.join(', ')}</span>.</span>
            <button type="button" onClick={startEdit} className="font-medium text-brand-700 hover:underline">Lengkapkan</button>
          </p>
        )}
        {lead.status === 'LOST' && (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
            Tidak berminat semasa peringkat <span className="font-medium">{STAGE_LABEL[lead.lost_at_stage] || '—'}</span>: {lead.lost_reason}
          </p>
        )}

        {edit ? (
          <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => updateLead(lead.id, edit))) setEdit(null); }} className="space-y-4">
            <LeadFields value={edit} onChange={setEdit} sources={sources} campaigns={campaigns} schools={schools} />
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
                ['Pelajar', lead.student_name],
                ['Ibu bapa', lead.parent_name],
                ['Telefon', fmtPhone(lead.phone)],
                ['Sekolah', lead.school_name],
                ['Sumber', sourceLabel(lead.lead_source)],
                ['Kempen', lead.campaign],
                ['PIC (pemilik prospek)', lead.assigned_to],
                ['Tarikh pertanyaan', date(lead.enquiry_date)],
                ['Susulan seterusnya', open ? <span className={isDue(lead) ? 'font-medium text-red-700' : undefined}>{date(lead.next_follow_up)}</span> : '—'],
                ['Pelajar didaftarkan', lead.converted_student_code && <a href={`#/students/${lead.converted_student_code}`} className="text-brand-700 hover:underline">{lead.converted_student_code}</a>],
                ['Subjek diminati', lead.interested_subjects.map(subjectName).join(', ')],
                lead.notes && ['Catatan', lead.notes],
              ]}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <WhatsAppButton size="sm" phone={lead.phone} recipient={lead.parent_name} message={fillMessage('lead_followup', { parent: lead.parent_name || 'Tuan/Puan', centre: CENTRE.name, branch: CENTRE.branch })}>
                <WhatsAppIcon className="size-3.5" /> WhatsApp
              </WhatsAppButton>
              <Button size="sm" onClick={startEdit}>Ubah maklumat</Button>
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
              <Select label={lead.status === 'LOST' ? 'Buka semula ke' : 'Pindah ke (termasuk kembali)'} required value={stage.stage} onChange={(e) => setStage({ ...stage, stage: e.target.value })}>
                <option value="">Pilih</option>
                {MOVABLE.filter((id) => id !== lead.status).map((id) => <option key={id} value={id}>{STAGE_LABEL[id]}</option>)}
              </Select>
              <Input label="Catatan" value={stage.remark} onChange={(e) => setStage({ ...stage, remark: e.target.value })} />
              <Button type="submit" variant="primary" disabled={busy}>Tukar peringkat</Button>
            </form>
          )}

          {open && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-4">
                <p className="text-sm font-medium text-gray-900">Daftar sebagai pelajar</p>
                <p className="text-[13px] text-gray-600">
                  Borang pendaftaran penuh dibuka dengan maklumat prospek ini. Lengkapkan semua maklumat; Supervisor hanya boleh meluluskan pendaftaran yang lengkap.
                </p>
                <Button size="sm" variant="primary" onClick={() => { onClose(); navigate(`students?new&lead=${lead.id}`); }}>Buka borang pendaftaran</Button>
              </div>
              <form onSubmit={markLost} className="space-y-3 rounded-md border border-gray-200 p-4">
                <Select label="Tidak berminat" required value={reason.choice} onChange={(e) => setReason({ ...reason, choice: e.target.value })}>
                  <option value="">Pilih sebab</option>
                  {lostReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                  <option value={OTHER_REASON}>Lain-lain (taip sebab)</option>
                </Select>
                {reason.choice === OTHER_REASON && (
                  <Input label="Nyatakan sebab" required value={reason.typed} onChange={(e) => setReason({ ...reason, typed: e.target.value })} />
                )}
                <Button type="submit" size="sm" variant="danger" disabled={busy}>Tanda tidak berminat</Button>
              </form>
            </div>
          )}
        </section>

        {open && (
          <form onSubmit={addActivity} className="grid grid-cols-2 items-end gap-3 border-t border-gray-200 pt-5 sm:grid-cols-3">
            <h3 className="col-span-2 text-sm font-semibold text-gray-900 sm:col-span-3">Rekod tindakan susulan</h3>
            <Input label="Tarikh" type="date" required value={activity.activity_date} onChange={(e) => setActivity({ ...activity, activity_date: e.target.value })} />
            <Select label="Tindakan" value={activity.action} onChange={(e) => setActivity({ ...activity, action: e.target.value })}>
              {actions.map((a) => <option key={a}>{a}</option>)}
            </Select>
            <Select label="Status" value={activity.outcome} onChange={(e) => setActivity({ ...activity, outcome: e.target.value })}>
              {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
            <Input label="Susulan seterusnya" type="date" value={activity.next_follow_up} onChange={(e) => setActivity({ ...activity, next_follow_up: e.target.value })} />
            <Input label="Catatan" required className="col-span-2 sm:col-span-3" value={activity.remark} onChange={(e) => setActivity({ ...activity, remark: e.target.value })} />
            <Button type="submit" variant="primary" disabled={busy}>Rekod</Button>
          </form>
        )}

        <section className="border-t border-gray-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Log aktiviti ({activities.length})</h3>
          {activities.length === 0 ? <p className="text-sm text-gray-500">Belum ada rekod.</p> : (
            <Table>
              <thead>
                <tr><Th>Tarikh &amp; masa</Th><Th>Peringkat</Th><Th>Tindakan</Th><Th>Catatan</Th><Th>Dibuat oleh</Th><Th>Status</Th><Th>Susulan</Th></tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id} className="align-top">
                    <Td className="whitespace-nowrap">{date(a.activity_date)} <span className="text-gray-400">{clock(a.created_at)}</span></Td>
                    <Td className="whitespace-nowrap">{STAGE_LABEL[a.stage]}</Td>
                    <Td className="font-medium text-gray-900">{a.action}</Td>
                    <Td className="text-gray-600">{a.remark || '—'}</Td>
                    <Td className="whitespace-nowrap font-medium text-gray-800">{a.pic}</Td>
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

function LeadCard({ lead, onOpen, onMove, sourceLabel, subjectName }) {
  const due = isDue(lead);
  const idx = MOVABLE.indexOf(lead.status);
  const next = idx >= 0 && idx < MOVABLE.length - 1 ? MOVABLE[idx + 1] : null;
  const previous = idx > 0 ? MOVABLE[idx - 1] : null;
  const missing = lead.missing_fields || [];
  const open = !CLOSED.includes(lead.status);
  return (
    <div className={cx('rounded-md border bg-white p-3 text-[13px]', due ? 'border-amber-300' : 'border-gray-200')}>
      <button type="button" onClick={onOpen} className="block text-left text-sm font-medium text-gray-900 hover:text-brand-700 hover:underline">{leadTitle(lead)}</button>
      <p className="text-gray-500">{lead.lead_id} · {formShort(lead.form_level) || 'Tingkatan ?'} · {sourceLabel(lead.lead_source)}</p>
      {lead.interested_subjects.length > 0 && <p className="mt-1 text-gray-600">{lead.interested_subjects.map(subjectName).join(', ')}</p>}
      {lead.campaign && <p className="text-gray-500">Kempen: {lead.campaign}</p>}
      {open && missing.length > 0 && (
        <button type="button" onClick={onOpen} title={`Belum ada: ${missing.join(', ')}`} className="mt-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100">
          Belum lengkap ({missing.length})
        </button>
      )}
      <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">PIC: {lead.assigned_to || '—'}</span>
          {open && lead.next_follow_up && (
            <span className={cx('flex shrink-0 items-center gap-1', due && 'font-medium text-amber-700')}><Clock className="size-3" /> {date(lead.next_follow_up)}</span>
          )}
          {lead.converted_student_code && <span className="font-medium text-brand-700">{lead.converted_student_code}</span>}
        </div>
        {lead.last_move_by && (
          <p className="mt-1 truncate" title={`Peringkat terakhir ditukar oleh ${lead.last_move_by}`}>
            Ditukar oleh <span className="font-medium text-gray-700">{lead.last_move_by}</span>
            {lead.last_move_at && <> · {date(lead.last_move_at.slice(0, 10))} {clock(lead.last_move_at)}</>}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {previous && (
            <Button size="sm" className="h-7 px-1.5" aria-label={`Kembali ke ${STAGE_LABEL[previous]}`} title={`Kembali ke ${STAGE_LABEL[previous]}`} onClick={() => onMove(lead, previous)}>
              <ChevronLeft className="size-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onOpen}>Log ({lead.activity_count})</Button>
        </div>
        {next && (
          <Button size="sm" className="h-7 px-2 text-xs" title={`Pindah ke ${STAGE_LABEL[next]}`} onClick={() => onMove(lead, next)}>
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
  const { leads, leadAction, refreshLeads, getMasterOptions, subjects } = useApp();
  const notify = useToast();
  useThresholds(); // the board window and the stage names are settings
  const [filters, setFilters] = useState({ source: '', form: '', campaign: '', start: '', end: '' });
  const [dueOnly, setDueOnly] = useState(false);
  // Opened from the follow-ups figure on Ringkasan: the server says which prospects it counts
  const drill = useDrill(LEAD_FILTERS);
  const matched = useMatching(drill, leadsApi.matching);
  const [tab, setTab] = useState('board');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [stats, setStats] = useState(null);
  const [shown, setShown] = useState({}); // cards shown per column, grows with "Tunjuk lagi"
  const [archive, setArchive] = useState({ outcome: 'ALL', q: '', limit: ARCHIVE_PAGE });

  const sources = useMemo(() => getMasterOptions('3_lead_source'), [getMasterOptions]);
  const schools = useMemo(() => getMasterOptions('6_school'), [getMasterOptions]);
  const sourceMap = useMemo(() => Object.fromEntries(sources.map((s) => [s.value, s.label])), [sources]);
  const sourceLabel = useCallback((code) => sourceMap[code] || code || '—', [sourceMap]);
  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [s.code, s.name])), [subjects]);
  const subjectName = useCallback((code) => subjectMap[code] || code, [subjectMap]);
  // The lists the centre manages in Data induk
  const listedCampaigns = useMemo(() => getMasterOptions('22_lead_campaign').map((o) => o.label), [getMasterOptions]);
  const campaigns = useMemo(() => [...new Set([...listedCampaigns, ...leads.map((l) => l.campaign).filter(Boolean)])].sort(), [leads, listedCampaigns]);
  // These two lists keep the order the centre set (meta.order), then anything added later A to Z
  const inOrder = useCallback((category) => getMasterOptions(category)
    .sort((a, b) => (a.meta?.order ?? 999) - (b.meta?.order ?? 999) || a.label.localeCompare(b.label))
    .map((o) => o.label), [getMasterOptions]);
  const actions = useMemo(() => { const listed = inOrder('23_lead_action'); return listed.length ? listed : DEFAULT_ACTIONS; }, [inOrder]);
  const lostReasons = useMemo(() => inOrder('24_lost_reason').filter((r) => r !== 'Lain-lain'), [inOrder]);

  const filtered = useMemo(() => leads.filter((l) => (
    (!filters.source || l.lead_source === filters.source)
    && (!filters.form || l.form_level === filters.form)
    && (!filters.campaign || l.campaign === filters.campaign)
    && (!filters.start || l.enquiry_date >= filters.start)
    && (!filters.end || l.enquiry_date <= filters.end)
    && (drill ? Boolean(matched?.ids.has(l.id)) : (!dueOnly || isDue(l)))
  )), [leads, filters, dueOnly, drill, matched]);

  // Figures come from the server with the same filters; refetched whenever a lead changes
  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    leadsApi.stats(params).then(setStats).catch(() => setStats(null));
  }, [filters, leads]);

  const openLead = leads.find((l) => l.id === openId);
  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));

  // Finished prospects leave the board after a while so it does not fill up; they stay in Arkib
  const cutoff = daysAgoISO(THRESHOLDS.lead_board_days);
  const onBoard = (lead) => !CLOSED.includes(lead.status) || (lead.stage_changed_at || '') >= cutoff;
  const lost = filtered.filter((l) => l.status === 'LOST');
  const lostOnBoard = lost.filter(onBoard);
  const finished = filtered.filter((l) => CLOSED.includes(l.status));

  // One click moves a prospect; the toast offers to undo it, and the log records who did it
  const move = async (lead, target) => {
    const from = lead.status;
    try {
      await leadAction(lead.id, 'move', { stage: target }, '');
    } catch {
      return; // leadAction has already said what went wrong
    }
    notify(`${leadTitle(lead)} dipindah ke ${STAGE_LABEL[target]}.`, 'success', {
      action: { label: 'Buat asal', onClick: () => leadAction(lead.id, 'move', { stage: from, remark: 'Dibuat asal' }, 'Perubahan dibuat asal.').catch(() => {}) },
    });
  };

  const exportCsv = () => downloadCsv(`prospek-${todayISO()}.csv`,
    ['ID', 'Tarikh', 'Pelajar', 'Ibu bapa', 'Telefon', 'Tingkatan', 'Sumber', 'Kempen', 'Peringkat', 'PIC', 'Susulan', 'Subjek'],
    filtered.map((l) => [l.lead_id, l.enquiry_date, l.student_name, l.parent_name, fmtPhone(l.phone), l.form_level, sourceLabel(l.lead_source),
      l.campaign, STAGE_LABEL[l.status], l.assigned_to, l.next_follow_up || '', l.interested_subjects.map(subjectName).join(' / ')]));

  const archived = useMemo(() => {
    const needle = archive.q.trim().toLowerCase();
    return finished
      .filter((l) => archive.outcome === 'ALL' || l.status === archive.outcome)
      .filter((l) => !needle || [l.student_name, l.parent_name, l.lead_id, l.converted_student_code].some((v) => String(v || '').toLowerCase().includes(needle)) || phoneMatches(l.phone, archive.q))
      .sort((a, b) => (b.stage_changed_at || '').localeCompare(a.stage_changed_at || ''));
  }, [finished, archive.outcome, archive.q]);

  const showArchive = (outcome) => { setArchive({ outcome, q: '', limit: ARCHIVE_PAGE }); setTab('archive'); };

  return (
    <>
      <PageHeader
        title="Pertanyaan & prospek"
        description="Lapan peringkat dari Enquiry hingga Active. Setiap tindakan direkod dengan peringatan susulan seminggu."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} items={[{ value: 'board', label: 'Papan' }, { value: 'archive', label: `Arkib (${finished.length})` }, { value: 'analysis', label: 'Analisis' }]} />
            <Button icon={Download} onClick={exportCsv}>Excel</Button>
            <Button icon={Upload} onClick={() => setImporting(true)}>Import CSV</Button>
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

      {drill && (
        <DrilldownBar
          chips={describeLeadFilters(drill.filters)}
          result={matched}
          expect={drill.expect}
          unit={drill.unit}
          src={drill.src}
          noun="prospek"
          onClear={() => navigate('leads')}
        />
      )}
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
        {!drill && <Checkbox label="Susulan tertunggak sahaja" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />}
      </div>

      {tab === 'board' && (
        <>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3" style={{ minWidth: `${LEAD_STAGES.length * 236}px` }}>
              {LEAD_STAGES.map((s, i) => {
                const all = filtered.filter((l) => l.status === s.id);
                const current = all.filter(onBoard);
                const older = all.length - current.length; // finished long ago: in Arkib
                const limit = shown[s.id] ?? COLUMN_LIMIT;
                const items = current.slice(0, limit);
                return (
                  <section key={s.id} aria-label={s.label} className="w-56 shrink-0 rounded-lg border border-gray-200 bg-gray-100/70 p-2.5">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <h2 className="text-[13px] font-semibold text-gray-700">{i + 1}. {s.label}</h2>
                      <span className="rounded bg-white px-1.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 tnum">{current.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} onMove={move} sourceLabel={sourceLabel} subjectName={subjectName} />)}
                      {items.length === 0 && <p className="rounded-md border border-dashed border-gray-300 py-6 text-center text-xs text-gray-400">Tiada prospek</p>}
                      {current.length > items.length && (
                        <Button size="sm" variant="ghost" className="w-full" onClick={() => setShown({ ...shown, [s.id]: limit + COLUMN_LIMIT })}>Tunjuk lagi ({current.length - items.length})</Button>
                      )}
                      {older > 0 && (
                        <button type="button" onClick={() => showArchive(s.id)} className="w-full rounded-md px-2 py-1.5 text-center text-xs font-medium text-brand-700 hover:bg-white">
                          +{older} lebih {THRESHOLDS.lead_board_days} hari lalu: lihat di Arkib
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader
              title={`Tidak berminat (${lostOnBoard.length}${lost.length > lostOnBoard.length ? ` daripada ${lost.length}` : ''})`}
              description={`Hanya yang ditutup dalam ${THRESHOLDS.lead_board_days} hari lalu dipaparkan di sini. Boleh dibuka semula ke mana-mana peringkat.`}
              actions={lost.length > lostOnBoard.length && <Button size="sm" onClick={() => showArchive('LOST')}>Lihat semua di Arkib</Button>}
            />
            {lostOnBoard.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500">Tiada.</p> : (
              <Table>
                <thead>
                  <tr><Th>Prospek</Th><Th>Peringkat terakhir</Th><Th>Sebab</Th><Th>Tarikh</Th><Th className="w-0"><span className="sr-only">Tindakan</span></Th></tr>
                </thead>
                <tbody>
                  {lostOnBoard.map((l) => (
                    <tr key={l.id}>
                      <Td className="font-medium text-gray-900">{leadTitle(l)} <span className="font-normal text-gray-400">· {l.lead_id}</span></Td>
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

      {tab === 'archive' && (
        <Card>
          <CardHeader title="Arkib prospek" description="Prospek yang sudah didaftarkan, aktif atau tidak berminat. Semuanya kekal di sini walaupun sudah keluar dari papan." />
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
            <Segmented
              value={archive.outcome}
              onChange={(outcome) => setArchive({ ...archive, outcome, limit: ARCHIVE_PAGE })}
              items={[
                { value: 'ALL', label: `Semua (${finished.length})` },
                { value: 'REGISTERED', label: `${STAGE_LABEL.REGISTERED} (${finished.filter((l) => l.status === 'REGISTERED').length})` },
                { value: 'ACTIVE', label: `${STAGE_LABEL.ACTIVE} (${finished.filter((l) => l.status === 'ACTIVE').length})` },
                { value: 'LOST', label: `Tidak berminat (${lost.length})` },
              ]}
            />
            <input
              aria-label="Cari dalam arkib"
              placeholder="Cari nama, no. telefon atau ID"
              value={archive.q}
              onChange={(e) => setArchive({ ...archive, q: e.target.value, limit: ARCHIVE_PAGE })}
              className={cx(filterClass, 'w-64')}
            />
          </div>
          {archived.length === 0 ? <EmptyState title="Tiada prospek dalam arkib" /> : (
            <Table>
              <thead>
                <tr><Th>Prospek</Th><Th>Tingkatan</Th><Th>Peringkat</Th><Th>Tarikh</Th><Th>Pelajar</Th><Th className="w-0"><span className="sr-only">Tindakan</span></Th></tr>
              </thead>
              <tbody>
                {archived.slice(0, archive.limit).map((l) => (
                  <tr key={l.id}>
                    <Td className="font-medium text-gray-900">{leadTitle(l)} <span className="font-normal text-gray-400">· {l.lead_id}</span>
                      <p className="text-[13px] font-normal text-gray-500">{fmtPhone(l.phone)}</p>
                    </Td>
                    <Td>{l.form_level ? formShort(l.form_level) : '—'}</Td>
                    <Td>
                      <Badge tone={l.status === 'LOST' ? 'neutral' : 'green'}>{STAGE_LABEL[l.status]}</Badge>
                      {l.status === 'LOST' && l.lost_reason && <p className="mt-1 text-[13px] text-gray-500">{l.lost_reason}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">{date((l.stage_changed_at || '').slice(0, 10))}</Td>
                    <Td>{l.converted_student_code ? <a href={`#/students/${l.converted_student_code}`} className="font-medium text-brand-700 hover:underline">{l.converted_student_code}</a> : '—'}</Td>
                    <Td><Button size="sm" onClick={() => setOpenId(l.id)}>Buka</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {archived.length > archive.limit && (
            <div className="border-t border-gray-100 p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setArchive({ ...archive, limit: archive.limit + ARCHIVE_PAGE })}>Tunjuk lagi ({archived.length - archive.limit})</Button>
            </div>
          )}
        </Card>
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

      {adding && <AddLeadModal onClose={() => setAdding(false)} sources={sources} campaigns={listedCampaigns} schools={schools} />}
      {importing && (
        <LeadImportModal
          onClose={() => setImporting(false)}
          onImported={refreshLeads}
          stages={MOVABLE.map((id) => ({ id, label: STAGE_LABEL[id] }))}
          sources={sources}
          campaigns={listedCampaigns}
        />
      )}
      {openLead && (
        <LeadDetailModal
          key={openLead.id}
          lead={openLead}
          onClose={() => setOpenId(null)}
          sources={sources}
          sourceLabel={sourceLabel}
          subjectName={subjectName}
          campaigns={listedCampaigns}
          schools={schools}
          actions={actions}
          lostReasons={lostReasons}
        />
      )}
    </>
  );
}
