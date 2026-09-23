import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { useStore } from '../store';
import { canApproveVoucher, voucherApprover, voucherTier } from '../lib/domain';
import { can } from '../lib/permissions';
import { date, rm, ROLE_LABEL, todayISO } from '../lib/format';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select, Table, Tabs, Td, Textarea, Th, useToast } from './ui';

const CATEGORIES = ['Alat tulis & modul', 'Penyelenggaraan', 'Utiliti & sewa', 'Elaun tambahan guru', 'Pemasaran', 'Lain-lain'];
const TIER_TEXT = {
  1: 'Bawah RM500 — disahkan oleh admin kaunter',
  2: 'RM500 hingga RM3,000 — perlu kelulusan supervisor',
  3: 'Melebihi RM3,000 — perlu kelulusan pengurusan',
};

export default function PaymentVoucherView({ role }) {
  const { vouchers, updateVoucher } = useStore();
  const notify = useToast();
  const [tab, setTab] = useState('all');
  const [creating, setCreating] = useState(false);

  const pending = vouchers.filter((v) => v.status === 'PENDING');
  const rows = tab === 'pending' ? pending : vouchers;
  const decide = (v, status) => {
    updateVoucher(v.no, { status, approvedBy: ROLE_LABEL[role] });
    notify(`${v.no} ${status === 'APPROVED' ? 'diluluskan' : 'ditolak'}.`, status === 'APPROVED' ? 'success' : 'info');
  };

  return (
    <>
      <PageHeader
        title="Baucar bayaran"
        description="Perbelanjaan pusat dengan had kelulusan tiga peringkat."
        actions={
          can(role, 'vouchers.create') && (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Baucar baharu
            </Button>
          )
        }
      />

      <ol className="mb-6 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
        {[1, 2, 3].map((t) => (
          <li key={t} className="flex gap-3 rounded-md border border-gray-200 bg-white px-4 py-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{t}</span>
            <span className="text-gray-700">{TIER_TEXT[t]}</span>
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
        ]}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="Tiada baucar menunggu kelulusan" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>No. PV</Th>
                <Th>Penerima</Th>
                <Th className="hidden lg:table-cell">Perkara</Th>
                <Th className="text-right">Amaun</Th>
                <Th>Status</Th>
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
                    <p className="text-[13px] text-gray-500">{v.category}</p>
                  </Td>
                  <Td className="hidden max-w-sm text-gray-700 lg:table-cell">{v.description}</Td>
                  <Td className="text-right font-medium tnum">{rm(v.amount)}</Td>
                  <Td className="whitespace-nowrap">
                    {v.status === 'PENDING' ? (
                      canApproveVoucher(role, v.amount) ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="primary" onClick={() => decide(v, 'APPROVED')}>
                            Lulus
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => decide(v, 'REJECTED')}>
                            Tolak
                          </Button>
                        </div>
                      ) : (
                        <Badge tone="amber">Menunggu {voucherApprover(v.amount) === 'SUPERVISOR' ? 'supervisor' : 'pengurusan'}</Badge>
                      )
                    ) : v.status === 'REJECTED' ? (
                      <Badge tone="red">Ditolak</Badge>
                    ) : (
                      <div>
                        <Badge tone="green">{v.status === 'VERIFIED' ? 'Disahkan' : 'Diluluskan'}</Badge>
                        <p className="mt-1 text-xs text-gray-500">oleh {v.approvedBy}</p>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {creating && <CreateModal role={role} onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateModal({ role, onClose }) {
  const { vouchers, addVoucher } = useStore();
  const notify = useToast();
  const [f, setF] = useState({ vendor: '', category: CATEGORIES[0], amount: '', date: todayISO(), description: '' });
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const amount = Number(f.amount);
  const vendors = [...new Set(vouchers.map((v) => v.vendor))];

  const submit = (e) => {
    e.preventDefault();
    const pv = addVoucher({ ...f, amount, preparedBy: ROLE_LABEL[role] });
    notify(pv.status === 'VERIFIED' ? `${pv.no} disimpan dan disahkan.` : `${pv.no} dihantar untuk kelulusan.`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Baucar bayaran baharu"
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="pv-form" variant="primary">
            Simpan baucar
          </Button>
        </>
      }
    >
      <form id="pv-form" onSubmit={submit} className="space-y-4">
        <Input label="Penerima bayaran" required list="pv-vendors" value={f.vendor} onChange={(e) => set({ vendor: e.target.value })} placeholder="Nama syarikat atau individu" />
        <datalist id="pv-vendors">
          {vendors.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Kategori" value={f.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Input label="Tarikh" type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <Input
          label="Amaun (RM)"
          type="number"
          required
          min="0.01"
          step="0.01"
          value={f.amount}
          onChange={(e) => set({ amount: e.target.value })}
          hint={amount > 0 ? TIER_TEXT[voucherTier(amount)] : undefined}
        />
        <Textarea label="Perkara / tujuan bayaran" required rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
      </form>
    </Modal>
  );
}
