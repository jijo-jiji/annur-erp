import { THRESHOLDS } from '../lib/thresholds';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { authApi, hrApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { date, todayISO } from '../lib/format';
import { AttachmentList, DOC_TYPES, PhotoBox } from './Attachments';
import FormModal from './FormModal';
import { Badge, Button, cx, inputClass, Modal, Table, Td, Th } from './ui';

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
  { id: 'INTERN', label: 'Pelatih / latihan industri' },
];
export const WEEKDAYS = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad'];
export const LEAVE_LABELS = { AL: 'Tahunan (AL)', MC: 'Sakit (MC)', EL: 'Kecemasan (EL)', UL: 'Tanpa gaji (UL)' };

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
const DATE_FIELDS = ['date_of_birth', 'join_date', 'contract_start', 'contract_end'];
const WIDE = ['address', 'skills', 'emergency_address', 'work_days'];
// Text fields that are saved as an empty string rather than null when cleared
const TEXT_FIELDS = ['address', 'skills', 'email', 'emergency_name', 'emergency_phone', 'emergency_relation', 'emergency_email', 'emergency_address', 'ic_number', 'marital_status'];

const hhmm = (t) => (t ? String(t).slice(0, 5) : '—');

function display(field, value, staff) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'marital_status') return staff.marital_status_label || value;
  if (field === 'employment_type') return staff.employment_type_label || value;
  if (field === 'work_start' || field === 'work_end') return hhmm(value);
  if (field === 'work_days') return String(value).split(',').map((d) => WEEKDAYS[Number(d)]).join(', ');
  if (field === 'is_active') return value ? 'Aktif' : 'Tidak aktif';
  if (field === 'user') return staff.username || '—';
  if (DATE_FIELDS.includes(field)) return date(value);
  return String(value);
}

function FieldInput({ field, value, onChange, users }) {
  const set = (v) => onChange(field, v);
  if (field === 'marital_status') return <select value={value || ''} onChange={(e) => set(e.target.value)} className={inputClass}><option value="">—</option>{MARITAL.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>;
  if (field === 'employment_type') return <select value={value} onChange={(e) => set(e.target.value)} className={inputClass}>{EMPLOYMENT.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>;
  if (field === 'is_active') return <select value={value ? '1' : '0'} onChange={(e) => set(e.target.value === '1')} className={inputClass}><option value="1">Aktif</option><option value="0">Tidak aktif</option></select>;
  if (field === 'user') return <select value={value || ''} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)} className={inputClass}><option value="">Tiada akaun</option>{users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}</select>;
  if (field === 'work_days') {
    const days = new Set(String(value || '').split(',').filter(Boolean).map(Number));
    return (
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d, i) => (
          <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-[13px] font-normal">
            <input
              type="checkbox"
              checked={days.has(i)}
              onChange={(e) => {
                const next = new Set(days);
                if (e.target.checked) next.add(i); else next.delete(i);
                set([...next].sort().join(','));
              }}
            />
            {d.slice(0, 3)}
          </label>
        ))}
      </div>
    );
  }
  if (['address', 'skills', 'emergency_address'].includes(field)) return <textarea rows={2} value={value || ''} onChange={(e) => set(e.target.value)} className={inputClass} />;
  const type = DATE_FIELDS.includes(field) ? 'date'
    : ['work_start', 'work_end'].includes(field) ? 'time'
      : ['dependents', 'al_entitlement', 'mc_entitlement', 'el_entitlement'].includes(field) ? 'number' : 'text';
  return <input type={type} min={type === 'number' ? 0 : undefined} value={type === 'time' ? (value ? String(value).slice(0, 5) : '') : (value ?? '')} onChange={(e) => set(e.target.value)} className={inputClass} />;
}

function SectionTitle({ title, action }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {action}
    </div>
  );
}

