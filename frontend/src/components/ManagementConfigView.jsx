import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { configApi, dashboardApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { useStore } from '../store';
import { can, isApprover } from '../lib/permissions';
import { date, LEVEL_LABEL, rm, STREAM_LABEL, tierGroupLabel } from '../lib/format';
import AccountsPanel from './AccountsPanel';
import ChangeRequestsPanel, { useChangeRequests } from './ChangeRequestsPanel';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, inputClass, Input, PageHeader, Select, Table, Tabs, Td, Th, useToast } from './ui';

export default function ManagementConfigView({ role }) {
  // The page can open on a tab, e.g. from a dashboard notice: #/settings?tab=pricing
  const [tab, setTab] = useState(() => {
    const asked = new URLSearchParams(window.location.hash.split('?')[1]).get('tab');
    if (asked === 'accounts' && can(role, 'accounts.manage')) return asked;
    return ['pricing', 'discounts', 'policies'].includes(asked) && can(role, 'settings.advanced') ? asked : 'subjects';
  });
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
          ...(can(role, 'accounts.manage') ? [{ value: 'accounts', label: 'Pengguna' }] : []),
        ]}
      />
      {tab === 'subjects' && <Subjects role={role} />}
      {tab === 'pricing' && can(role, 'settings.advanced') && <Pricing role={role} />}
      {tab === 'discounts' && can(role, 'settings.advanced') && <Discounts role={role} />}
      {tab === 'accounts' && can(role, 'accounts.manage') && <AccountsPanel />}
      {tab === 'policies' && can(role, 'settings.advanced') && <Policies editable={can(role, 'settings.policies')} />}
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

const FEE_REASON = { name: 'note', label: 'Sebab permohonan', type: 'textarea', required: true, hint: 'Pengurusan akan melihat sebab ini semasa membuat keputusan.' };

