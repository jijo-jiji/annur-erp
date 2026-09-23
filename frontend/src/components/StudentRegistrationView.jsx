import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock, Search, UserPlus, Users } from 'lucide-react';
import { FORMS } from '../data/demo';
import { useStore } from '../store';
import { discountsFor, invoiceBalance, isYoungerSibling, minSubjects, monthlyFee, preferredContact, subjectsForForm } from '../lib/domain';
import { CHECKLIST, DAY_LABEL, formLabel, formShort, initials, rm, STREAM_LABEL, STUDENT_STATUS, timeRange, waLink } from '../lib/format';
import { navigate } from '../lib/nav';
import { can } from '../lib/permissions';
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, cx, EmptyState, Input, PageHeader, SearchInput, Segmented, Select, Table, Td, Textarea, Th,
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
  return <StudentList canEdit={canEdit} />;
}

// ---- Directory ----------------------------------------------------------------

function ChecklistSummary({ checklist }) {
  const done = CHECKLIST.filter((c) => checklist[c.key]).length;
  return (
    <div className="flex items-center gap-2" title={CHECKLIST.map((c) => `${c.label}: ${checklist[c.key] ? '✓' : '—'}`).join('\n')}>
      <div className="flex gap-0.5">
        {CHECKLIST.map((c) => (
          <span key={c.key} className={cx('h-1.5 w-3 rounded-sm', checklist[c.key] ? 'bg-brand-500' : 'bg-gray-200')} />
        ))}
      </div>
      <span className={cx('text-xs tnum', done === 5 ? 'text-gray-500' : 'font-medium text-amber-700')}>{done}/5</span>
    </div>
  );
}

function StudentList({ canEdit }) {
  const { students, invoices } = useStore();
  const [q, setQ] = useState('');
  const [form, setForm] = useState('ALL');
  const [status, setStatus] = useState('ACTIVE');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
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
      if (incompleteOnly && Object.values(s.checklist).every(Boolean)) return false;
      if (!needle) return true;
      return [s.name, s.id, s.ic, s.school, s.parent1.name, s.parent1.phone, s.parent2?.phone].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [students, q, form, status, incompleteOnly]);

  const count = (st) => students.filter((s) => s.status === st).length;

  return (
    <>
      <PageHeader
        title="Pelajar"
        description={`${count('ACTIVE')} pelajar aktif bagi sesi 2026`}
        actions={
          canEdit && (
            <Button variant="primary" icon={UserPlus} onClick={() => navigate('students?new')}>
              Daftar pelajar
            </Button>
          )
        }
      />

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
              { value: 'SUSPENDED', label: `Digantung (${count('SUSPENDED')})` },
              { value: 'TERMINATED', label: `Berhenti (${count('TERMINATED')})` },
              { value: 'ALL', label: 'Semua' },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={incompleteOnly} onChange={(e) => setIncompleteOnly(e.target.checked)} className="size-4" />
            Semakan belum lengkap
          </label>
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
                <Th className="hidden lg:table-cell">Semakan</Th>
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
                            {s.status !== 'ACTIVE' && <Badge tone={STUDENT_STATUS[s.status].tone} className="ml-2">{STUDENT_STATUS[s.status].label}</Badge>}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <p className="text-gray-900">{formLabel(s.form)}</p>
                      <p className="text-[13px] text-gray-500">
                        {STREAM_LABEL[s.stream]} · {s.classes.length} subjek
                      </p>
                    </Td>
                    <Td className="hidden text-gray-700 xl:table-cell">{s.school}</Td>
                    <Td className="hidden md:table-cell">
                      <p className="whitespace-nowrap text-gray-900">{contact.name}</p>
                      <p className="text-[13px] text-gray-500">{contact.phone}</p>
                    </Td>
                    <Td className={cx('hidden text-right tnum sm:table-cell', bal ? 'font-medium text-red-700' : 'text-gray-400')}>{bal ? rm(bal) : '—'}</Td>
                    <Td className="hidden lg:table-cell">
                      <ChecklistSummary checklist={s.checklist} />
                    </Td>
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
    </>
  );
}

// ---- Class picker (with waiting list for full classes) -------------------------

