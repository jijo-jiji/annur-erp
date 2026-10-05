import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock, Download, Search, UserPlus, Users } from 'lucide-react';
import { useStore } from '../store';
import { useApp } from '../context/AppContext';
import { studentsApi } from '../api/client';
import { invoiceBalance, minSubjects, monthlyFee, preferredContact, subjectsForForm } from '../lib/domain';
import { date, DAY_LABEL, FORMS, formLabel, formShort, initials, rm, STREAM_LABEL, STUDENT_STATUS, timeRange, todayISO, waLink } from '../lib/format';
import { navigate } from '../lib/nav';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { FeedbackGallery } from './FeedbackViews';
import PromotionPanel from './PromotionPanel';
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, cx, EmptyState, Input, Modal, PageHeader, SearchInput, Segmented, Select, Table, Tabs, Td, Textarea, Th,
  useToast, WhatsAppIcon,
} from './ui';

const PAGE = 50;

export default function StudentRegistrationView({ role }) {
  const canEdit = can(role, 'students.edit');
  const [mode, setMode] = useState(() => (window.location.hash.includes('?new') ? 'form' : 'list'));

  useEffect(() => {
    const onHash = () => setMode(window.location.hash.includes('?new') ? 'form' : 'list');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (mode === 'form' && canEdit) {
    return <RegistrationForm onCancel={() => navigate('students')} onDone={(id) => navigate(`students/${id}`)} />;
  }
  return <StudentsHome role={role} canEdit={canEdit} />;
}

// ---- Tabs ---------------------------------------------------------------------

function StudentsHome({ role, canEdit }) {
  const { students, waitlist } = useStore();
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]).get('tab') ?? 'list');
  const pending = students.filter((s) => s.status === 'PENDING');
  const active = students.filter((s) => s.status === 'ACTIVE').length;

  return (
    <>
      <PageHeader
        title="Pelajar"
        description={`${active} pelajar aktif. Pendaftaran baharu menunggu kelulusan Supervisor sebelum aktif dan invois pertama dijana.`}
        actions={
          canEdit && (
            <Button variant="primary" icon={UserPlus} onClick={() => navigate('students?new')}>
              Daftar pelajar
            </Button>
          )
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'list', label: 'Senarai' },
          { value: 'approvals', label: 'Kelulusan', count: pending.length },
          { value: 'waitlist', label: 'Senarai menunggu', count: waitlist.length },
          { value: 'history', label: 'Laporan sejarah' },
          { value: 'gallery', label: 'Galeri maklum balas' },
          ...(can(role, 'students.promote') ? [{ value: 'promote', label: 'Naik tingkatan' }] : []),
        ]}
      />
      {tab === 'list' && <StudentList />}
      {tab === 'approvals' && <Approvals role={role} pending={pending} />}
      {tab === 'waitlist' && <WaitingList role={role} />}
      {tab === 'history' && <HistoryReport />}
      {tab === 'gallery' && <FeedbackGallery canDelete={can(role, 'students.approve')} />}
      {tab === 'promote' && can(role, 'students.promote') && <PromotionPanel />}
    </>
  );
}

// ---- Directory ----------------------------------------------------------------

