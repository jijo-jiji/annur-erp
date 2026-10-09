import { useState } from 'react';
import { Building2, Download, FileText, Plus, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CENTRE } from '../lib/config';
import { useStore } from '../store';
import { voucherTier } from '../lib/domain';
import { ringgit, THRESHOLDS } from '../lib/thresholds';
import { can } from '../lib/permissions';
import { date, rm, todayISO } from '../lib/format';
import { AttachmentList, SignaturePad } from './Attachments';
import { downloadCsv } from '../lib/csv';
import ChangeRequestsPanel, { useChangeRequests } from './ChangeRequestsPanel';
import ExpenseCategories from './ExpenseCategories';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, DescriptionList, EmptyState, Input, Modal, PageHeader, Select, Table, Tabs, Td, Textarea, Th } from './ui';

const tierText = () => ({
  1: `Bawah ${ringgit(THRESHOLDS.voucher_tier1)}: disahkan oleh admin kaunter`,
  2: `${ringgit(THRESHOLDS.voucher_tier1)} hingga ${ringgit(THRESHOLDS.voucher_tier2)}: perlu kelulusan supervisor`,
  3: `Melebihi ${ringgit(THRESHOLDS.voucher_tier2)}: perlu kelulusan pengurusan`,
});
const STATUS = {
  DRAFT: { label: 'Draf', tone: 'neutral' },
  VERIFIED_ADMIN: { label: 'Disahkan kaunter', tone: 'green' },
  PENDING_SUPERVISOR: { label: 'Menunggu supervisor', tone: 'amber' },
  PENDING_MANAGEMENT: { label: 'Menunggu pengurusan', tone: 'amber' },
  APPROVED_SUPERVISOR: { label: 'Diluluskan supervisor', tone: 'green' },
  APPROVED_MANAGEMENT: { label: 'Diluluskan pengurusan', tone: 'green' },
  REJECTED: { label: 'Ditolak', tone: 'red' },
};
const METHODS = {
  ONLINE_TRANSFER: 'Pindahan dalam talian', CASH: 'Tunai', CHEQUE: 'Cek', DUITNOW_QR: 'DuitNow QR', AUTO_DEBIT: 'Auto debit',
};
// Attachments can change until the voucher is approved or rejected
const OPEN = ['DRAFT', 'VERIFIED_ADMIN', 'PENDING_SUPERVISOR', 'PENDING_MANAGEMENT'];

// Who may decide a voucher that is waiting (the server checks this again)
function canDecide(role, v) {
  if (v.rawStatus === 'PENDING_SUPERVISOR') return can(role, 'vouchers.approve.2');
  if (v.rawStatus === 'PENDING_MANAGEMENT') return can(role, 'vouchers.approve.3');
  return false;
}

const VENDOR_REASON = { name: 'note', label: 'Sebab permohonan', type: 'textarea', required: true, hint: 'Pengurusan akan melihat sebab ini semasa membuat keputusan.' };

function vendorFields(editing) {
  return [
    { name: 'vendor_name', label: 'Nama pembekal', required: true },
    { name: 'vendor_id', label: 'No. SSM / ID pembekal', required: true },
    { name: 'tin_number', label: 'No. cukai (TIN)' },
    { name: 'pic_name', label: 'Pegawai dihubungi (PIC)' },
    { name: 'phone_number', label: 'Telefon' },
    { name: 'address', label: 'Alamat', type: 'textarea' },
    { name: 'bank_name', label: 'Bank' },
    { name: 'bank_account', label: 'No. akaun bank' },
    ...(editing ? [{ name: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'ACTIVE', label: 'Aktif' }, { value: 'INACTIVE', label: 'Tidak aktif' }] }] : []),
  ];
}

const vendorInitial = (v = {}) => ({
  vendor_name: v.vendor_name || '', vendor_id: v.vendor_id || '', tin_number: v.tin_number || '', pic_name: v.pic_name || '',
  phone_number: v.phone_number || '', address: v.address || '', bank_name: v.bank_name || '', bank_account: v.bank_account || '',
  status: v.status || 'ACTIVE', note: '',
});