export function ClassPicker({ form, value, onChange, waitlist = [], onWaitlistChange }) {
  const { subjects, classes, teachers } = useStore();
  const available = subjectsForForm(subjects, form);
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

  return (
    <div className="divide-y divide-gray-100">
      {available.map((subj) => {
        const options = classes.filter((c) => c.form === form && c.subject === subj.code);
        return (
          <div key={subj.code} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
            <p className="w-44 shrink-0 pt-1.5 text-sm font-medium text-gray-900">{subj.name}</p>
            <div className="flex flex-1 flex-wrap gap-2">
              {options.length === 0 && <span className="pt-1.5 text-[13px] text-gray-400">Tiada kelas dibuka untuk {formShort(form)}</span>}
              {options.map((c) => {
                const selected = value.includes(c.id);
                const waiting = waitlist.includes(c.id);
                const full = c.enrolled >= c.max;
                const seats = c.max - c.enrolled;
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
                        Cikgu {teachers.find((t) => t.code === c.teacher)?.name} ·{' '}
                        {waiting
                          ? `Senarai menunggu (${c.waiting + 1})`
                          : full
                            ? onWaitlistChange
                              ? `Penuh — sertai senarai menunggu`
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

const EMPTY_PARENT = { name: '', phone: '', occupation: '' };

function RegistrationForm({ onCancel, onDone }) {
  const { registerStudent, pricingTiers, settings, students, discounts } = useStore();
  const notify = useToast();
  const [f, setF] = useState({
    name: '', ic: '', form: 'F5', stream: 'SAINS', school: '', phone: '', address: '',
    parent1: { ...EMPTY_PARENT, relation: 'Bapa' },
    parent2: { ...EMPTY_PARENT, relation: 'Ibu' },
    preferred: 1,
    classes: [],
    waitlist: [],
    saps: true,
    terms: false,
  });
  const [error, setError] = useState('');

  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const setParent = (key, patch) => setF((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const min = minSubjects(f.form);
  const fee = monthlyFee(f.form, f.classes.length, pricingTiers);
  // Existing sibling (same father's phone) → sibling discount preview
  const draft = { id: 'NEW', form: f.form, parent1: f.parent1, status: 'ACTIVE', discounts: [] };
  const sibling = f.parent1.phone && students.find((s) => s.parent1.phone === f.parent1.phone && s.status !== 'TERMINATED');
  const disc = fee ? discountsFor(draft, [...students, draft], discounts, fee) : [];
  const discTotal = disc.reduce((a, d) => a + d.amount, 0);

  const submit = (e) => {
    e.preventDefault();
    if (f.classes.length < min) {
      setError(`Sila pilih sekurang-kurangnya ${min} subjek yang mempunyai kerusi kosong untuk ${formLabel(f.form)}.`);
      document.getElementById('pilihan-kelas')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (f.preferred === 2 && !f.parent2.phone) {
      setError('Hubungan utama ialah penjaga 2, tetapi nombor telefonnya kosong.');
      return;
    }
    const { student, invoice } = registerStudent(
      {
        name: f.name, ic: f.ic, form: f.form, stream: f.stream, school: f.school, phone: f.phone, address: f.address,
        parent1: f.parent1, parent2: f.parent2, preferred: f.preferred, classes: f.classes,
      },
      { source: 'KAUNTER', waitlist: f.waitlist },
    );
    notify(
      `${student.name} didaftarkan sebagai ${student.id}. Invois ${invoice.no} (${rm(invoice.total - invoice.discount)}) dijana${f.waitlist.length ? `; ${f.waitlist.length} kelas dalam senarai menunggu` : ''}.`,
    );
    onDone(student.id);
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
              <Input label="Nama sekolah" required value={f.school} onChange={(e) => set({ school: e.target.value })} placeholder="cth. SMK Telipot" />
              <Select
                label="Tingkatan / darjah"
                required
                value={f.form}
                onChange={(e) => {
                  const form = e.target.value;
                  set({ form, classes: [], waitlist: [], stream: form.startsWith('F') && Number(form[1]) >= 4 ? f.stream : 'GENERAL' });
                  setError('');
                }}
              >
                {FORMS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
              <Select label="Aliran" value={f.stream} onChange={(e) => set({ stream: e.target.value })} disabled={!(f.form.startsWith('F') && Number(f.form[1]) >= 4)}>
                <option value="SAINS">Sains</option>
                <option value="SASTERA">Sastera / Akaun</option>
                <option value="GENERAL">Umum</option>
              </Select>
              <Input label="No. telefon pelajar" type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Jika ada" />
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
                    <Input label="Pekerjaan" value={p.occupation} onChange={(e) => setParent(key, { occupation: e.target.value })} />
                  </fieldset>
                );
              })}
            </div>
            {sibling && (
              <p className="border-t border-gray-200 bg-sky-50/60 px-5 py-3 text-[13px] text-sky-900">
                Penjaga ini sudah berdaftar untuk <strong>{sibling.name}</strong> ({sibling.id}).
                {isYoungerSibling(draft, [...students, draft]) ? ' Diskaun adik-beradik akan dikenakan.' : ''}
              </p>
            )}
          </Card>

          <Card id="pilihan-kelas">
            <CardHeader
              title="Pilihan kelas"
              description={
                f.form.startsWith('F')
                  ? 'Minimum 4 subjek. Pilih satu kumpulan bagi setiap subjek; kelas penuh boleh dimasukkan ke senarai menunggu.'
                  : 'Pakej sekolah rendah. Pilih kelas yang dihadiri.'
              }
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
            <CardHeader title="Ringkasan yuran" />
            <div className="space-y-2 p-5 text-sm">
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
              {disc.map((d) => (
                <div key={d.id} className="flex justify-between gap-3">
                  <span className="text-gray-600">{d.label}</span>
                  <span className="whitespace-nowrap font-medium tnum">− {rm(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <span className="text-gray-600">Yuran pendaftaran</span>
                <span className="whitespace-nowrap font-medium tnum">{rm(settings.regFee)}</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-3 text-base">
                <span className="font-semibold text-gray-900">Bayaran pertama</span>
                <span className="whitespace-nowrap font-semibold tnum">{fee ? rm(fee - discTotal + settings.regFee) : '—'}</span>
              </div>
              {f.classes.length < min && <p className="pt-1 text-[13px] text-gray-500">Pilih {min - f.classes.length} lagi subjek untuk melihat yuran.</p>}
              {f.waitlist.length > 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                  Yuran kelas dalam senarai menunggu hanya dikenakan selepas pelajar dimasukkan ke kelas.
                </p>
              )}
            </div>
            <div className="border-t border-gray-200 p-5">
              {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
              <Button type="submit" variant="primary" className="w-full">
                Daftar & jana invois
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