function StudentList() {
  const { students, invoices } = useStore();
  const [q, setQ] = useState('');
  const [form, setForm] = useState('ALL');
  const [status, setStatus] = useState('ACTIVE');
  const [limit, setLimit] = useState(PAGE);

  const balances = useMemo(() => {
    const b = {};
    for (const i of invoices) b[i.studentId] = (b[i.studentId] ?? 0) + invoiceBalance(i);
    return b;
  }, [invoices]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => {
      if (status !== 'ALL' && s.status !== status) return false;
      if (form !== 'ALL' && s.form !== form) return false;
      if (!needle) return true;
      return [s.name, s.id, s.ic, s.school, s.parent1.name, s.parent1.phone, s.parent2?.phone].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [students, q, form, status]);

  const count = (st) => students.filter((s) => s.status === st).length;
  const exportCsv = () => downloadCsv(
    `pelajar-${todayISO()}.csv`,
    ['ID', 'Nama', 'No. KP', 'Tingkatan', 'Jenis', 'Status', 'Sekolah', 'Telefon pelajar', 'Penjaga', 'Telefon penjaga', 'Subjek', 'Tarikh daftar', 'Baki yuran'],
    filtered.map((s) => {
      const c = preferredContact(s);
      return [s.id, s.name, s.ic, formLabel(s.form), s.type === 'WALK_IN' ? 'Walk-in' : 'Bulanan', STUDENT_STATUS[s.status]?.label, s.school, s.phone, c.name, c.phone, s.classes.length, s.joined, balances[s.id] ?? 0];
    }),
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
        <SearchInput icon={Search} value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder="Cari nama, ID, no. K/P, sekolah atau telefon" className="w-full sm:w-80" />
        <select
          value={form}
          onChange={(e) => { setForm(e.target.value); setLimit(PAGE); }}
          aria-label="Tapis tingkatan"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-600 focus:outline-none"
        >
          <option value="ALL">Semua tingkatan</option>
          {FORMS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <Segmented
          value={status}
          onChange={(v) => { setStatus(v); setLimit(PAGE); }}
          items={[
            { value: 'ACTIVE', label: `Aktif (${count('ACTIVE')})` },
            { value: 'ON_HOLD', label: `Ditangguh (${count('ON_HOLD')})` },
            { value: 'TERMINATED', label: `Berhenti (${count('TERMINATED')})` },
            { value: 'ALL', label: 'Semua' },
          ]}
        />
        <Button size="sm" icon={Download} className="ml-auto" onClick={exportCsv}>
          CSV / Excel
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Tiada pelajar ditemui">
          Cuba ubah kata carian atau tapisan.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Pelajar</Th>
              <Th>Tingkatan</Th>
              <Th className="hidden xl:table-cell">Sekolah</Th>
              <Th className="hidden md:table-cell">Penjaga</Th>
              <Th className="hidden text-right sm:table-cell">Baki</Th>
              <Th className="w-0">
                <span className="sr-only">Tindakan</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((s) => {
              const contact = preferredContact(s);
              const bal = balances[s.id] ?? 0;
              return (
                <tr key={s.id} onClick={() => navigate(`students/${s.id}`)} className="cursor-pointer hover:bg-gray-50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar text={initials(s.name)} />
                      <div className="min-w-0">
                        <a href={`#/students/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-gray-900 hover:text-brand-700">
                          {s.name}
                        </a>
                        <p className="text-[13px] text-gray-500">
                          {s.id}
                          {s.type === 'WALK_IN' && <Badge className="ml-2">Walk-in</Badge>}
                          {s.status !== 'ACTIVE' && <Badge tone={STUDENT_STATUS[s.status]?.tone} className="ml-2">{STUDENT_STATUS[s.status]?.label}</Badge>}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <p className="text-gray-900">{formLabel(s.form)}</p>
                    <p className="text-[13px] text-gray-500">
                      {STREAM_LABEL[s.stream] ?? s.stream} · {s.classes.length} subjek
                    </p>
                  </Td>
                  <Td className="hidden text-gray-700 xl:table-cell">{s.school}</Td>
                  <Td className="hidden md:table-cell">
                    <p className="whitespace-nowrap text-gray-900">{contact.name}</p>
                    <p className="text-[13px] text-gray-500">{contact.phone}</p>
                  </Td>
                  <Td className={cx('hidden text-right tnum sm:table-cell', bal ? 'font-medium text-red-700' : 'text-gray-400')}>{bal ? rm(bal) : '—'}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <a
                      href={waLink(contact.phone, `Assalamualaikum ${contact.name}, makluman daripada Pusat Tuisyen An Nur berkenaan ${s.name}.`)}
                      target="_blank"
                      rel="noreferrer"
                      title="WhatsApp penjaga"
                      aria-label={`WhatsApp penjaga ${s.name}`}
                      className="inline-flex size-8 items-center justify-center rounded-md hover:bg-gray-100"
                    >
                      <WhatsAppIcon />
                    </a>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {filtered.length > limit && (
        <div className="border-t border-gray-200 p-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Tunjuk {Math.min(PAGE, filtered.length - limit)} lagi ({filtered.length - limit} baki)
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---- Registration approval (Supervisor / Management) -----------------------------

function Approvals({ role, pending }) {
  const { studentAction, classes } = useStore();
  const notify = useToast();
  const [rejecting, setRejecting] = useState(null);
  const [comment, setComment] = useState('');
  const canApprove = can(role, 'students.approve');

  const approve = (s) => studentAction(s.id, 'approve')
    .then((res) => notify(res.invoice ? `${s.name} diluluskan. Invois ${res.invoice.invoice_number} (${rm(res.invoice.total_payable)}) dijana.` : `${s.name} diluluskan.`))
    .catch(() => {});
  const reject = (e) => {
    e.preventDefault();
    studentAction(rejecting.id, 'reject', { comment })
      .then(() => { notify(`Pendaftaran ${rejecting.name} ditolak.`, 'info'); setRejecting(null); setComment(''); })
      .catch(() => {});
  };

  return (
    <Card>
      {pending.length === 0 ? (
        <EmptyState icon={Check} title="Tiada pendaftaran menunggu kelulusan" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Pelajar</Th>
              <Th>Tingkatan</Th>
              <Th>Kelas dipilih</Th>
              <Th className="hidden md:table-cell">Penjaga</Th>
              <Th>Didaftar</Th>
              <Th className="text-right">Tindakan</Th>
            </tr>
          </thead>
          <tbody>
            {pending.map((s) => {
              const contact = preferredContact(s);
              return (
                <tr key={s.id}>
                  <Td>
                    <a href={`#/students/${s.id}`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
                      {s.name}
                    </a>
                    <p className="text-[13px] text-gray-500">{s.id} · {s.source === 'QR_CODE' ? 'Borang QR' : 'Kaunter'}</p>
                  </Td>
                  <Td className="whitespace-nowrap">{formLabel(s.form)}</Td>
                  <Td className="text-[13px] text-gray-700">
                    {s.classes.length === 0 ? <span className="text-amber-700">Belum ada kelas: tetapkan dalam profil</span>
                      : s.classes.map((id) => classes.find((c) => c.id === id)?.code).filter(Boolean).join(', ')}
                    {s.waitingFor.length > 0 && <p className="text-amber-700">Menunggu: {s.waitingFor.map((w) => w.class_code).join(', ')}</p>}
                  </Td>
                  <Td className="hidden md:table-cell">
                    <p className="text-gray-900">{contact.name}</p>
                    <p className="text-[13px] text-gray-500">{contact.phone}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-gray-600">{date(s.joined)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {canApprove ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="danger" onClick={() => setRejecting(s)}>
                          Tolak
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => approve(s)}>
                          Luluskan
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[13px] text-gray-500">Menunggu Supervisor</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Tolak pendaftaran"
        description={rejecting?.name}
        size="sm"
        footer={
          <>
            <Button onClick={() => setRejecting(null)}>Batal</Button>
            <Button type="submit" form="reject-form" variant="danger">Tolak</Button>
          </>
        }
      >
        <form id="reject-form" onSubmit={reject}>
          <Textarea label="Sebab penolakan" required value={comment} onChange={(e) => setComment(e.target.value)} hint="Tempat kelas yang dipilih akan dilepaskan." />
        </form>
      </Modal>
    </Card>
  );
}

// ---- Waiting list ---------------------------------------------------------------

function WaitingList({ role }) {
  const { waitlist, students, classes, subjects, enrollFromWaitlist, removeFromWaitlist } = useStore();
  const notify = useToast();
  const canManage = can(role, 'waitlist.manage');
  return (
    <Card>
      {waitlist.length === 0 ? (
        <EmptyState icon={Clock} title="Tiada pelajar dalam senarai menunggu" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Pelajar</Th>
              <Th>Kelas</Th>
              <Th>Kerusi</Th>
              <Th>Sejak</Th>
              <Th className="text-right">Tindakan</Th>
            </tr>
          </thead>
          <tbody>
            {waitlist.map((w) => {
              const s = students.find((x) => x.id === w.studentId);
              const c = classes.find((x) => x.id === w.classId);
              const full = c && c.enrolled >= c.max;
              return (
                <tr key={w.id}>
                  <Td>
                    <a href={`#/students/${w.studentId}`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
                      {s?.name ?? w.studentId}
                    </a>
                    <p className="text-[13px] text-gray-500">{w.studentId}</p>
                  </Td>
                  <Td>
                    <p className="text-gray-900">{c?.code}</p>
                    <p className="text-[13px] text-gray-500">{subjects.find((x) => x.code === c?.subject)?.name}</p>
                  </Td>
                  <Td className={cx('tnum', full && 'text-red-700')}>{c ? `${c.enrolled}/${c.max}` : '—'}</Td>
                  <Td className="whitespace-nowrap text-gray-600">{date(w.added)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-2">
                      {canManage && (
                        <Button
                          size="sm"
                          variant="primary"
                          title={full ? 'Kelas penuh: pelajar akan dimasukkan melebihi had' : undefined}
                          onClick={() => {
                            if (full && !window.confirm(`${c.code} sudah penuh (${c.enrolled}/${c.max}). Masukkan juga melebihi had?`)) return;
                            enrollFromWaitlist(w.id).then(() => notify('Pelajar dimasukkan ke kelas.')).catch(() => {});
                          }}
                        >
                          Masukkan ke kelas
                        </Button>
                      )}
                      <Button size="sm" onClick={() => removeFromWaitlist(w.id).catch(() => {})}>
                        Keluarkan
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {!canManage && waitlist.length > 0 && <p className="border-t border-gray-200 px-5 py-3 text-[13px] text-gray-500">Supervisor atau Pengurusan memasukkan pelajar ke kelas.</p>}
    </Card>
  );
}

// ---- History report (daily / weekly / monthly / custom) ---------------------------

const HISTORY_TYPES = [
  { value: 'REGISTERED,APPROVED,REJECTED', label: 'Pendaftaran' },
  { value: 'ADD_SUBJECT,DROP_SUBJECT,CHANGE_CLASS', label: 'Tambah / gugur / tukar subjek' },
  { value: 'ON_HOLD,RESUME', label: 'Tangguh / aktif semula' },
  { value: 'TERMINATE', label: 'Berhenti' },
  { value: 'PROMOTE', label: 'Naik tingkatan' },
  { value: 'FEEDBACK', label: 'Maklum balas' },
  { value: 'NOTE', label: 'Catatan' },
];

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function HistoryReport() {
  const { getMasterOptions } = useApp();
  const today = todayISO();
  const [range, setRange] = useState({ start: today, end: today });
  const [type, setType] = useState('');
  const [rows, setRows] = useState([]);
  const reasons = Object.fromEntries(getMasterOptions('14_drop_reason').map((r) => [r.value, r.label]));

  const load = useCallback(() => {
    const params = { start: range.start, end: range.end };
    if (type) params.type = type;
    studentsApi.history(params).then(setRows).catch(() => setRows([]));
  }, [range, type]);
  useEffect(() => { load(); }, [load]);

  const presets = [['Hari ini', today, today], ['Minggu ini', weekStart(), today], ['Bulan ini', `${today.slice(0, 8)}01`, today]];
  const detail = (e) => [e.class_label, reasons[e.reason_code] || e.reason_code, e.reason_text, e.description, e.hold_until && `hingga ${date(e.hold_until)}`].filter(Boolean).join(' · ');

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 p-4">
        <Segmented
          value={presets.find(([, s, e]) => s === range.start && e === range.end)?.[0] ?? ''}
          onChange={(name) => { const p = presets.find((x) => x[0] === name); setRange({ start: p[1], end: p[2] }); }}
          items={presets.map(([name]) => ({ value: name, label: name }))}
        />
        <Input label="Dari" type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
        <Input label="Hingga" type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
        <Select label="Jenis" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Semua</option>
          {HISTORY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
        <Button
          size="sm"
          icon={Download}
          className="ml-auto"
          onClick={() => downloadCsv(`sejarah-pelajar-${range.start}-${range.end}.csv`, ['Tarikh', 'Pelajar', 'ID', 'Peristiwa', 'Butiran', 'Tindakan', 'Direkod oleh'],
            rows.map((e) => [e.event_date, e.student_name, e.student_code, e.event_label, detail(e), e.action, e.recorded_by]))}
        >
          CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Tiada rekod dalam tempoh ini" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Tarikh</Th>
              <Th>Pelajar</Th>
              <Th>Peristiwa</Th>
              <Th>Butiran</Th>
              <Th className="hidden md:table-cell">Oleh</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-gray-600">{date(e.event_date)}</Td>
                <Td>
                  <a href={`#/students/${e.student_code}`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
                    {e.student_name}
                  </a>
                </Td>
                <Td><Badge>{e.event_label}</Badge></Td>
                <Td className="text-gray-700">{detail(e) || '—'}{e.action && <p className="text-[13px] text-gray-500">Tindakan: {e.action}</p>}</Td>
                <Td className="hidden text-gray-600 md:table-cell">{e.recorded_by}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

// ---- Class picker (with waiting list for full classes) -------------------------

export function ClassPicker({ form, value, onChange, waitlist = [], onWaitlistChange }) {
  const { subjects, classes, teachers } = useStore();
  const available = subjectsForForm(subjects, form, classes);
  const subjectOf = (id) => classes.find((c) => c.id === id)?.subject;

  const choose = (c) => {
    const full = c.enrolled >= c.max;
    const inClass = value.includes(c.id);
    const waiting = waitlist.includes(c.id);
    // one choice per subject: clear any other section of this subject first
    const otherClasses = value.filter((id) => subjectOf(id) !== c.subject);
    const otherWaits = waitlist.filter((id) => subjectOf(id) !== c.subject);
    if (inClass || waiting) {
      onChange(otherClasses);
      onWaitlistChange?.(otherWaits);
    } else if (full && onWaitlistChange) {
      onChange(otherClasses);
      onWaitlistChange([...otherWaits, c.id]);
    } else {
      onChange([...otherClasses, c.id]);
      onWaitlistChange?.(otherWaits);
    }
  };

  if (available.length === 0) {
    return <p className="py-4 text-sm text-gray-500">Tiada kelas dibuka untuk {formLabel(form)}. Tambah kelas dalam Jadual kelas.</p>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {available.map((subj) => {
        const options = classes.filter((c) => c.form === form && c.subject === subj.code);
        return (
          <div key={subj.code} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
            <p className="w-44 shrink-0 pt-1.5 text-sm font-medium text-gray-900">{subj.name}</p>
            <div className="flex flex-1 flex-wrap gap-2">
              {options.map((c) => {
                const selected = value.includes(c.id);
                const waiting = waitlist.includes(c.id);
                const full = c.enrolled >= c.max;
                const seats = c.max - c.enrolled;
                const teacher = teachers.find((t) => t.code === c.teacher)?.name;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => choose(c)}
                    aria-pressed={selected || waiting}
                    className={cx(
                      'flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[13px] transition-colors',
                      selected && 'border-brand-600 bg-brand-50 ring-1 ring-brand-600',
                      waiting && 'border-amber-500 bg-amber-50 ring-1 ring-amber-500',
                      !selected && !waiting && 'border-gray-300 bg-white hover:border-gray-400',
                    )}
                  >
                    <span
                      className={cx(
                        'flex size-4 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-brand-700 bg-brand-700 text-white' : waiting ? 'border-amber-600 bg-amber-500 text-white' : 'border-gray-300',
                      )}
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                      {waiting && <Clock className="size-3" strokeWidth={3} />}
                    </span>
                    <span>
                      <span className="font-medium text-gray-900">
                        {c.section} · {DAY_LABEL[c.day]} {timeRange(c.start, c.end)}
                      </span>
                      <span className={cx('block', waiting ? 'text-amber-800' : full ? 'text-red-700' : 'text-gray-500')}>
                        {teacher ? `Cikgu ${teacher}` : 'Guru belum ditetapkan'} ·{' '}
                        {waiting
                          ? `Senarai menunggu (${c.waiting + 1})`
                          : full
                            ? onWaitlistChange
                              ? `Penuh (${seats} kerusi): sertai senarai menunggu`
                              : `Penuh (${c.enrolled}/${c.max})`
                            : `${seats} kerusi kosong`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Registration form ------------------------------------------------------

const EMPTY_PARENT = { name: '', phone: '', email: '', occupation: '', age: '' };
const OTHER_SCHOOL = '__OTHER__';

function schoolCategory(option) {
  if (!option) return '';
  if (option.meta?.category) return option.meta.category;
  const label = option.label.toUpperCase();
  return ['SMKA', 'SMK', 'SBP', 'MRSM', 'SK', 'SJK'].find((k) => label.startsWith(k)) || '';
}

function RegistrationForm({ onCancel, onDone }) {
  const { registerStudent, pricingTiers, settings, students, subjects, grades } = useStore();
  const { getMasterOptions } = useApp();
  const notify = useToast();
  const schools = getMasterOptions('6_school');
  const sources = getMasterOptions('3_lead_source');
  const ageBands = getMasterOptions('7_parent_age');
  const [f, setF] = useState({
    name: '', ic: '', form: 'F5', stream: 'SAINS', type: 'MONTHLY', schoolKey: '', school: '', phone: '', email: '', address: '', source: '',
    parent1: { ...EMPTY_PARENT, relation: 'Bapa' },
    parent2: { ...EMPTY_PARENT, relation: 'Ibu' },
    preferred: 1,
    classes: [],
    waitlist: [],
    walkInDescription: '',
    walkInSubjects: [],
    saps: true,
    terms: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const setParent = (key, patch) => setF((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const walkIn = f.type === 'WALK_IN';
  const upper = FORMS.find((x) => x.id === f.form)?.level ? FORMS.find((x) => x.id === f.form).level === 'UPPER' : /^F[45]$/.test(f.form);
  const min = minSubjects(f.form, pricingTiers, grades);
  const fee = walkIn ? 0 : monthlyFee(f.form, f.classes.length, pricingTiers, grades);
  const sibling = f.parent1.phone && students.find((s) => s.parent1.phone === f.parent1.phone && s.status !== 'TERMINATED');
  const belowMin = !walkIn && f.classes.length > 0 && f.classes.length < min;

  const submit = async (e) => {
    e.preventDefault();
    if (!walkIn && f.classes.length + f.waitlist.length === 0) {
      setError('Sila pilih sekurang-kurangnya satu kelas.');
      document.getElementById('pilihan-kelas')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (f.preferred === 2 && !f.parent2.phone) {
      setError('Hubungan utama ialah penjaga 2, tetapi nombor telefonnya kosong.');
      return;
    }
    const school = schools.find((s) => s.value === f.schoolKey);
    setBusy(true);
    try {
      const { student, enrolment } = await registerStudent(
        {
          ...f,
          school: school ? school.label : f.school,
          schoolCategory: schoolCategory(school),
          schoolCode: school?.meta?.kod || '',
          stream: upper ? f.stream : 'GENERAL',
        },
        { waitlist: f.waitlist },
      );
      const waited = Object.values(enrolment).filter((r) => r === 'WAITLISTED').length;
      notify(`${student.name} didaftarkan sebagai ${student.id} dan menunggu kelulusan Supervisor${waited ? `; ${waited} kelas dalam senarai menunggu` : ''}.`);
      onDone(student.id);
    } catch {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <button type="button" onClick={onCancel} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
        <ArrowLeft className="size-4" /> Senarai pelajar
      </button>
      <PageHeader title="Pendaftaran pelajar baharu" description="Berdasarkan borang pendaftaran rasmi Cawangan Telipot." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Maklumat pelajar" />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Input label="Nama penuh" required className="sm:col-span-2" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Seperti dalam kad pengenalan" />
              <Input label="No. kad pengenalan / sijil lahir" required value={f.ic} onChange={(e) => set({ ic: e.target.value })} placeholder="090101-03-1234" />
              <Select label="Jenis pelajar" value={f.type} onChange={(e) => set({ type: e.target.value, classes: [], waitlist: [] })}>
                <option value="MONTHLY">Bulanan (tetap)</option>
                <option value="WALK_IN">Walk-in (bayar setiap sesi)</option>
              </Select>
              <Select
                label="Tingkatan / darjah"
                required
                value={f.form}
                onChange={(e) => {
                  set({ form: e.target.value, classes: [], waitlist: [] });
                  setError('');
                }}
              >
                {FORMS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
              <Select label="Aliran" value={upper ? f.stream : 'GENERAL'} onChange={(e) => set({ stream: e.target.value })} disabled={!upper}>
                <option value="SAINS">Sains</option>
                <option value="SASTERA">Sastera / Akaun</option>
                <option value="GENERAL">Umum</option>
              </Select>
              <Select label="Sekolah" required value={f.schoolKey} onChange={(e) => set({ schoolKey: e.target.value })}>
                <option value="">Pilih sekolah</option>
                {schools.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
                <option value={OTHER_SCHOOL}>Lain-lain (taip nama)</option>
              </Select>
              {f.schoolKey === OTHER_SCHOOL ? (
                <Input label="Nama sekolah" required value={f.school} onChange={(e) => set({ school: e.target.value })} hint="Cadangkan sekolah baharu di Data induk supaya ia muncul dalam senarai." />
              ) : (
                <Select label="Sumber (bagaimana tahu tentang kami)" value={f.source} onChange={(e) => set({ source: e.target.value })}>
                  <option value="">Tidak dinyatakan</option>
                  {sources.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Select>
              )}
              <Input label="No. telefon pelajar" type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Jika ada" />
              <Input label="E-mel pelajar" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="Jika ada" />
              {f.schoolKey === OTHER_SCHOOL && (
                <Select label="Sumber (bagaimana tahu tentang kami)" value={f.source} onChange={(e) => set({ source: e.target.value })}>
                  <option value="">Tidak dinyatakan</option>
                  {sources.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Select>
              )}
              <Textarea label="Alamat rumah" className="sm:col-span-2" rows={2} value={f.address} onChange={(e) => set({ address: e.target.value })} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Ibu bapa / penjaga" description="Pilih satu penjaga sebagai hubungan utama untuk resit dan makluman WhatsApp." />
            <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
              {[1, 2].map((n) => {
                const key = `parent${n}`;
                const p = f[key];
                return (
                  <fieldset key={n} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <legend className="text-sm font-semibold text-gray-900">Penjaga {n}</legend>
                      <label className="flex items-center gap-2 text-[13px] text-gray-700">
                        <input type="radio" name="preferred" checked={f.preferred === n} onChange={() => set({ preferred: n })} className="size-4" />
                        Hubungan utama
                      </label>
                    </div>
                    <Select label="Hubungan" value={p.relation} onChange={(e) => setParent(key, { relation: e.target.value })}>
                      <option>Bapa</option>
                      <option>Ibu</option>
                      <option>Penjaga</option>
                    </Select>
                    <Input label="Nama" required={n === 1} value={p.name} onChange={(e) => setParent(key, { name: e.target.value })} />
                    <Input label="No. telefon (WhatsApp)" type="tel" required={n === 1} value={p.phone} onChange={(e) => setParent(key, { phone: e.target.value })} placeholder="012-345 6789" />
                    <Input label="E-mel" type="email" value={p.email} onChange={(e) => setParent(key, { email: e.target.value })} />
                    <Select label="Umur" value={p.age} onChange={(e) => setParent(key, { age: e.target.value })}>
                      <option value="">Tidak dinyatakan</option>
                      {ageBands.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </Select>
                    <Input label="Pekerjaan" value={p.occupation} onChange={(e) => setParent(key, { occupation: e.target.value })} />
                  </fieldset>
                );
              })}
            </div>
            {sibling && (
              <p className="border-t border-gray-200 bg-sky-50/60 px-5 py-3 text-[13px] text-sky-900">
                Penjaga ini sudah berdaftar untuk <strong>{sibling.name}</strong> ({sibling.id}). Diskaun adik-beradik boleh ditetapkan oleh Supervisor dalam profil pelajar.
              </p>
            )}
          </Card>

          {walkIn ? (
            <Card>
              <CardHeader title="Walk-in" description="Pelajar walk-in membayar setiap sesi; tiada invois bulanan dijana." />
              <div className="space-y-4 p-5">
                <Textarea label="Keterangan" required value={f.walkInDescription} onChange={(e) => set({ walkInDescription: e.target.value })} placeholder="cth. Hadir kelas intensif Sabtu sahaja sebelum peperiksaan" />
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-gray-700">Subjek walk-in</p>
                  <div className="flex flex-wrap gap-2">
                    {subjects.filter((s) => s.active).map((s) => {
                      const on = f.walkInSubjects.includes(s.pk);
                      return (
                        <button
                          key={s.pk}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set({ walkInSubjects: on ? f.walkInSubjects.filter((x) => x !== s.pk) : [...f.walkInSubjects, s.pk] })}
                          className={cx('rounded-md border px-3 py-1.5 text-[13px] font-medium', on ? 'border-brand-600 bg-brand-50 text-brand-900 ring-1 ring-brand-600' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400')}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card id="pilihan-kelas">
              <CardHeader
                title="Pilihan kelas"
                description={min > 1
                  ? `Pakej biasa bermula ${min} subjek. Pilih satu kumpulan bagi setiap subjek; kelas penuh boleh dimasukkan ke senarai menunggu.`
                  : 'Pilih kelas yang dihadiri; kelas penuh boleh dimasukkan ke senarai menunggu.'}
              />
              <div className="px-5 pb-2">
                <ClassPicker
                  form={f.form}
                  value={f.classes}
                  waitlist={f.waitlist}
                  onChange={(classes) => { set({ classes }); setError(''); }}
                  onWaitlistChange={(waitlist) => set({ waitlist })}
                />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Perakuan" />
            <div className="space-y-4 p-5">
              <Checkbox
                label="Kebenaran semakan SAPS"
                description="Membenarkan pihak tuisyen menyemak keputusan peperiksaan pelajar di sapsnkra.moe.gov.my untuk pemantauan prestasi."
                checked={f.saps}
                onChange={(e) => set({ saps: e.target.checked })}
              />
              <Checkbox
                required
                label="Syarat pembayaran dan peraturan"
                description={`Yuran dijelaskan sebelum ${settings.dueDay} haribulan setiap bulan; notis berhenti ${settings.noticeWeeks} minggu lebih awal; pelajar diberhentikan jika yuran tertunggak ${settings.unpaidMonthsLimit} bulan tanpa makluman.`}
                checked={f.terms}
                onChange={(e) => set({ terms: e.target.checked })}
              />
            </div>
          </Card>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardHeader title="Ringkasan yuran" description="Anggaran. Invois sebenar dijana selepas kelulusan Supervisor." />
            <div className="space-y-2 p-5 text-sm">
              {walkIn ? (
                <p className="text-gray-600">Walk-in: bayaran setiap sesi, tiada yuran bulanan.</p>
              ) : (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-600">Subjek didaftarkan</span>
                    <span className="font-medium tnum">{f.classes.length}</span>
                  </div>
                  {f.waitlist.length > 0 && (
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-600">Senarai menunggu</span>
                      <span className="font-medium tnum">{f.waitlist.length}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-600">Yuran bulanan</span>
                    <span className="whitespace-nowrap font-medium tnum">{fee ? rm(fee) : '—'}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-600">Yuran pendaftaran</span>
                    <span className="whitespace-nowrap font-medium tnum">{rm(settings.regFee)}</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-gray-200 pt-3 text-base">
                    <span className="font-semibold text-gray-900">Bayaran pertama</span>
                    <span className="whitespace-nowrap font-semibold tnum">{fee ? rm(fee + settings.regFee) : '—'}</span>
                  </div>
                  {belowMin && (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                      Kurang daripada {min} subjek: dikira mengikut kadar setiap subjek. Supervisor boleh menetapkan kadar khas dalam profil pelajar.
                    </p>
                  )}
                  {f.waitlist.length > 0 && (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                      Yuran kelas dalam senarai menunggu hanya dikenakan selepas pelajar dimasukkan ke kelas.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="border-t border-gray-200 p-5">
              {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy ? 'Mendaftar…' : 'Daftar pelajar'}
              </Button>
              <Button onClick={onCancel} variant="ghost" className="mt-2 w-full">
                Batal
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}
