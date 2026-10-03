import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { configApi, dashboardApi } from '../api/client';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { date, LEVEL_LABEL, rm, STREAM_LABEL, TIER_CATEGORY_LABEL } from '../lib/format';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, inputClass, Input, PageHeader, Select, Table, Tabs, Td, Th, useToast } from './ui';

export default function ManagementConfigView({ role }) {
  const [tab, setTab] = useState('subjects');
  return (
    <>
      <PageHeader title="Tetapan" description="Subjek, pakej yuran, diskaun dan polisi operasi. Perubahan berkuat kuasa serta-merta." />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'subjects', label: 'Subjek' },
          { value: 'pricing', label: 'Pakej yuran' },
          { value: 'discounts', label: 'Diskaun' },
          { value: 'policies', label: 'Polisi & elaun' },
        ]}
      />
      {tab === 'subjects' && <Subjects editable={can(role, 'settings.subjects')} />}
      {tab === 'pricing' && <Pricing editable={can(role, 'settings.pricing')} />}
      {tab === 'discounts' && <Discounts editable={can(role, 'settings.discounts')} />}
      {tab === 'policies' && <Policies editable={can(role, 'settings.policies')} />}
    </>
  );
}

function Subjects({ editable }) {
  const { subjects, addSubject, updateSubject } = useStore();
  const notify = useToast();
  const [f, setF] = useState({ code: '', name: '', level: 'UPPER_SEC', stream: 'TERAS' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (subjects.some((s) => s.code === f.code)) {
      setError(`Kod ${f.code} sudah digunakan.`);
      return;
    }
    setBusy(true);
    try {
      await addSubject(f);
      notify(`Subjek ${f.name} ditambah.`);
      setF({ code: '', name: '', level: 'UPPER_SEC', stream: 'TERAS' });
      setError('');
    } catch {
      // the reason has already been shown
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Senarai subjek" description={`${subjects.filter((s) => s.active).length} aktif daripada ${subjects.length}`} />
        <Table>
          <thead>
            <tr>
              <Th>Kod</Th>
              <Th>Nama</Th>
              <Th className="hidden sm:table-cell">Peringkat</Th>
              <Th className="hidden md:table-cell">Aliran</Th>
              <Th className="text-right">Aktif</Th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.code} className={s.active ? '' : 'text-gray-400'}>
                <Td className="font-medium">{s.code}</Td>
                <Td className={s.active ? 'text-gray-900' : ''}>{s.name}</Td>
                <Td className="hidden sm:table-cell">{LEVEL_LABEL[s.level] ?? s.level}</Td>
                <Td className="hidden md:table-cell">{STREAM_LABEL[s.stream] ?? s.stream}</Td>
                <Td className="text-right">
                  {editable ? (
                    <Toggle checked={s.active} label={`Aktifkan ${s.name}`} onChange={(active) => updateSubject(s.code, { active }).catch(() => {})} />
                  ) : s.active ? (
                    <Badge tone="green">Aktif</Badge>
                  ) : (
                    <Badge>Tidak aktif</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {editable && (
      <Card className="self-start">
        <CardHeader title="Tambah subjek" />
        <form onSubmit={submit} className="space-y-4 p-5">
          <Input label="Kod" required maxLength={8} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="cth. EKON" error={error} />
          <Input label="Nama subjek" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="cth. Ekonomi" />
          <Select label="Peringkat" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
            {Object.entries(LEVEL_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select label="Aliran" value={f.stream} onChange={(e) => setF({ ...f, stream: e.target.value })}>
            <option value="TERAS">Teras</option>
            <option value="SAINS">Sains</option>
            <option value="SASTERA">Sastera / Akaun</option>
          </Select>
          <Button type="submit" variant="primary" icon={Plus} className="w-full" disabled={busy}>
            Tambah subjek
          </Button>
        </form>
      </Card>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Pricing({ editable }) {
  const { pricingTiers, saveTiers } = useStore();
  const notify = useToast();
  // Edits by package id; anything not edited shows the saved rate
  const [edits, setEdits] = useState({});
  const draft = pricingTiers.map((t) => (t.id in edits ? { ...t, rate: edits[t.id] } : t));
  const setDraft = (rows) => setEdits(Object.fromEntries(rows.filter((t) => t.rate !== pricingTiers.find((x) => x.id === t.id)?.rate).map((t) => [t.id, t.rate])));
  const dirty = Object.keys(edits).length > 0;

  return (
    <Card>
      <CardHeader
        title="Pakej yuran bulanan"
        description="Kadar seunit subjek. Jumlah pakej dikira secara automatik."
        actions={
          editable ? (
          <>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setDraft(pricingTiers)}>
                Buang perubahan
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty}
              onClick={() => saveTiers(draft).then(() => { setEdits({}); notify('Pakej yuran dikemas kini.'); }).catch(() => {})}
            >
              Simpan
            </Button>
          </>
          ) : (
            <Badge>Hanya supervisor dan pengurusan boleh mengubah</Badge>
          )
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Peringkat</Th>
            <Th>Subjek</Th>
            <Th>Kadar / subjek (RM)</Th>
            <Th className="text-right">Jumlah sebulan</Th>
          </tr>
        </thead>
        <tbody>
          {draft.map((t) => {
            const original = pricingTiers.find((x) => x.id === t.id);
            return (
              <tr key={t.id}>
                <Td className="text-gray-900">{TIER_CATEGORY_LABEL[t.category] ?? t.category}</Td>
                <Td className="tnum">{t.count} subjek</Td>
                <Td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    aria-label={`Kadar ${TIER_CATEGORY_LABEL[t.category] ?? t.category} ${t.count} subjek`}
                    value={t.rate}
                    disabled={!editable}
                    onChange={(e) => setDraft(draft.map((x) => (x.id === t.id ? { ...x, rate: Number(e.target.value) } : x)))}
                    className={`${inputClass} max-w-24 tnum`}
                  />
                </Td>
                <Td className="text-right font-medium tnum">
                  {rm(t.rate * t.count)}
                  {original && original.rate !== t.rate && <Badge tone="amber" className="ml-2">Diubah</Badge>}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

const POLICY_FIELDS = [
  { key: 'regFee', label: 'Yuran pendaftaran', unit: 'RM', section: 'fees' },
  { key: 'dueDay', label: 'Tarikh akhir bayaran bulanan', unit: 'haribulan', section: 'fees', min: 1, max: 28 },
  { key: 'unpaidMonthsLimit', label: 'Tunggakan maksimum sebelum diberhentikan', unit: 'bulan', section: 'fees', min: 1 },
  { key: 'noticeWeeks', label: 'Notis berhenti', unit: 'minggu', section: 'fees', min: 0 },
  { key: 'classCapacity', label: 'Kapasiti maksimum kelas', unit: 'pelajar', section: 'ops', min: 1 },
  { key: 'sessionMinutes', label: 'Tempoh sesi', unit: 'minit', section: 'ops', min: 30 },
];

const SECTIONS = [
  { id: 'fees', title: 'Yuran & pembayaran' },
  { id: 'ops', title: 'Operasi kelas' },
];

function Policies({ editable }) {
  const { settings, saveSettings } = useStore();
  const notify = useToast();
  const [edits, setEdits] = useState({});
  const draft = { ...settings, ...edits };
  // Base allowance per session and yearly increment, by teacher type
  const [rates, setRates] = useState([]);
  const [rateEdits, setRateEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const dirty = Object.keys(edits).length > 0 || Object.keys(rateEdits).length > 0;

  useEffect(() => {
    dashboardApi.getTeacherRates().then(setRates).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveSettings(draft);
      await Promise.all(Object.entries(rateEdits).map(([id, data]) => configApi.updateTeacherRate(id, data)));
      setRates(await dashboardApi.getTeacherRates());
      setEdits({});
      setRateEdits({});
      notify('Polisi dikemas kini.');
    } catch (err) {
      if (err?.message) notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const row = (label, unit, input) => (
    <label key={label} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <span className="text-sm text-gray-800">{label}</span>
      <span className="flex items-center gap-2">
        {input}
        <span className="w-20 text-[13px] text-gray-500">{unit}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      {SECTIONS.map((sec) => (
        <Card key={sec.id}>
          <CardHeader title={sec.title} />
          <div className="divide-y divide-gray-100">
            {POLICY_FIELDS.filter((p) => p.section === sec.id).map((p) => row(p.label, p.unit, (
              <input
                type="number"
                required
                min={p.min ?? 0}
                max={p.max}
                step="any"
                value={draft[p.key]}
                disabled={!editable}
                onChange={(e) => setEdits({ ...edits, [p.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                className={`${inputClass} max-w-24 text-right tnum`}
              />
            )))}
          </div>
        </Card>
      ))}
      <Card>
        <CardHeader title="Elaun guru" description="Kadar asas bagi guru baharu. Kadar setiap guru diubah melalui cadangan kenaikan di halaman Guru." />
        <div className="divide-y divide-gray-100">
          {rates.flatMap((r) => {
            const label = r.teacher_type === 'PERMANENT' ? 'guru tetap' : 'guru ganti';
            const edit = rateEdits[r.id] || {};
            const field = (name, text, unit) => row(`${text} ${label}`, unit, (
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={edit[name] ?? r[name]}
                disabled={!editable}
                onChange={(e) => setRateEdits({ ...rateEdits, [r.id]: { ...edit, [name]: e.target.value } })}
                className={`${inputClass} max-w-24 text-right tnum`}
              />
            ));
            return [field('base_rate_per_session', 'Kadar asas', 'RM / sesi'), field('annual_increment_pct', 'Kenaikan tahunan', '%')];
          })}
        </div>
      </Card>
      {!editable && <p className="text-[13px] text-gray-500">Polisi hanya boleh diubah oleh pengurusan.</p>}
      <div className={editable ? 'flex justify-end gap-2' : 'hidden'}>
        {dirty && (
          <Button variant="ghost" onClick={() => { setEdits({}); setRateEdits({}); }}>
            Buang perubahan
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!dirty || busy}>
          {busy ? 'Menyimpan…' : 'Simpan polisi'}
        </Button>
      </div>
    </form>
  );
}

// Discount rules are set on a student's profile (standing) or on one invoice
function Discounts({ editable }) {
  const { discounts, students, saveDiscount, deleteDiscount } = useStore();
  const notify = useToast();
  const [editing, setEditing] = useState(null); // a discount, or {} for a new one
  const usage = (id) => students.filter((x) => ['ACTIVE', 'ON_HOLD'].includes(x.status) && x.discounts?.includes(id)).length;
  const validity = (d) => (d.validFrom || d.validUntil ? `${d.validFrom ? date(d.validFrom) : 'mula'} hingga ${d.validUntil ? date(d.validUntil) : 'tiada had'}` : 'Tiada had tempoh');

  return (
    <Card>
      <CardHeader
        title="Peraturan diskaun"
        description="Diskaun tetap ditetapkan pada profil pelajar dan dikenakan dalam setiap larian invois bulanan; diskaun sekali ditolak pada satu invois."
        actions={editable ? <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({})}>Diskaun baharu</Button> : <Badge>Hanya supervisor dan pengurusan boleh mengubah</Badge>}
      />
      {discounts.length === 0 ? <EmptyState title="Belum ada peraturan diskaun" /> : (
        <Table>
          <thead>
            <tr>
              <Th>Diskaun</Th>
              <Th>Nilai</Th>
              <Th className="hidden md:table-cell">Tempoh sah</Th>
              <Th className="text-right">Pelajar</Th>
              <Th>Status</Th>
              {editable && <Th className="w-0"><span className="sr-only">Tindakan</span></Th>}
            </tr>
          </thead>
          <tbody>
            {discounts.map((d) => (
              <tr key={d.pk}>
                <Td>
                  <p className="font-medium text-gray-900">{d.label} <span className="font-normal text-gray-400">· {d.id}</span></p>
                  <p className="text-[13px] text-gray-500">{d.recurring ? 'Berulang setiap bulan' : 'Sekali sahaja'}{d.maxUses ? ` · digunakan ${d.used}/${d.maxUses}` : ''}</p>
                </Td>
                <Td className="whitespace-nowrap tnum">{d.type === 'PERCENT' ? `${d.value}%` : rm(d.value)}</Td>
                <Td className="hidden text-gray-700 md:table-cell">{validity(d)}</Td>
                <Td className="text-right tnum">{usage(d.id)}</Td>
                <Td>{d.active ? <Badge tone="green">Aktif</Badge> : <Badge>Tidak aktif</Badge>}</Td>
                {editable && (
                  <Td className="whitespace-nowrap">
                    <IconButton label="Ubah" icon={Pencil} onClick={() => setEditing(d)} />
                    <IconButton
                      label="Padam"
                      icon={Trash2}
                      onClick={() => {
                        if (!window.confirm(`Padam diskaun ${d.label}?`)) return;
                        deleteDiscount(d).then(() => notify('Diskaun dipadam.', 'info')).catch(() => {});
                      }}
                    />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && (
        <FormModal
          title={editing.pk ? `Ubah ${editing.label}` : 'Diskaun baharu'}
          initial={{
            label: editing.label ?? '', id: editing.id ?? '', type: editing.type ?? 'PERCENT', value: editing.value ?? '',
            recurring: editing.recurring ?? true, validFrom: editing.validFrom ?? '', validUntil: editing.validUntil ?? '',
            maxUses: editing.maxUses ?? '', active: editing.active ?? true,
          }}
          fields={[
            { name: 'label', label: 'Nama diskaun', required: true, hint: 'cth. Adik-beradik, Anak staf, Promosi awal tahun' },
            { name: 'id', label: 'Kod', required: true, hint: 'Kod ringkas tanpa ruang, cth. SIBLING' },
            { name: 'type', label: 'Jenis', type: 'select', required: true, options: [{ value: 'PERCENT', label: 'Peratus (%)' }, { value: 'FIXED', label: 'Amaun tetap (RM)' }] },
            { name: 'value', label: 'Nilai', type: 'number', min: '0', step: '0.01', required: true },
            { name: 'recurring', label: 'Berulang setiap bulan', type: 'checkbox', hint: 'Jika tidak, diskaun dikenakan sekali sahaja.' },
            { name: 'validFrom', label: 'Sah dari', type: 'date' },
            { name: 'validUntil', label: 'Sah hingga', type: 'date' },
            { name: 'maxUses', label: 'Had penggunaan', type: 'number', min: '1', hint: 'Kosongkan jika tiada had.' },
            { name: 'active', label: 'Aktif', type: 'checkbox' },
          ]}
          onSubmit={(v) => saveDiscount({ ...v, pk: editing.pk, id: v.id.toUpperCase().replace(/[^A-Z0-9_]+/g, '_'), value: Number(v.value), maxUses: v.maxUses ? Number(v.maxUses) : null })
            .then(() => notify('Diskaun disimpan.'))}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
