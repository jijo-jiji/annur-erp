import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useStore } from '../store';
import { rm } from '../lib/format';
import ChangeRequestsPanel, { useChangeRequests } from './ChangeRequestsPanel';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, Table, Td, Th } from './ui';

const REASON = { name: 'note', label: 'Sebab permohonan', type: 'textarea', required: true, hint: 'Pengurusan akan melihat sebab ini semasa membuat keputusan.' };
const BUDGET = { name: 'budget', label: 'Bajet bulanan (RM)', type: 'number', min: '0', step: '0.01', required: true };

// Expense categories, subcategories and the monthly budget: Supervisor sets, Management approves
// (Management's own changes apply at once). Admin only picks a category when preparing a voucher.
export default function ExpenseCategories({ role }) {
  const { getMasterOptions, refreshAllData, showToast } = useApp();
  const { submitChangeRequest } = useStore();
  const direct = role === 'MANAGEMENT';
  const catRequests = useChangeRequests('EXPENSE_CATEGORY');
  const subRequests = useChangeRequests('EXPENSE_SUBCATEGORY');
  const [dialog, setDialog] = useState(null); // { type: 'category' } | { type: 'budget', category } | { type: 'sub', category }

  const requests = [...catRequests.requests, ...subRequests.requests].sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)));
  const reload = () => Promise.all([catRequests.load(), subRequests.load()]);
  const categories = getMasterOptions('18_expense_cat');
  const subcategories = getMasterOptions('19_expense_subcat');
  const waiting = new Set(catRequests.requests.filter((r) => r.status === 'PENDING' && r.action === 'UPDATE').map((r) => r.target_id));

  const submit = async (kind, action, pk, values, note) => {
    const done = await submitChangeRequest({ kind, action, pk, values, note });
    showToast(done.status === 'PENDING' ? 'Permohonan dihantar. Ia berkuat kuasa selepas diluluskan oleh Pengurusan.' : 'Perubahan disimpan.');
    await reload();
  };
  const catOptions = categories.map((c) => ({ value: c.value, label: c.label }));
  const reasonIfAsking = direct ? [] : [REASON];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Kategori perbelanjaan"
          description="Kategori, subkategori dan bajet bulanan yang boleh dipilih semasa menyediakan baucar. Nama kategori tidak boleh diubah kerana ia tersimpan pada setiap baucar."
          actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'category' })}>{direct ? 'Tambah kategori' : 'Mohon kategori baharu'}</Button>}
        />
        {categories.length === 0 ? <EmptyState title="Belum ada kategori" /> : (
          <Table>
            <thead>
              <tr><Th>Kategori</Th><Th className="text-right">Bajet bulanan</Th><Th>Subkategori</Th><Th className="text-right"><span className="sr-only">Tindakan</span></Th></tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const subs = subcategories.filter((s) => s.meta?.cat === c.value);
                return (
                  <tr key={c.id}>
                    <Td>
                      <p className="font-medium text-gray-900">{c.label}</p>
                      <p className="text-[13px] text-gray-500">{c.value}</p>
                    </Td>
                    <Td className="text-right tnum">
                      {rm(c.meta?.budget || 0)}
                      {waiting.has(c.id) && <Badge tone="amber" className="ml-2">Menunggu kelulusan</Badge>}
                    </Td>
                    <Td className="text-gray-700">{subs.length ? subs.map((s) => s.label).join(', ') : '—'}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" disabled={waiting.has(c.id)} onClick={() => setDialog({ type: 'budget', category: c })}>Ubah bajet</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ type: 'sub', category: c })}>+ Subkategori</Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ChangeRequestsPanel
        title="Permohonan perubahan kategori"
        description={direct ? 'Permohonan Supervisor menunggu kelulusan anda. Perubahan Pengurusan terus berkuat kuasa dan direkod di sini.' : 'Perubahan anda berkuat kuasa selepas diluluskan oleh Pengurusan.'}
        requests={requests}
        reload={reload}
        onApplied={refreshAllData}
        editFields={(r) => (r.kind === 'EXPENSE_CATEGORY'
          ? [...(r.action === 'CREATE' ? [{ name: 'code', label: 'Kod', required: true }, { name: 'label', label: 'Nama kategori', required: true }] : []), BUDGET]
          : r.action === 'CREATE'
            ? [{ name: 'code', label: 'Kod', required: true }, { name: 'label', label: 'Nama subkategori', required: true }, { name: 'cat', label: 'Kategori', type: 'select', required: true, options: catOptions }]
            : [{ name: 'cat', label: 'Kategori', type: 'select', required: true, options: catOptions }])}
        editInitial={(r) => {
          const current = categories.find((c) => c.id === r.target_id);
          return { code: '', label: '', budget: current?.meta?.budget ?? 0, cat: '', ...r.payload };
        }}
      />

      {dialog?.type === 'category' && (
        <FormModal
          title={direct ? 'Tambah kategori' : 'Mohon kategori baharu'}
          description={direct ? 'Kategori ini boleh digunakan serta-merta.' : 'Kategori ini boleh digunakan selepas diluluskan oleh Pengurusan.'}
          submitLabel={direct ? 'Tambah kategori' : 'Hantar permohonan'}
          initial={{ code: '', label: '', budget: '', note: '' }}
          fields={[
            { name: 'code', label: 'Kod', required: true, hint: 'Huruf besar tanpa ruang, cth. GAJI_STAF' },
            { name: 'label', label: 'Nama kategori', required: true },
            BUDGET, ...reasonIfAsking,
          ]}
          onSubmit={({ note, ...v }) => submit('EXPENSE_CATEGORY', 'CREATE', null, { ...v, budget: Number(v.budget) }, note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'budget' && (
        <FormModal
          title={`Ubah bajet: ${dialog.category.label}`}
          submitLabel={direct ? 'Simpan' : 'Hantar permohonan'}
          initial={{ budget: dialog.category.meta?.budget ?? 0, note: '' }}
          fields={[BUDGET, ...reasonIfAsking]}
          onSubmit={({ note, budget }) => submit('EXPENSE_CATEGORY', 'UPDATE', dialog.category.id, { budget: Number(budget) }, note)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'sub' && (
        <FormModal
          title={`Subkategori baharu: ${dialog.category.label}`}
          submitLabel={direct ? 'Tambah subkategori' : 'Hantar permohonan'}
          initial={{ code: '', label: '', note: '' }}
          fields={[
            { name: 'code', label: 'Kod', required: true, hint: 'Huruf besar tanpa ruang, cth. SUB_KERTAS' },
            { name: 'label', label: 'Nama subkategori', required: true },
            ...reasonIfAsking,
          ]}
          onSubmit={({ note, ...v }) => submit('EXPENSE_SUBCATEGORY', 'CREATE', null, { ...v, cat: dialog.category.value }, note)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
