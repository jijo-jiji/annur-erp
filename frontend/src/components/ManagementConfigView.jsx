import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { configApi, dashboardApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { useStore } from '../store';
import { can, isApprover } from '../lib/permissions';
import { date, LEVEL_LABEL, rm, STREAM_LABEL, tierGroupLabel } from '../lib/format';
import ChangeRequestsPanel, { useChangeRequests } from './ChangeRequestsPanel';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, inputClass, Input, PageHeader, Select, Table, Tabs, Td, Th, useToast } from './ui';

export default function ManagementConfigView({ role }) {
  const [tab, setTab] = useState('subjects');
  return (
    <>
      <PageHeader
        title="Tetapan"
        description={can(role, 'settings.advanced') ? 'Subjek, pakej yuran, diskaun dan polisi operasi. Perubahan oleh Supervisor dan Pengurusan berkuat kuasa serta-merta.' : 'Cadangkan subjek baharu atau perubahan subjek. Ia berkuat kuasa selepas diluluskan.'}
      />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'subjects', label: 'Subjek' },
          ...(can(role, 'settings.advanced') ? [
            { value: 'pricing', label: 'Pakej yuran' },
            { value: 'discounts', label: 'Diskaun' },
            { value: 'policies', label: 'Polisi & elaun' },
          ] : []),
        ]}
      />
      {tab === 'subjects' && <Subjects role={role} />}
      {tab === 'pricing' && <Pricing editable={can(role, 'settings.pricing')} />}
      {tab === 'discounts' && <Discounts editable={can(role, 'settings.discounts')} />}
      {tab === 'policies' && <Policies editable={can(role, 'settings.policies')} />}
    </>
  );
}

const SUBJECT_LEVELS = Object.entries(LEVEL_LABEL).filter(([k]) => ['PRIMARY', 'LOWER_SEC', 'UPPER_SEC'].includes(k)).map(([value, label]) => ({ value, label }));
const SUBJECT_STREAMS = [{ value: 'TERAS', label: 'Teras' }, { value: 'SAINS', label: 'Sains' }, { value: 'SASTERA', label: 'Sastera / Akaun' }];