// A group of profile fields, shown as a list and edited in place
function Section({ title, fields, staff, canEdit, onSave, users, withRemark }) {
  const [form, setForm] = useState(null);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const start = () => { setForm(Object.fromEntries(fields.map((f) => [f, staff[f]]))); setRemark(''); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    // Send only changed fields; blank dates and numbers become null
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== staff[k])
      .map(([k, v]) => [k, v === '' && !TEXT_FIELDS.includes(k) ? null : v]));
    if (withRemark && remark) changed.history_remark = remark;
    if (await onSave(changed)) setForm(null);
    setBusy(false);
  };
  return (
    <section>
      <SectionTitle title={title} action={canEdit && !form && <Button size="sm" icon={Pencil} onClick={start}>Ubah</Button>} />
      {form ? (
        <form onSubmit={submit} className="space-y-3 rounded-md bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f} className={cx('block text-[13px] font-medium text-gray-700', WIDE.includes(f) && 'sm:col-span-2')}>
                {LABELS[f]}
                <div className="mt-1.5"><FieldInput field={f} value={form[f]} users={users} onChange={(k, v) => setForm({ ...form, [k]: v })} /></div>
              </label>
            ))}
          </div>
          {withRemark && (
            <label className="block text-[13px] font-medium text-gray-700">
              Catatan sejarah (cth. sebab kenaikan pangkat)
              <input value={remark} onChange={(e) => setRemark(e.target.value)} className={cx(inputClass, 'mt-1.5')} />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setForm(null)}>Batal</Button>
            <Button size="sm" type="submit" variant="primary" disabled={busy}>Simpan</Button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          {fields.map((f) => (
            <div key={f} className={WIDE.includes(f) ? 'col-span-2' : undefined}>
              <dt className="text-xs font-medium text-gray-500">{LABELS[f]}</dt>
              <dd className="mt-0.5 whitespace-pre-line text-sm text-gray-900">{display(f, staff[f], staff)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function Timeline({ rows, empty }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
      {rows.map((r) => (
        <li key={r.id} className="px-3 py-2.5 text-sm">
          <p className="text-gray-900"><span className="font-medium">{date(r.date)}</span> · {r.change ?? r.description}</p>
          {r.remark && <p className="text-[13px] text-gray-600">{r.remark}</p>}
          <p className="text-xs text-gray-400">{r.recorded_by}</p>
        </li>
      ))}
    </ul>
  );
}

export default function StaffProfileModal({ staffId, role, onClose }) {
  const { staff: allStaff, staffAction, user } = useApp();
  const staff = allStaff.find((s) => s.id === staffId);
  const [history, setHistory] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [dialog, setDialog] = useState(null); // { type, kpi }
  const isManagement = role === 'MANAGEMENT';
  const isApprover = role === 'SUPERVISOR' || isManagement;
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
      return true;
    } catch { return false; }
  };
  // staffAction shows the reason and re-throws, so an open dialog stays open on failure
  const run = (call, message) => staffAction(call, message).then(load);

  const year = new Date().getFullYear();
  const weight = kpis.filter((k) => k.year === year).reduce((a, k) => a + k.weight, 0);

  return (
    <Modal
      open
      side
      size="xl"
      onClose={onClose}
      title={`${staff.name}${staff.is_active ? '' : ' (tidak aktif)'}`}
      description={[staff.staff_id, staff.role, staff.department, staff.employment_type_label].filter(Boolean).join(' · ')}
    >
      <div className="space-y-8">
        <PhotoBox kind="STAFF_PHOTO" objectId={staff.id} name={staff.name} canUpload={isApprover || isOwn} />

        <Section title="Maklumat peribadi" fields={PERSONAL} staff={staff} canEdit={isApprover || isOwn} onSave={save} />
        <Section title="Waris kecemasan" fields={EMERGENCY} staff={staff} canEdit={isApprover || isOwn} onSave={save} />
        <Section title="Maklumat kerja (diisi oleh Pengurusan)" fields={JOB} staff={staff} canEdit={isManagement} onSave={save} users={users} withRemark />

        <section>
          <SectionTitle title={`Cuti ${year}`} />
          <Table>
            <thead><tr><Th>Jenis</Th><Th className="text-right">Layak</Th><Th className="text-right">Diguna</Th><Th className="text-right">Menunggu</Th><Th className="text-right">Baki</Th></tr></thead>
            <tbody>
              {Object.entries(staff.leave_balances || {}).map(([k, v]) => (
                <tr key={k}>
                  <Td className="font-medium text-gray-900">{LEAVE_LABELS[k]}</Td>
                  <Td className="text-right tnum">{v.entitled ?? '—'}</Td>
                  <Td className="text-right tnum">{v.used}</Td>
                  <Td className="text-right tnum">{v.pending || '—'}</Td>
                  <Td className={cx('text-right font-medium tnum', v.balance !== null && v.balance <= 0 && 'text-red-700')}>{v.balance ?? 'Tiada had'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>

        <section>
          <SectionTitle
            title={`KPI${weight > 0 ? ` · pemberat ${year}: ${weight}%` : ''}`}
            action={isApprover && <Button size="sm" icon={Plus} onClick={() => setDialog({ type: 'kpi' })}>Tetapkan KPI</Button>}
          />
          {kpis.length === 0 ? <p className="text-sm text-gray-500">Tiada KPI ditetapkan.</p> : (
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {kpis.map((k) => (
                <li key={k.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-gray-900">{k.year} · {k.title}</p>
                    <Badge>{k.weight}%</Badge>
                  </div>
                  <p className="text-[13px] text-gray-600">Sasaran: {k.target}</p>
                  {k.status === 'REVIEWED' ? (
                    <p className="mt-1 text-[13px] text-brand-800">
                      Pencapaian: {k.achieved || '—'} · skor <span className="font-semibold">{k.score}%</span>{k.review_comment && ` · ${k.review_comment}`}
                      <span className="block text-xs text-gray-400">Disemak oleh {k.reviewed_by} ({k.reviewed_at})</span>
                    </p>
                  ) : isApprover && (
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" onClick={() => setDialog({ type: 'review', kpi: k })}>Semak KPI</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => hrApi.deleteKpi(k.id), 'KPI dipadam.').catch(() => {})}>Padam</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle title="Sejarah kerja" action={isManagement && <Button size="sm" icon={Plus} onClick={() => setDialog({ type: 'history' })}>Tambah</Button>} />
          <Timeline rows={history} empty="Tiada sejarah direkodkan." />
        </section>

        {isApprover && (
          <section>
            <SectionTitle title="Rekod" action={<Button size="sm" icon={Plus} onClick={() => setDialog({ type: 'record' })}>Tambah rekod</Button>} />
            <Timeline rows={records} empty="Tiada rekod." />
          </section>
        )}

        {(isApprover || isOwn) && (
          <div>
            <AttachmentList
              kind="STAFF_DOC"
              objectId={staff.id}
              title="Dokumen sokongan"
              docTypes={DOC_TYPES}
              locked
              canUpload={isApprover || isOwn}
              emptyText="Belum ada dokumen dihantar."
              hint={`IC, resume, surat tawaran dan lain-lain: PDF, gambar atau Word, maksimum ${THRESHOLDS.upload_document_mb} MB. Hanya staf berkenaan, Supervisor dan Pengurusan boleh melihatnya.`}
            />
          </div>
        )}
      </div>

      {dialog?.type === 'history' && (
        <FormModal
          title="Tambah sejarah kerja"
          initial={{ date: todayISO(), change: '', remark: '' }}
          fields={[
            { name: 'date', label: 'Tarikh', type: 'date', required: true },
            { name: 'change', label: 'Perubahan', required: true, hint: 'cth. dilantik Ketua Kaunter' },
            { name: 'remark', label: 'Catatan' },
          ]}
          onSubmit={(v) => run(() => hrApi.addHistory(staff.id, v), 'Sejarah ditambah.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'kpi' && (
        <FormModal
          title="Tetapkan KPI"
          initial={{ year, title: '', target: '', weight: '' }}
          fields={[
            { name: 'title', label: 'KPI', required: true, hint: 'cth. Kutipan yuran' },
            { name: 'target', label: 'Sasaran', required: true, hint: 'cth. 95% dikutip sebelum 7 haribulan' },
            { name: 'year', label: 'Tahun', type: 'number', required: true },
            { name: 'weight', label: 'Pemberat (%)', type: 'number', min: '0', max: '100' },
          ]}
          onSubmit={(v) => run(() => hrApi.addKpi({ ...v, staff: staff.id, year: Number(v.year), weight: Number(v.weight || 0) }), 'KPI ditetapkan.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'review' && (
        <FormModal
          title="Semak KPI"
          description={`${dialog.kpi.title} · sasaran: ${dialog.kpi.target}`}
          submitLabel="Simpan semakan"
          initial={{ achieved: '', score: '', review_comment: '' }}
          fields={[
            { name: 'achieved', label: 'Pencapaian sebenar' },
            { name: 'score', label: 'Skor (%)', type: 'number', min: '0', max: '100', required: true },
            { name: 'review_comment', label: 'Ulasan', type: 'textarea' },
          ]}
          onSubmit={(v) => run(() => hrApi.reviewKpi(dialog.kpi.id, v), 'KPI disemak.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'record' && (
        <FormModal
          title="Tambah rekod"
          initial={{ date: todayISO(), description: '', remark: '' }}
          fields={[
            { name: 'date', label: 'Tarikh', type: 'date', required: true },
            { name: 'description', label: 'Keterangan', type: 'textarea', required: true },
            { name: 'remark', label: 'Catatan' },
          ]}
          onSubmit={(v) => run(() => hrApi.addRecord({ ...v, staff: staff.id }), 'Rekod ditambah.')}
          onClose={() => setDialog(null)}
        />
      )}
    </Modal>
  );
}