export default function PaymentVoucherView({ role }) {
  const { vouchers, vendors, approveVoucher, rejectVoucher, submitVendor } = useStore();
  const { refreshAllData, showToast } = useApp();
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]).get('tab') ?? 'all');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [vendorDialog, setVendorDialog] = useState(null); // { type: 'add' } | { type: 'edit', vendor }
  const { requests: vendorRequests, load: loadVendorRequests } = useChangeRequests('VENDOR');

  const pending = vouchers.filter((v) => v.status === 'PENDING');
  const rows = tab === 'pending' ? pending : vouchers;
  // Vendor details: Supervisor asks, Management approves (Management's own changes apply at once)
  const canManageVendors = can(role, 'vendors.manage');
  const vendorDirect = role === 'MANAGEMENT';
  const vendorWaiting = new Set(vendorRequests.filter((r) => r.status === 'PENDING' && r.action === 'UPDATE').map((r) => r.target_id));
  const saveVendor = async (action, pk, values, note) => {
    const done = await submitVendor({ action, pk, values, note });
    showToast(done.status === 'PENDING' ? 'Permohonan dihantar. Ia berkuat kuasa selepas diluluskan oleh Pengurusan.' : 'Maklumat pembekal disimpan.');
    await loadVendorRequests();
  };
  const open = viewing && vouchers.find((v) => v.pk === viewing);

  const exportCsv = () => downloadCsv('baucar-bayaran.csv',
    ['No. PV', 'Tarikh', 'Penerima', 'Kategori', 'Subkategori', 'Perkara', 'Kaedah', 'No. rujukan', 'Amaun (RM)', 'Status', 'Disediakan oleh', 'Diluluskan oleh'],
    vouchers.map((v) => [v.no, v.date, v.vendor, v.category, v.subcategory, v.description, METHODS[v.method] || v.method, v.ref, v.amount, STATUS[v.rawStatus]?.label, v.preparedBy, v.approvedBy]));

  return (
    <>
      <PageHeader
        title="Baucar bayaran"
        description="Perbelanjaan pusat dengan had kelulusan tiga peringkat."
        actions={
          <>
            <Button icon={Download} onClick={exportCsv}>Excel</Button>
            {can(role, 'vouchers.create') && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                Baucar baharu
              </Button>
            )}
          </>
        }
      />

      <ol className="mb-6 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
        {[1, 2, 3].map((t) => (
          <li key={t} className="flex gap-3 rounded-md border border-gray-200 bg-white px-4 py-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{t}</span>
            <span className="text-gray-700">{tierText()[t]}</span>
          </li>
        ))}
      </ol>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'all', label: 'Semua baucar', count: vouchers.length },
          { value: 'pending', label: 'Menunggu kelulusan', count: pending.length },
          { value: 'vendors', label: 'Pembekal', count: vendors.length },
          ...(can(role, 'categories.manage') ? [{ value: 'categories', label: 'Kategori' }] : []),
        ]}
      />

      {tab === 'categories' && can(role, 'categories.manage') ? (
        <ExpenseCategories role={role} />
      ) : tab === 'vendors' ? (
        <div className="space-y-6">
        <Card>
          <CardHeader
            title="Pembekal berdaftar"
            description="Baucar hanya boleh dibuat kepada pembekal dalam senarai ini."
            actions={canManageVendors && <Button size="sm" variant="primary" icon={Plus} onClick={() => setVendorDialog({ type: 'add' })}>{vendorDirect ? 'Tambah pembekal' : 'Mohon pembekal baharu'}</Button>}
          />
          {vendors.length === 0 ? <EmptyState icon={Building2} title="Tiada pembekal berdaftar" /> : (
            <Table>
              <thead>
                <tr><Th>Pembekal</Th><Th>No. SSM / ID</Th><Th>No. cukai (TIN)</Th><Th>Telefon</Th><Th>Bank</Th><Th>Status</Th>{canManageVendors && <Th className="text-right"><span className="sr-only">Tindakan</span></Th>}</tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <Td>
                      <p className="font-medium text-gray-900">{v.vendor_name}</p>
                      {v.pic_name && <p className="text-[13px] text-gray-500">PIC: {v.pic_name}</p>}
                    </Td>
                    <Td className="text-gray-700">{v.vendor_id}</Td>
                    <Td className="text-gray-700">{v.tin_number || '—'}</Td>
                    <Td className="whitespace-nowrap text-gray-700">{v.phone_number || '—'}</Td>
                    <Td className="text-gray-700">{[v.bank_name, v.bank_account].filter(Boolean).join(' ') || '—'}</Td>
                    <Td>
                      {vendorWaiting.has(v.id) ? <Badge tone="amber">Menunggu kelulusan</Badge> : <Badge tone={(v.status || 'ACTIVE') === 'ACTIVE' ? 'green' : 'neutral'}>{(v.status || 'ACTIVE') === 'ACTIVE' ? 'Aktif' : 'Tidak aktif'}</Badge>}
                    </Td>
                    {canManageVendors && (
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" disabled={vendorWaiting.has(v.id)} onClick={() => setVendorDialog({ type: 'edit', vendor: v })}>Ubah</Button>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        {canManageVendors && (
          <ChangeRequestsPanel
            title="Permohonan perubahan pembekal"
            description={vendorDirect ? 'Permohonan Supervisor menunggu kelulusan anda. Perubahan Pengurusan terus berkuat kuasa dan direkod di sini.' : 'Perubahan anda berkuat kuasa selepas diluluskan oleh Pengurusan.'}
            requests={vendorRequests}
            reload={loadVendorRequests}
            onApplied={refreshAllData}
            editFields={(r) => vendorFields(r.action === 'UPDATE')}
            editInitial={(r) => ({ ...vendorInitial(vendors.find((v) => v.id === r.target_id)), ...r.payload })}
          />
        )}
        </div>
      ) : (
        <Card>
          {rows.length === 0 ? (
            <EmptyState icon={FileText} title={tab === 'pending' ? 'Tiada baucar menunggu kelulusan' : 'Belum ada baucar'} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>No. PV</Th>
                  <Th>Penerima</Th>
                  <Th className="hidden lg:table-cell">Perkara</Th>
                  <Th className="text-right">Amaun</Th>
                  <Th>Status</Th>
                  <Th className="w-0"><span className="sr-only">Tindakan</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.no} className="hover:bg-gray-50">
                    <Td className="whitespace-nowrap">
                      <p className="font-medium text-gray-900">{v.no}</p>
                      <p className="text-[13px] text-gray-500">{date(v.date)}</p>
                    </Td>
                    <Td>
                      <p className="text-gray-900">{v.vendor}</p>
                      <p className="text-[13px] text-gray-500">{[v.category, v.subcategory].filter(Boolean).join(' · ')}</p>
                    </Td>
                    <Td className="hidden max-w-sm text-gray-700 lg:table-cell">{v.description}</Td>
                    <Td className="text-right font-medium tnum">{rm(v.amount)}</Td>
                    <Td>
                      <Badge tone={STATUS[v.rawStatus]?.tone}>{STATUS[v.rawStatus]?.label ?? v.rawStatus}</Badge>
                      {v.approvedBy && <p className="mt-1 text-xs text-gray-500">oleh {v.approvedBy}</p>}
                      {v.rawStatus === 'REJECTED' && v.comment && <p className="mt-1 max-w-48 text-xs text-gray-500">“{v.comment}”</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        {canDecide(role, v) && (
                          <>
                            <Button size="sm" variant="danger" onClick={() => setRejecting(v)}>Tolak</Button>
                            <Button size="sm" variant="primary" onClick={() => approveVoucher(v.no).catch(() => {})}>Lulus</Button>
                          </>
                        )}
                        <Button size="sm" onClick={() => setViewing(v.pk)}>Lihat</Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={(pv) => { setCreating(false); setViewing(pv.id); }} />}
      {open && <VoucherModal v={open} onClose={() => setViewing(null)} />}
      {rejecting && (
        <FormModal
          title={`Tolak ${rejecting.no}`}
          description={`${rejecting.vendor} · ${rm(rejecting.amount)}`}
          danger
          submitLabel="Tolak baucar"
          fields={[{ name: 'comment', label: 'Sebab penolakan', type: 'textarea', required: true }]}
          onSubmit={(f) => rejectVoucher(rejecting.no, f.comment.trim())}
          onClose={() => setRejecting(null)}
        />
      )}
      {vendorDialog?.type === 'add' && (
        <FormModal
          title={vendorDirect ? 'Tambah pembekal' : 'Mohon pembekal baharu'}
          description={vendorDirect ? 'Pembekal ini boleh digunakan serta-merta.' : 'Pembekal ini boleh digunakan selepas diluluskan oleh Pengurusan.'}
          submitLabel={vendorDirect ? 'Tambah pembekal' : 'Hantar permohonan'}
          initial={vendorInitial()}
          fields={[...vendorFields(false), ...(vendorDirect ? [] : [VENDOR_REASON])]}
          onSubmit={({ note, ...values }) => saveVendor('CREATE', null, values, note)}
          onClose={() => setVendorDialog(null)}
        />
      )}
      {vendorDialog?.type === 'edit' && (
        <FormModal
          title={`Ubah ${vendorDialog.vendor.vendor_name}`}
          description={vendorDirect ? 'Perubahan berkuat kuasa serta-merta.' : 'Perubahan berkuat kuasa selepas diluluskan oleh Pengurusan. Maklumat bank sangat penting, nyatakan sebab dengan jelas.'}
          submitLabel={vendorDirect ? 'Simpan' : 'Hantar permohonan'}
          initial={{ ...vendorInitial(vendorDialog.vendor), note: '' }}
          fields={[...vendorFields(true), ...(vendorDirect ? [] : [VENDOR_REASON])]}
          onSubmit={({ note, ...values }) => saveVendor('UPDATE', vendorDialog.vendor.id, values, note)}
          onClose={() => setVendorDialog(null)}
        />
      )}
    </>
  );
}

function CreateModal({ onClose, onCreated }) {
  const { vendors, addVoucher } = useStore();
  const { getMasterOptions } = useApp();
  // Categories come from master data so budget reports can match them
  const categories = getMasterOptions('18_expense_cat');
  const [f, setF] = useState({ vendorPk: '', category: '', subcategory: '', method: 'ONLINE_TRANSFER', ref: '', amount: '', date: todayISO(), description: '', remarks: '' });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const amount = Number(f.amount);
  const category = categories.find((c) => c.label === f.category);
  const subcategories = getMasterOptions('19_expense_subcat').filter((s) => !category || s.meta?.cat === category.value);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onCreated(await addVoucher({ ...f, vendorPk: Number(f.vendorPk), amount }));
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Baucar bayaran baharu"
      description="No. PV dijana secara automatik. Lampiran boleh ditambah selepas disimpan."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="pv-form" variant="primary" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan baucar'}
          </Button>
        </>
      }
    >
      <form id="pv-form" onSubmit={submit} className="space-y-4">
        <Select label="Penerima bayaran" required value={f.vendorPk} onChange={(e) => set({ vendorPk: e.target.value })} hint="Pembekal baharu ditambah oleh supervisor dalam tab Pembekal.">
          <option value="">Pilih pembekal</option>
          {vendors.filter((v) => (v.status || 'ACTIVE') === 'ACTIVE').map((v) => (
            <option key={v.id} value={v.id}>{v.vendor_name}</option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Kategori" required value={f.category} onChange={(e) => set({ category: e.target.value, subcategory: '' })}>
            <option value="">Pilih kategori</option>
            {categories.map((c) => (
              <option key={c.value} value={c.label}>{c.label}</option>
            ))}
          </Select>
          <Select label="Subkategori" value={f.subcategory} onChange={(e) => set({ subcategory: e.target.value })}>
            <option value="">Tiada</option>
            {subcategories.map((c) => (
              <option key={c.value} value={c.label}>{c.label}</option>
            ))}
          </Select>
          <Select label="Kaedah bayaran" value={f.method} onChange={(e) => set({ method: e.target.value })}>
            {Object.entries(METHODS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Input label="No. rujukan" value={f.ref} onChange={(e) => set({ ref: e.target.value })} />
          <Input label="Tarikh" type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} />
          <Input
            label="Amaun (RM)"
            type="number"
            required
            min="0.01"
            step="0.01"
            value={f.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </div>
        {amount > 0 && <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-700">{tierText()[voucherTier(amount)]}</p>}
        <Textarea label="Perkara / tujuan bayaran" required rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        <Input label="Catatan" value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} />
      </form>
    </Modal>
  );
}

// The printable voucher with its audit trail, attachments and signature
function VoucherModal({ v, onClose }) {
  const editable = OPEN.includes(v.rawStatus);
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Baucar ${v.no}`}
      footer={
        <>
          <Button onClick={onClose}>Tutup</Button>
          <Button variant="primary" icon={Printer} onClick={() => window.print()}>
            Cetak
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="print-area space-y-5 bg-white">
          <div className="flex justify-between gap-4 border-b border-gray-200 pb-4">
            <div>
              <p className="font-semibold text-gray-900">{CENTRE.name}</p>
              <p className="text-[13px] text-gray-500">{CENTRE.address}</p>
              <p className="text-[13px] text-gray-500">Tel: {CENTRE.phone}</p>
              {CENTRE.tin && <p className="text-[13px] text-gray-500">No. TIN: {CENTRE.tin}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-gray-500">Baucar bayaran</p>
              <p className="font-semibold text-gray-900">{v.no}</p>
              <p className="text-[13px] text-gray-500">{date(v.date)}</p>
            </div>
          </div>
          <DescriptionList
            items={[
              ['Dibayar kepada', v.vendor],
              ['No. cukai (TIN)', v.vendorTin || '—'],
              ['Akaun bank penerima', v.vendorBank || '—'],
              ['Kaedah bayaran', `${METHODS[v.method] || v.method}${v.ref ? ` · ${v.ref}` : ''}`],
              ['Kategori', [v.category, v.subcategory].filter(Boolean).join(' · ') || '—'],
              ['Status', STATUS[v.rawStatus]?.label ?? v.rawStatus],
            ]}
          />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2 font-medium">Perkara</th>
                <th className="py-2 text-right font-medium">Amaun</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 text-gray-900">
                  {v.description}
                  {v.remarks && <span className="block text-[13px] text-gray-500">{v.remarks}</span>}
                </td>
                <td className="py-2 text-right tnum">{rm(v.amount)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 font-semibold text-gray-900">Jumlah</td>
                <td className="pt-3 text-right font-semibold tnum">{rm(v.amount)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="grid grid-cols-3 gap-3 text-center text-[13px]">
            {[
              ['Disediakan oleh', v.preparedBy],
              ['Disahkan oleh', v.rawStatus === 'VERIFIED_ADMIN' ? v.preparedBy : null],
              [v.rawStatus === 'REJECTED' ? 'Ditolak oleh' : 'Diluluskan oleh', v.approvedBy],
            ].map(([label, who]) => (
              <div key={label} className="rounded-md border border-gray-200 px-2 py-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 font-medium text-gray-900">{who || '—'}</p>
              </div>
            ))}
          </div>
          {v.rawStatus === 'REJECTED' && v.comment && <p className="text-sm text-red-700">Sebab penolakan: {v.comment}</p>}
        </div>

        <div className="no-print space-y-5">
          <AttachmentList
            kind="VOUCHER"
            objectId={v.pk}
            title="Lampiran (resit, invois pembekal, sebut harga)"
            canUpload={editable}
            canDelete={editable}
            emptyText="Tiada lampiran."
            hint={editable ? `PDF atau gambar, maksimum ${THRESHOLDS.upload_document_mb} MB setiap fail. Lampiran dikunci selepas baucar diluluskan atau ditolak.` : 'Baucar telah diputuskan; lampiran dikunci.'}
          />
          <SignaturePad objectId={v.pk} canSign={v.rawStatus !== 'REJECTED'} />
        </div>
      </div>
    </Modal>
  );
}