// Subjects change by request: Admin proposes and a Supervisor (or Management) approves;
// Supervisor and Management changes apply at once and are recorded in the same list.
function Subjects({ role }) {
  const { subjects, submitSubject } = useStore();
  const { refreshAllData } = useApp();
  const notify = useToast();
  const direct = isApprover(role);
  const { requests, load } = useChangeRequests('SUBJECT');
  const [dialog, setDialog] = useState(null); // { type: 'add' } | { type: 'edit', subject } | { type: 'active', subject }

  const waiting = new Set(requests.filter((r) => r.status === 'PENDING' && r.action === 'UPDATE').map((r) => r.target_id));
  const sentMessage = (done) => (done.status === 'PENDING'
    ? 'Permohonan dihantar. Ia berkuat kuasa selepas diluluskan oleh Supervisor atau Pengurusan.'
    : 'Perubahan subjek disimpan.');

  const submit = async (action, pk, values, note) => {
    const done = await submitSubject({ action, pk, values, note });
    notify(sentMessage(done));
    await load();
  };

  const reasonField = { name: 'note', label: 'Sebab permohonan', type: 'textarea', required: true, hint: 'Supervisor akan melihat sebab ini semasa membuat keputusan.' };
  const levelField = { name: 'level_category', label: 'Peringkat', type: 'select', required: true, options: SUBJECT_LEVELS };
  const streamField = { name: 'stream', label: 'Aliran', type: 'select', required: true, options: SUBJECT_STREAMS };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Senarai subjek"
          description={`${subjects.filter((s) => s.active).length} aktif daripada ${subjects.length}${direct ? '' : '. Perubahan dihantar kepada Supervisor untuk kelulusan.'}`}
          actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'add' })}>{direct ? 'Tambah subjek' : 'Mohon subjek baharu'}</Button>}
        />
        <Table>
          <thead>
            <tr>
              <Th>Kod</Th>
              <Th>Nama</Th>
              <Th className="hidden sm:table-cell">Peringkat</Th>
              <Th className="hidden md:table-cell">Aliran</Th>
              <Th>Status</Th>
              <Th className="text-right"><span className="sr-only">Tindakan</span></Th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.code} className={s.active ? '' : 'text-gray-400'}>
                <Td className="font-medium">{s.code}</Td>
                <Td className={s.active ? 'text-gray-900' : ''}>{s.name}</Td>
                <Td className="hidden sm:table-cell">{LEVEL_LABEL[s.level] ?? s.level}</Td>
                <Td className="hidden md:table-cell">{STREAM_LABEL[s.stream] ?? s.stream}</Td>
                <Td>
                  {waiting.has(s.pk) ? <Badge tone="amber">Menunggu kelulusan</Badge> : s.active ? <Badge tone="green">Aktif</Badge> : <Badge>Tidak aktif</Badge>}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" disabled={waiting.has(s.pk)} onClick={() => setDialog({ type: 'edit', subject: s })}>Ubah</Button>
                    <Button size="sm" variant="ghost" disabled={waiting.has(s.pk)} onClick={() => setDialog({ type: 'active', subject: s })}>
                      {s.active ? 'Nyahaktif' : 'Aktifkan'}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <ChangeRequestsPanel
        description={direct ? 'Permohonan Admin menunggu kelulusan. Perubahan Supervisor dan Pengurusan terus berkuat kuasa dan direkod di sini.' : 'Perubahan anda berkuat kuasa selepas diluluskan oleh Supervisor atau Pengurusan.'}
        requests={requests}
        reload={load}
        onApplied={refreshAllData}
        editFields={(r) => [
          ...(r.action === 'CREATE' ? [{ name: 'code', label: 'Kod', required: true, hint: 'Singkatan tanpa ruang, cth. EKON' }] : []),
          { name: 'name', label: 'Nama subjek', required: true }, levelField, streamField,
          ...(r.action === 'UPDATE' ? [{ name: 'is_active', label: 'Aktif', type: 'checkbox' }] : []),
        ]}
        editInitial={(r) => {
          const current = subjects.find((s) => s.pk === r.target_id);
          return {
            code: '', name: '', level_category: 'UPPER_SEC', stream: 'TERAS', is_active: true,
            ...(current ? { name: current.name, level_category: current.level, stream: current.stream, is_active: current.active } : {}),
            ...r.payload,
          };
        }}
      />

      {dialog?.type === 'add' && (
        <FormModal
          title={direct ? 'Tambah subjek' : 'Mohon subjek baharu'}
          description={direct ? 'Subjek ini boleh digunakan serta-merta.' : 'Subjek ini boleh digunakan selepas diluluskan oleh Supervisor atau Pengurusan.'}
          submitLabel={direct ? 'Tambah subjek' : 'Hantar permohonan'}
          initial={{ code: '', name: '', level_category: 'UPPER_SEC', stream: 'TERAS', note: '' }}
          fields={[
            { name: 'code', label: 'Kod', required: true, hint: 'Singkatan tanpa ruang, cth. EKON' },
            { name: 'name', label: 'Nama subjek', required: true, placeholder: 'cth. Ekonomi' },
            levelField, streamField,
            ...(direct ? [] : [reasonField]),
          ]}
          onSubmit={({ note, ...values }) => submit('CREATE', null, { ...values, code: values.code.toUpperCase().replace(/\s/g, ''), is_active: true }, note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'edit' && (
        <FormModal
          title={`Ubah ${dialog.subject.code}`}
          description="Kod tidak boleh diubah kerana ia digunakan dalam rekod sedia ada."
          submitLabel={direct ? 'Simpan' : 'Hantar permohonan'}
          initial={{ name: dialog.subject.name, level_category: dialog.subject.level, stream: dialog.subject.stream, note: '' }}
          fields={[{ name: 'name', label: 'Nama subjek', required: true }, levelField, streamField, ...(direct ? [] : [reasonField])]}
          onSubmit={({ note, ...values }) => submit('UPDATE', dialog.subject.pk, values, note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'active' && (
        <FormModal
          title={`${dialog.subject.active ? 'Nyahaktifkan' : 'Aktifkan'} ${dialog.subject.name}`}
          description={dialog.subject.active ? 'Subjek yang tidak aktif tidak lagi ditawarkan untuk kelas baharu.' : 'Subjek akan ditawarkan semula untuk kelas baharu.'}
          submitLabel={direct ? 'Teruskan' : 'Hantar permohonan'}
          initial={{ note: '' }}
          fields={direct ? [] : [reasonField]}
          onSubmit={({ note }) => submit('UPDATE', dialog.subject.pk, { is_active: !dialog.subject.active }, note)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function Pricing({ editable }) {
  const { pricingTiers, grades, saveTiers, addTier, deleteTier, renameTierGroup } = useStore();
  const notify = useToast();
  // Edits by package id; anything not edited shows the saved rate
  const [edits, setEdits] = useState({});
  const [dialog, setDialog] = useState(null); // { type: 'group' } | { type: 'package', group } | { type: 'rename', group }
  const draft = pricingTiers.map((t) => (t.id in edits ? { ...t, rate: edits[t.id] } : t));
  const setDraft = (rows) => setEdits(Object.fromEntries(rows.filter((t) => t.rate !== pricingTiers.find((x) => x.id === t.id)?.rate).map((t) => [t.id, t.rate])));
  const dirty = Object.keys(edits).length > 0;

  const groups = [...new Set(draft.map((t) => t.category))];
  const gradesOf = (group) => grades.filter((g) => g.fee_group === group).map((g) => g.label);
  const withoutPackage = grades.filter((g) => !g.fee_group || !groups.includes(g.fee_group)).map((g) => g.label);

  const remove = (t) => {
    if (!window.confirm(`Padam pakej ${t.count} subjek? Yuran dikira mengikut pakej terdekat dalam kumpulan yang sama.`)) return;
    deleteTier(t.id).then(() => notify('Pakej dipadam.')).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Pakej yuran bulanan"
          description="Kadar seunit subjek; jumlah pakej dikira secara automatik. Tambah kumpulan atau pakej baharu bila-bila masa, kemudian pilih kumpulan itu pada gred di Data induk."
          actions={
            editable ? (
              <>
                {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(pricingTiers)}>Buang perubahan</Button>}
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!dirty}
                  onClick={() => saveTiers(draft).then(() => { setEdits({}); notify('Pakej yuran dikemas kini.'); }).catch(() => {})}
                >
                  Simpan
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'group' })}><Plus size={14} /> Kumpulan baharu</Button>
              </>
            ) : (
              <Badge>Hanya supervisor dan pengurusan boleh mengubah</Badge>
            )
          }
        />
        {withoutPackage.length > 0 && (
          <p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-[13px] text-amber-800">
            Gred belum mempunyai pakej, yuran bulanan RM0: {withoutPackage.join(', ')}. Pilih kumpulan pakej pada gred di Data induk.
          </p>
        )}
        {groups.length === 0 && <EmptyState title="Belum ada pakej" description="Tambah kumpulan pakej yuran yang pertama." />}
      </Card>

      {groups.map((group) => (
        <Card key={group}>
          <CardHeader
            title={tierGroupLabel(group, pricingTiers)}
            description={group === 'WALK_IN' ? 'Kadar walk-in sesi' : gradesOf(group).length ? `Digunakan oleh: ${gradesOf(group).join(', ')}` : 'Belum digunakan oleh mana-mana gred'}
            actions={editable && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDialog({ type: 'rename', group })}><Pencil size={14} /> Nama</Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'package', group })}><Plus size={14} /> Pakej</Button>
              </>
            )}
          />
          <Table>
            <thead>
              <tr>
                <Th>Subjek</Th>
                <Th>Kadar / subjek (RM)</Th>
                <Th className="text-right">Jumlah sebulan</Th>
                {editable && <Th className="w-12"><span className="sr-only">Padam</span></Th>}
              </tr>
            </thead>
            <tbody>
              {draft.filter((t) => t.category === group).sort((a, b) => a.count - b.count).map((t) => {
                const original = pricingTiers.find((x) => x.id === t.id);
                return (
                  <tr key={t.id}>
                    <Td className="tnum">{t.count} subjek</Td>
                    <Td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`Kadar ${tierGroupLabel(group, pricingTiers)} ${t.count} subjek`}
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
                    {editable && (
                      <Td>
                        <IconButton label={`Padam pakej ${t.count} subjek`} icon={Trash2} onClick={() => remove(t)} />
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ))}

      {dialog?.type === 'group' && (
        <FormModal
          title="Kumpulan pakej baharu"
          description="Contoh: Darjah 1-4. Masukkan pakej pertama sekarang; pakej lain boleh ditambah kemudian."
          initial={{ label: '', count: 1, rate: '' }}
          fields={[
            { name: 'label', label: 'Nama kumpulan', required: true, placeholder: 'cth. Darjah 1-4' },
            { name: 'count', label: 'Bilangan subjek pakej', type: 'number', min: '1', required: true },
            { name: 'rate', label: 'Kadar / subjek (RM)', type: 'number', min: '0', step: '1', required: true },
          ]}
          onSubmit={async (v) => {
            const base = v.label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'KUMPULAN';
            const taken = new Set(pricingTiers.map((t) => t.category));
            let key = base;
            for (let i = 2; taken.has(key); i += 1) key = `${base}_${i}`;
            await addTier({ group: key, label: v.label.trim(), count: Number(v.count), rate: Number(v.rate) });
            notify('Kumpulan pakej ditambah. Pilih kumpulan ini pada gred di Data induk.');
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'package' && (
        <FormModal
          title={`Pakej baharu: ${tierGroupLabel(dialog.group, pricingTiers)}`}
          initial={{ count: '', rate: '' }}
          fields={[
            { name: 'count', label: 'Bilangan subjek', type: 'number', min: '1', required: true },
            { name: 'rate', label: 'Kadar / subjek (RM)', type: 'number', min: '0', step: '1', required: true },
          ]}
          onSubmit={async (v) => {
            await addTier({ group: dialog.group, label: tierGroupLabel(dialog.group, pricingTiers), count: Number(v.count), rate: Number(v.rate) });
            notify('Pakej ditambah.');
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'rename' && (
        <FormModal
          title="Tukar nama kumpulan"
          initial={{ label: tierGroupLabel(dialog.group, pricingTiers) }}
          fields={[{ name: 'label', label: 'Nama kumpulan', required: true }]}
          onSubmit={async (v) => { await renameTierGroup(dialog.group, v.label.trim()); notify('Nama kumpulan dikemas kini.'); }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
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
