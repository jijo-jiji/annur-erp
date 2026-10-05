import { useState } from 'react';
import { Database, Lock, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { date, tierGroupLabel } from '../lib/format';
import { LEVEL_LABELS, refreshGrades } from '../lib/grades';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, cx, EmptyState, PageHeader, Segmented, Table, Td, Th } from './ui';

const GRADE_CATEGORY = '1_form';

// The drop-down lists used across the system
const CATEGORIES = [
  { id: '1_form', name: 'Tingkatan / darjah' },
  { id: '2_interested_sub', name: 'Subjek diminati' },
  { id: '3_lead_source', name: 'Sumber prospek' },
  { id: '4_student_type', name: 'Jenis pelajar' },
  { id: '5_grade', name: 'Gred & progresi' },
  { id: '6_school', name: 'Sekolah' },
  { id: '7_parent_age', name: 'Umur ibu bapa' },
  { id: '8_active_sub', name: 'Subjek kelas bulanan' },
  { id: '9_walkin_sub', name: 'Subjek kelas walk-in' },
  { id: '10_exam_type', name: 'Jenis peperiksaan' },
  { id: '11_academic_grade', name: 'Tahap akademik' },
  { id: '12_academic_sub', name: 'Subjek peperiksaan' },
  { id: '13_mark_band', name: 'Gred & jalur markah' },
  { id: '14_drop_reason', name: 'Sebab gugur subjek' },
  { id: '15_teacher_type', name: 'Kategori guru' },
  { id: '16_teacher_sub', name: 'Subjek pengajaran guru' },
  { id: '17_teacher_grade', name: 'Gred kelayakan mengajar' },
  { id: '18_expense_cat', name: 'Kategori perbelanjaan' },
  { id: '19_expense_subcat', name: 'Subkategori perbelanjaan' },
  { id: '20_vendor', name: 'Pembekal' },
  { id: '21_payment_method', name: 'Kaedah pembayaran' },
];
const STATUS = {
  APPROVED: { label: 'Aktif', tone: 'green' },
  PENDING: { label: 'Menunggu kelulusan', tone: 'amber' },
  REJECTED: { label: 'Ditolak', tone: 'red' },
};

// Grade entries keep structured details; other lists keep one free-text detail
const gradeMeta = (v) => ({ level: v.level || 'UPPER', order: Number(v.order) || 0, next: v.next || '', fee_group: v.fee_group || '', description: v.description || '' });

function metaText(item, pricingTiers) {
  const m = item.meta_info;
  if (!m || typeof m !== 'object') return '';
  if (item.category === GRADE_CATEGORY) {
    return [LEVEL_LABELS[m.level] || m.level, `susunan ${m.order ?? '—'}`, `seterusnya: ${m.next || 'tamat'}`, m.fee_group ? `pakej: ${tierGroupLabel(m.fee_group, pricingTiers)}` : '', m.description].filter(Boolean).join(' · ');
  }
  return Object.entries(m).map(([k, v]) => (k === 'detail' ? v : `${k}: ${v}`)).join(' · ');
}