// Fee packages change by request: Supervisor asks, Management approves; Management's own changes apply at once.
// The package total always follows the per-subject rate.
function Pricing({ role }) {
  const { pricingTiers, grades, submitChangeRequest } = useStore();
  const { refreshAllData } = useApp();
  const notify = useToast();
  const direct = role === 'MANAGEMENT';
  const editable = can(role, 'settings.pricing');
  const { requests, load } = useChangeRequests('PRICING_TIER');
  // Rate edits by package id; anything not edited shows the saved rate
  const [edits, setEdits] = useState({});
  const [dialog, setDialog] = useState(null); // { type: 'group' | 'save' } | { type: 'package' | 'rename', group } | { type: 'remove', tier }
  const draft = pricingTiers.map((t) => (t.id in edits ? { ...t, rate: edits[t.id] } : t));
  const changed = draft.filter((t) => t.id in edits && t.rate !== pricingTiers.find((x) => x.id === t.id)?.rate);
  const setRate = (id, rate) => setEdits((e) => {
    const next = { ...e };
    if (rate === pricingTiers.find((x) => x.id === id)?.rate) delete next[id]; else next[id] = rate;
    return next;
  });
  const dirty = changed.length > 0;
  const waiting = new Set(requests.filter((r) => r.status === 'PENDING' && r.target_id).map((r) => r.target_id));

  const groups = [...new Set(draft.map((t) => t.category))];
  const gradesOf = (group) => grades.filter((g) => g.fee_group === group).map((g) => g.label);
  const withoutPackage = grades.filter((g) => !g.fee_group || !groups.includes(g.fee_group)).map((g) => g.label);

  // Sends one request per change; each is applied at once for Management or waits for Management's approval
  const send = async (items, note) => {
    let last;
    try {
      for (const item of items) last = await submitChangeRequest({ kind: 'PRICING_TIER', note, ...item });
    } finally {
      await load();
    }
    notify(last?.status === 'PENDING'
      ? `Permohonan dihantar${items.length > 1 ? ` (${items.length})` : ''}. Ia berkuat kuasa selepas diluluskan oleh Pengurusan.`
      : 'Pakej yuran dikemas kini.');
  };
  const reasonIfAsking = direct ? [] : [FEE_REASON];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Pakej yuran bulanan"
          description={direct
            ? 'Kadar seunit subjek; jumlah pakej dikira secara automatik. Permohonan Supervisor menunggu kelulusan anda di bawah.'
            : 'Kadar seunit subjek; jumlah pakej dikira secara automatik. Perubahan berkuat kuasa selepas diluluskan oleh Pengurusan. Pilih kumpulan pada gred di Data induk.'}
          actions={
            editable ? (
              <>
                {dirty && <Button size="sm" variant="ghost" onClick={() => setEdits({})}>Buang perubahan</Button>}
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!dirty}
                  onClick={() => (direct
                    ? send(changed.map((t) => ({ action: 'UPDATE', pk: t.id, values: { price_per_subject: t.rate } }))).then(() => setEdits({})).catch(() => {})
                    : setDialog({ type: 'save' }))}
                >
                  {direct ? 'Simpan' : 'Hantar permohonan'}
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
                <Button size="sm" variant="ghost" disabled={draft.filter((t) => t.category === group).every((t) => waiting.has(t.id))} onClick={() => setDialog({ type: 'rename', group })}><Pencil size={14} /> Nama</Button>
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
                const isWaiting = waiting.has(t.id);
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
                        disabled={!editable || isWaiting}
                        onChange={(e) => setRate(t.id, Number(e.target.value))}
                        className={`${inputClass} max-w-24 tnum`}
                      />
                    </Td>
                    <Td className="text-right font-medium tnum">
                      {rm(t.rate * t.count)}
                      {original && original.rate !== t.rate && <Badge tone="amber" className="ml-2">Diubah</Badge>}
                      {isWaiting && <Badge tone="amber" className="ml-2">Menunggu kelulusan</Badge>}
                    </Td>
                    {editable && (
                      <Td>
                        <IconButton label={`Padam pakej ${t.count} subjek`} icon={Trash2} disabled={isWaiting} onClick={() => setDialog({ type: 'remove', tier: t })} />
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ))}

      {editable && (
        <ChangeRequestsPanel
          title="Permohonan perubahan pakej yuran"
          description={direct ? 'Permohonan Supervisor menunggu kelulusan anda. Perubahan Pengurusan terus berkuat kuasa dan direkod di sini.' : 'Perubahan anda berkuat kuasa selepas diluluskan oleh Pengurusan.'}
          requests={requests}
          reload={load}
          onApplied={refreshAllData}
          editFields={(r) => (r.action === 'DELETE' ? []
            : r.action === 'CREATE' ? [
              { name: 'group_label', label: 'Nama kumpulan', required: true },
              { name: 'subject_count', label: 'Bilangan subjek', type: 'number', min: '1', required: true },
              { name: 'price_per_subject', label: 'Kadar / subjek (RM)', type: 'number', min: '0', step: '0.01', required: true },
            ] : 'group_label' in r.payload
              ? [{ name: 'group_label', label: 'Nama kumpulan', required: true }]
              : [{ name: 'price_per_subject', label: 'Kadar / subjek (RM)', type: 'number', min: '0', step: '0.01', required: true }])}
          editInitial={(r) => {
            const tier = pricingTiers.find((t) => t.id === r.target_id);
            return { ...(tier ? { group_label: tier.label || tierGroupLabel(tier.category, pricingTiers), price_per_subject: tier.rate } : {}), ...r.payload };
          }}
        />
      )}

      {dialog?.type === 'save' && (
        <FormModal
          title="Hantar permohonan kadar baharu"
          description={`${changed.length} pakej akan dimohon: ${changed.map((t) => `${tierGroupLabel(t.category, pricingTiers)} ${t.count} subjek ${rm(t.rate)}`).join(', ')}.`}
          submitLabel="Hantar permohonan"
          fields={[FEE_REASON]}
          onSubmit={({ note }) => send(changed.map((t) => ({ action: 'UPDATE', pk: t.id, values: { price_per_subject: t.rate } })), note).then(() => setEdits({}))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'group' && (
        <FormModal
          title={direct ? 'Kumpulan pakej baharu' : 'Mohon kumpulan pakej baharu'}
          description="Contoh: Darjah 1-4. Masukkan pakej pertama sekarang; pakej lain boleh ditambah kemudian."
          submitLabel={direct ? 'Tambah kumpulan' : 'Hantar permohonan'}
          initial={{ label: '', count: 1, rate: '', note: '' }}
          fields={[
            { name: 'label', label: 'Nama kumpulan', required: true, placeholder: 'cth. Darjah 1-4' },
            { name: 'count', label: 'Bilangan subjek pakej', type: 'number', min: '1', required: true },
            { name: 'rate', label: 'Kadar / subjek (RM)', type: 'number', min: '0', step: '0.01', required: true },
            ...reasonIfAsking,
          ]}
          onSubmit={async (v) => {
            const base = v.label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'KUMPULAN';
            const taken = new Set([...pricingTiers.map((t) => t.category), ...requests.filter((r) => r.status === 'PENDING').map((r) => r.payload.level_category)]);
            let key = base;
            for (let i = 2; taken.has(key); i += 1) key = `${base}_${i}`;
            await send([{ action: 'CREATE', values: { level_category: key, group_label: v.label.trim(), subject_count: Number(v.count), price_per_subject: Number(v.rate) } }], v.note);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'package' && (
        <FormModal
          title={`${direct ? 'Pakej baharu' : 'Mohon pakej baharu'}: ${tierGroupLabel(dialog.group, pricingTiers)}`}
          submitLabel={direct ? 'Tambah pakej' : 'Hantar permohonan'}
          initial={{ count: '', rate: '', note: '' }}
          fields={[
            { name: 'count', label: 'Bilangan subjek', type: 'number', min: '1', required: true },
            { name: 'rate', label: 'Kadar / subjek (RM)', type: 'number', min: '0', step: '0.01', required: true },
            ...reasonIfAsking,
          ]}
          onSubmit={(v) => send([{ action: 'CREATE', values: { level_category: dialog.group, group_label: tierGroupLabel(dialog.group, pricingTiers), subject_count: Number(v.count), price_per_subject: Number(v.rate) } }], v.note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'rename' && (
        <FormModal
          title="Tukar nama kumpulan"
          description="Semua pakej dalam kumpulan ini menggunakan nama baharu."
          submitLabel={direct ? 'Simpan' : 'Hantar permohonan'}
          initial={{ label: tierGroupLabel(dialog.group, pricingTiers), note: '' }}
          fields={[{ name: 'label', label: 'Nama kumpulan', required: true }, ...reasonIfAsking]}
          onSubmit={(v) => {
            const tier = draft.filter((t) => t.category === dialog.group && !waiting.has(t.id)).sort((a, b) => a.count - b.count)[0];
            return send([{ action: 'UPDATE', pk: tier.id, values: { group_label: v.label.trim() } }], v.note);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'remove' && (
        <FormModal
          title={`${direct ? 'Padam' : 'Mohon padam'} pakej ${dialog.tier.count} subjek`}
          description={`${tierGroupLabel(dialog.tier.category, pricingTiers)}. Yuran pelajar dikira mengikut pakej terdekat dalam kumpulan yang sama.`}
          danger
          submitLabel={direct ? 'Padam pakej' : 'Hantar permohonan'}
          fields={reasonIfAsking}
          onSubmit={({ note }) => send([{ action: 'DELETE', pk: dialog.tier.id }], note)}
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
// Discount types and voucher codes change by request: Supervisor asks, Management approves (Management's own apply at once)
function discountFields(adding) {
  return [
    { name: 'name', label: 'Nama diskaun', required: true, hint: 'cth. Adik-beradik, Anak staf, Promosi awal tahun' },
    ...(adding ? [{ name: 'code', label: 'Kod', required: true, hint: 'Kod ringkas tanpa ruang, cth. SIBLING. Tidak boleh diubah selepas dibuat.' }] : []),
    { name: 'mode', label: 'Jenis', type: 'select', required: true, options: [{ value: 'PERCENT', label: 'Peratus (%)' }, { value: 'FIXED', label: 'Amaun tetap (RM)' }] },
    { name: 'value', label: 'Nilai', type: 'number', min: '0', step: '0.01', required: true },
    { name: 'recurring', label: 'Berulang setiap bulan', type: 'checkbox', hint: 'Jika tidak, diskaun dikenakan sekali sahaja.' },
    { name: 'valid_from', label: 'Sah dari', type: 'date' },
    { name: 'valid_until', label: 'Sah hingga', type: 'date' },
    { name: 'max_uses', label: 'Had penggunaan', type: 'number', min: '1', hint: 'Kosongkan jika tiada had.' },
    { name: 'is_active', label: 'Aktif', type: 'checkbox' },
  ];
}

const discountInitial = (d) => ({
  name: d?.label ?? '', code: d?.id ?? '', mode: d?.type ?? 'PERCENT', value: d?.value ?? '', recurring: d?.recurring ?? true,
  valid_from: d?.validFrom ?? '', valid_until: d?.validUntil ?? '', max_uses: d?.maxUses ?? '', is_active: d?.active ?? true, note: '',
});

function Discounts({ role }) {
  const { discounts, students, submitChangeRequest, reload } = useStore();
  const { refreshAllData } = useApp();
  const notify = useToast();
  const direct = role === 'MANAGEMENT';
  const editable = can(role, 'settings.discounts');
  const { requests, load } = useChangeRequests('DISCOUNT');
  const [dialog, setDialog] = useState(null); // { type: 'add' } | { type: 'edit' | 'remove', discount }
  const waiting = new Set(requests.filter((r) => r.status === 'PENDING' && r.target_id).map((r) => r.target_id));
  const usage = (id) => students.filter((x) => ['ACTIVE', 'ON_HOLD'].includes(x.status) && x.discounts?.includes(id)).length;
  const validity = (d) => (d.validFrom || d.validUntil ? `${d.validFrom ? date(d.validFrom) : 'mula'} hingga ${d.validUntil ? date(d.validUntil) : 'tiada had'}` : 'Tiada had tempoh');
  const reasonIfAsking = direct ? [] : [FEE_REASON];

  const send = async (action, pk, values, note) => {
    const done = await submitChangeRequest({ kind: 'DISCOUNT', action, pk, values, note });
    notify(done.status === 'PENDING' ? 'Permohonan dihantar. Ia berkuat kuasa selepas diluluskan oleh Pengurusan.' : 'Diskaun disimpan.');
    await Promise.all([load(), reload('discounts')]);
  };
  // The form sends text; numbers and blanks are tidied before they go
  const tidy = (v) => ({
    ...v, value: Number(v.value), max_uses: v.max_uses ? Number(v.max_uses) : null,
    valid_from: v.valid_from || null, valid_until: v.valid_until || null,
    ...(v.code ? { code: v.code.toUpperCase().replace(/[^A-Z0-9_]+/g, '_') } : {}),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Peraturan diskaun"
          description={`Diskaun tetap ditetapkan pada profil pelajar dan dikenakan dalam setiap larian invois bulanan; diskaun sekali ditolak pada satu invois.${direct ? '' : ' Perubahan berkuat kuasa selepas diluluskan oleh Pengurusan.'}`}
          actions={editable ? <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'add' })}>{direct ? 'Diskaun baharu' : 'Mohon diskaun baharu'}</Button> : <Badge>Hanya supervisor dan pengurusan boleh mengubah</Badge>}
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
                  <Td>{waiting.has(d.pk) ? <Badge tone="amber">Menunggu kelulusan</Badge> : d.active ? <Badge tone="green">Aktif</Badge> : <Badge>Tidak aktif</Badge>}</Td>
                  {editable && (
                    <Td className="whitespace-nowrap">
                      <IconButton label="Ubah" icon={Pencil} disabled={waiting.has(d.pk)} onClick={() => setDialog({ type: 'edit', discount: d })} />
                      <IconButton label="Padam" icon={Trash2} disabled={waiting.has(d.pk)} onClick={() => setDialog({ type: 'remove', discount: d })} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editable && (
        <ChangeRequestsPanel
          title="Permohonan perubahan diskaun"
          description={direct ? 'Permohonan Supervisor menunggu kelulusan anda. Perubahan Pengurusan terus berkuat kuasa dan direkod di sini.' : 'Perubahan anda berkuat kuasa selepas diluluskan oleh Pengurusan.'}
          requests={requests}
          reload={load}
          onApplied={() => Promise.all([refreshAllData(), reload('discounts')])}
          editFields={(r) => (r.action === 'DELETE' ? [] : discountFields(r.action === 'CREATE'))}
          editInitial={(r) => {
            const { note, ...current } = discountInitial(discounts.find((d) => d.pk === r.target_id));
            return { ...current, ...r.payload };
          }}
        />
      )}

      {dialog?.type === 'add' && (
        <FormModal
          title={direct ? 'Diskaun baharu' : 'Mohon diskaun baharu'}
          submitLabel={direct ? 'Simpan' : 'Hantar permohonan'}
          initial={discountInitial()}
          fields={[...discountFields(true), ...reasonIfAsking]}
          onSubmit={({ note, ...v }) => send('CREATE', null, tidy(v), note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'edit' && (
        <FormModal
          title={`Ubah ${dialog.discount.label}`}
          description={`Kod ${dialog.discount.id} tidak boleh diubah.`}
          submitLabel={direct ? 'Simpan' : 'Hantar permohonan'}
          initial={discountInitial(dialog.discount)}
          fields={[...discountFields(false), ...reasonIfAsking]}
          onSubmit={({ note, code, ...v }) => send('UPDATE', dialog.discount.pk, tidy(v), note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'remove' && (
        <FormModal
          title={`${direct ? 'Padam' : 'Mohon padam'} diskaun ${dialog.discount.label}`}
          description="Diskaun yang telah digunakan tidak boleh dipadam; nyahaktifkan sahaja."
          danger
          submitLabel={direct ? 'Padam diskaun' : 'Hantar permohonan'}
          fields={reasonIfAsking}
          onSubmit={({ note }) => send('DELETE', dialog.discount.pk, null, note)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
