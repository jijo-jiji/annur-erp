import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { LEVEL_LABEL, rm, STREAM_LABEL, TIER_CATEGORY_LABEL } from '../lib/format';
import { Badge, Button, Card, CardHeader, inputClass, Input, PageHeader, Select, Table, Tabs, Td, Th, useToast } from './ui';

export default function ManagementConfigView({ role }) {
  const [tab, setTab] = useState('subjects');
  return (
    <>
      <PageHeader title="Tetapan" description="Subjek, pakej yuran dan polisi operasi. Perubahan berkuat kuasa serta-merta." />
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

  const submit = (e) => {
    e.preventDefault();
    if (subjects.some((s) => s.code === f.code)) {
      setError(`Kod ${f.code} sudah digunakan.`);
      return;
    }
    addSubject(f);
    notify(`Subjek ${f.name} ditambah.`);
    setF({ code: '', name: '', level: 'UPPER_SEC', stream: 'TERAS' });
    setError('');
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
                <Td className="hidden sm:table-cell">{LEVEL_LABEL[s.level]}</Td>
                <Td className="hidden md:table-cell">{STREAM_LABEL[s.stream]}</Td>
                <Td className="text-right">
                  {editable ? (
                    <Toggle checked={s.active} label={`Aktifkan ${s.name}`} onChange={(active) => updateSubject(s.code, { active })} />
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
          <Button type="submit" variant="primary" icon={Plus} className="w-full">
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
  const [draft, setDraft] = useState(pricingTiers);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pricingTiers);

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
              onClick={() => {
                saveTiers(draft);
                notify('Pakej yuran dikemas kini.');
              }}
            >
              Simpan
            </Button>
          </>
          ) : (
            <Badge>Hanya pengurusan boleh mengubah</Badge>
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
                <Td className="text-gray-900">{TIER_CATEGORY_LABEL[t.category]}</Td>
                <Td className="tnum">{t.count} subjek</Td>
                <Td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    aria-label={`Kadar ${TIER_CATEGORY_LABEL[t.category]} ${t.count} subjek`}
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
  { key: 'permanentRate', label: 'Kadar asas guru tetap', unit: 'RM / sesi', section: 'teachers' },
  { key: 'replacementRate', label: 'Kadar asas guru ganti', unit: 'RM / sesi', section: 'teachers' },
];

const SECTIONS = [
  { id: 'fees', title: 'Yuran & pembayaran' },
  { id: 'ops', title: 'Operasi kelas' },
  { id: 'teachers', title: 'Elaun guru' },
];

function Policies({ editable }) {
  const { settings, saveSettings } = useStore();
  const notify = useToast();
  const [draft, setDraft] = useState(settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveSettings(draft);
        notify('Polisi dikemas kini.');
      }}
      className="max-w-3xl space-y-6"
    >
      {SECTIONS.map((sec) => (
        <Card key={sec.id}>
          <CardHeader title={sec.title} />
          <div className="divide-y divide-gray-100">
            {POLICY_FIELDS.filter((p) => p.section === sec.id).map((p) => (
              <label key={p.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="text-sm text-gray-800">{p.label}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    required
                    min={p.min ?? 0}
                    max={p.max}
                    step="any"
                    value={draft[p.key]}
                    disabled={!editable}
                    onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                    className={`${inputClass} max-w-24 text-right tnum`}
                  />
                  <span className="w-20 text-[13px] text-gray-500">{p.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>
      ))}
      {!editable && <p className="text-[13px] text-gray-500">Polisi hanya boleh diubah oleh pengurusan.</p>}
      <div className={editable ? 'flex justify-end gap-2' : 'hidden'}>
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(settings)}>
            Buang perubahan
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!dirty}>
          Simpan polisi
        </Button>
      </div>
    </form>
  );
}

function Discounts({ editable }) {
  const { discounts, students, saveDiscounts } = useStore();
  const notify = useToast();
  const [draft, setDraft] = useState(discounts);
  const [newLabel, setNewLabel] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(discounts);
  const usage = (id) => (id === 'SIBLING' ? null : students.filter((s) => s.status === 'ACTIVE' && s.discounts?.includes(id)).length);
  const set = (id, patch) => setDraft(draft.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <Card>
      <CardHeader
        title="Peraturan diskaun"
        description="Dikenakan pada yuran bulanan dalam larian invois bulanan. Diskaun adik-beradik diberi secara automatik kepada setiap anak selain yang sulung."
        actions={
          editable ? (
            <>
              {dirty && (
                <Button size="sm" variant="ghost" onClick={() => setDraft(discounts)}>
                  Buang perubahan
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                disabled={!dirty}
                onClick={() => {
                  saveDiscounts(draft);
                  notify('Peraturan diskaun dikemas kini.');
                }}
              >
                Simpan
              </Button>
            </>
          ) : (
            <Badge>Hanya pengurusan boleh mengubah</Badge>
          )
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Diskaun</Th>
            <Th>Jenis</Th>
            <Th>Nilai</Th>
            <Th className="text-right">Pelajar</Th>
          </tr>
        </thead>
        <tbody>
          {draft.map((d) => (
            <tr key={d.id}>
              <Td>
                <p className="font-medium text-gray-900">{d.label}</p>
                <p className="text-[13px] text-gray-500">{d.auto ? 'Automatik' : 'Ditetapkan pada profil pelajar'}</p>
              </Td>
              <Td>
                <select
                  value={d.type}
                  disabled={!editable}
                  onChange={(e) => set(d.id, { type: e.target.value })}
                  aria-label={`Jenis ${d.label}`}
                  className={`${inputClass} max-w-40`}
                >
                  <option value="PERCENT">Peratus</option>
                  <option value="FIXED">Amaun tetap (RM)</option>
                </select>
              </Td>
              <Td>
                <input
                  type="number"
                  min="0"
                  max={d.type === 'PERCENT' ? 100 : undefined}
                  value={d.value}
                  disabled={!editable}
                  onChange={(e) => set(d.id, { value: Number(e.target.value) })}
                  aria-label={`Nilai ${d.label}`}
                  className={`${inputClass} max-w-24 tnum`}
                />
              </Td>
              <Td className="text-right tnum">{usage(d.id) ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editable && (
        <form
          className="flex flex-wrap gap-2 border-t border-gray-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const id = newLabel.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 16) || `D${draft.length + 1}`;
            setDraft([...draft, { id, label: newLabel, type: 'PERCENT', value: 10, auto: false }]);
            setNewLabel('');
          }}
        >
          <input
            required
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nama diskaun baharu, cth. Pelajar cemerlang"
            aria-label="Nama diskaun baharu"
            className={`${inputClass} max-w-sm`}
          />
          <Button type="submit" icon={Plus}>
            Tambah
          </Button>
        </form>
      )}
    </Card>
  );
}