// Admin proposes a new value; Supervisor or Management approves it before it appears in any list.
export default function MasterDataView({ role }) {
  const { masterData, proposeMasterData, approveMasterData, rejectMasterData, updateMasterData } = useApp();
  const { reload, pricingTiers, grades: gradeRows } = useStore();
  const canApprove = can(role, 'masterdata.approve');
  const [category, setCategory] = useState(GRADE_CATEGORY);
  const [status, setStatus] = useState('ALL');
  const [dialog, setDialog] = useState(null); // { type: 'add' | 'edit' | 'reject', item }

  const isGrade = category === GRADE_CATEGORY;
  const current = CATEGORIES.find((c) => c.id === category);
  const rows = masterData.filter((i) => i.category === category && (status === 'ALL' || i.status === status));
  const pendingIn = (id) => masterData.filter((i) => i.category === id && i.status === 'PENDING').length;
  const pendingTotal = masterData.filter((i) => i.status === 'PENDING').length;
  const grades = masterData.filter((i) => i.category === GRADE_CATEGORY && i.status === 'APPROVED')
    .sort((a, b) => (a.meta_info?.order ?? 999) - (b.meta_info?.order ?? 999));

  // The grade list feeds every form field, so it is reloaded as soon as it changes
  const gradesChanged = () => { refreshGrades(); reload('grades'); };

  const gradeFields = (exclude) => [
    { name: 'level', label: 'Tahap', type: 'select', required: true, options: Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label })) },
    { name: 'order', label: 'Susunan', type: 'number', min: '0', required: true, hint: '1 = terendah' },
    {
      name: 'next', label: 'Gred seterusnya', type: 'select', placeholder: 'Tiada (gred akhir)', hint: 'Digunakan untuk naik tingkatan pada akhir tahun.',
      options: grades.filter((g) => g.code !== exclude).map((g) => ({ value: g.code, label: `${g.code} · ${g.label}` })),
    },
    {
      name: 'fee_group', label: 'Pakej yuran', type: 'select', placeholder: 'Belum ditetapkan', hint: 'Kumpulan pakej dari Tetapan > Pakej yuran. Tanpa pakej, yuran bulanan ialah RM0.',
      options: [...new Set(pricingTiers.filter((t) => t.category !== 'WALK_IN').map((t) => t.category))].map((g) => ({ value: g, label: tierGroupLabel(g, pricingTiers) })),
    },
    { name: 'description', label: 'Penerangan' },
  ];

  const edit = dialog?.type === 'edit' ? dialog.item : null;

  return (
    <>
      <PageHeader
        title="Data induk"
        description="Senarai pilihan yang digunakan dalam borang. Admin mencadangkan nilai baharu; Supervisor atau Pengurusan meluluskannya sebelum ia boleh digunakan."
        actions={
          <>
            {pendingTotal > 0 && <Badge tone="amber">{pendingTotal} menunggu kelulusan</Badge>}
            <Button variant="primary" icon={Plus} onClick={() => setDialog({ type: 'add' })}>{canApprove ? 'Tambah nilai' : 'Cadang nilai baharu'}</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        <Card className="self-start">
          <nav aria-label="Senarai data induk" className="max-h-[70vh] overflow-y-auto p-2">
            {CATEGORIES.map((c, i) => {
              const pending = pendingIn(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  aria-current={c.id === category ? 'true' : undefined}
                  className={cx(
                    'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                    c.id === category ? 'bg-brand-50 font-medium text-brand-900' : 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <span className="truncate"><span className="text-gray-400 tnum">{i + 1}.</span> {c.name}</span>
                  {pending > 0 && <Badge tone="amber">{pending}</Badge>}
                </button>
              );
            })}
          </nav>
        </Card>

        <Card>
          <CardHeader
            title={current.name}
            description={`${masterData.filter((i) => i.category === category && i.status === 'APPROVED').length} nilai aktif`}
            actions={
              <Segmented
                value={status}
                onChange={setStatus}
                items={[{ value: 'ALL', label: 'Semua' }, { value: 'APPROVED', label: 'Aktif' }, { value: 'PENDING', label: 'Menunggu' }]}
              />
            }
          />
          {rows.length === 0 ? (
            <EmptyState icon={Database} title="Tiada nilai dalam senarai ini" />
          ) : (
            <Table>
              <thead>
                <tr><Th>Kod</Th><Th>Nama paparan</Th><Th className="hidden md:table-cell">Maklumat tambahan</Th><Th className="hidden lg:table-cell">Dicadang</Th><Th>Status</Th><Th className="w-0"><span className="sr-only">Tindakan</span></Th></tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-gray-50">
                    <Td className="whitespace-nowrap font-medium text-gray-900">{item.code}</Td>
                    <Td>
                      <p className="text-gray-900">{item.label}</p>
                      {item.rejection_reason && <p className="text-[13px] text-red-700">Ulasan: {item.rejection_reason}</p>}
                    </Td>
                    <Td className="hidden max-w-xs text-gray-600 md:table-cell">
                      {metaText(item, pricingTiers) || '—'}
                      {item.proposal_note && <p className="text-[13px] text-gray-500">Justifikasi: {item.proposal_note}</p>}
                    </Td>
                    <Td className="hidden whitespace-nowrap text-gray-600 lg:table-cell">
                      {item.created_by || '—'}
                      {item.created_at && <p className="text-[13px] text-gray-400">{date(String(item.created_at).slice(0, 10))}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Badge tone={STATUS[item.status]?.tone}>{STATUS[item.status]?.label ?? item.status}</Badge>
                      {item.approved_by && <p className="mt-1 text-xs text-gray-500">oleh {item.approved_by}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        {item.status === 'PENDING' ? (
                          canApprove ? (
                            <>
                              <Button size="sm" variant="danger" onClick={() => setDialog({ type: 'reject', item })}>Tolak</Button>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => approveMasterData(item.id, role).then(() => { if (item.category === GRADE_CATEGORY) gradesChanged(); }).catch(() => {})}
                              >
                                Luluskan
                              </Button>
                            </>
                          ) : <span className="text-[13px] text-gray-400">Menunggu supervisor</span>
                        ) : canApprove ? (
                          <Button size="sm" onClick={() => setDialog({ type: 'edit', item })}>Ubah</Button>
                        ) : (
                          <span className="flex items-center gap-1 text-[13px] text-gray-400"><Lock className="size-3.5" /> Dikunci</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {dialog?.type === 'add' && (
        <FormModal
          title={canApprove ? 'Tambah nilai' : 'Cadang nilai baharu'}
          description={`${current.name}. ${canApprove ? 'Nilai ini aktif serta-merta.' : 'Nilai ini dihantar untuk kelulusan Supervisor atau Pengurusan sebelum aktif.'}`}
          submitLabel={canApprove ? 'Simpan' : 'Hantar cadangan'}
          initial={{ code: '', label: '', meta: '', comment: '', level: 'UPPER', order: '', next: '', fee_group: '', description: '' }}
          fields={[
            { name: 'code', label: 'Kod', required: true, hint: 'Singkatan tanpa ruang, cth. SRC-IG' },
            { name: 'label', label: 'Nama paparan', required: true },
            ...(isGrade ? gradeFields() : [{ name: 'meta', label: 'Maklumat tambahan', hint: 'cth. kategori sekolah, bajet bulanan' }]),
            { name: 'comment', label: 'Sebab cadangan', type: 'textarea', required: true },
          ]}
          onSubmit={async (v) => {
            await proposeMasterData({
              category, code: v.code.trim().toUpperCase(), label: v.label.trim(),
              meta_info: isGrade ? gradeMeta(v) : (v.meta ? { detail: v.meta } : {}),
              proposal_note: v.comment,
            });
            if (isGrade) gradesChanged();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {edit && (
        <FormModal
          title={`Ubah ${edit.code}`}
          description="Kod tidak boleh diubah kerana ia digunakan dalam rekod sedia ada."
          initial={{
            label: edit.label, meta: edit.meta_info?.detail || '', level: edit.meta_info?.level || 'UPPER', order: edit.meta_info?.order ?? '',
            next: edit.meta_info?.next || '', fee_group: gradeRows.find((g) => g.code === edit.code)?.fee_group || edit.meta_info?.fee_group || '', description: edit.meta_info?.description || '',
          }}
          fields={[
            { name: 'label', label: 'Nama paparan', required: true },
            ...(edit.category === GRADE_CATEGORY ? gradeFields(edit.code) : [{ name: 'meta', label: 'Maklumat tambahan' }]),
          ]}
          onSubmit={async (v) => {
            await updateMasterData(edit.id, {
              label: v.label,
              meta_info: edit.category === GRADE_CATEGORY ? gradeMeta(v) : (v.meta ? { ...(edit.meta_info || {}), detail: v.meta } : edit.meta_info),
            });
            if (edit.category === GRADE_CATEGORY) gradesChanged();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'reject' && (
        <FormModal
          title={`Tolak cadangan ${dialog.item.code}`}
          description={dialog.item.label}
          danger
          submitLabel="Tolak cadangan"
          fields={[{ name: 'reason', label: 'Sebab penolakan', type: 'textarea', required: true }]}
          onSubmit={(v) => rejectMasterData(dialog.item.id, v.reason.trim(), role)}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
