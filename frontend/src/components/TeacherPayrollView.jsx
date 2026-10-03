import { useCallback, useEffect, useState } from 'react';
import { Calculator, Download, Wallet } from 'lucide-react';
import { downloadPdf, teacherPayApi } from '../api/client';
import { CENTRE } from '../lib/config';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { date, monthLabel, rm, todayISO, waLink } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, DescriptionList, EmptyState, filterClass, Modal, PageHeader, Stat, Table, Td, Th, useToast, WhatsAppIcon } from './ui';

const STATUS_TONE = { DRAFT: 'neutral', VERIFIED: 'blue', APPROVED: 'green', REJECTED: 'red', PAID: 'green' };
const METHODS = [
  { value: 'BANK_TRANSFER', label: 'Pindahan bank' },
  { value: 'CASH', label: 'Tunai' },
  { value: 'CHEQUE', label: 'Cek' },
];
const monthOf = (iso) => monthLabel(iso.slice(0, 7));

const payslipText = (p, sessions) => [
  `Assalamualaikum ${p.teacher_name}, slip gaji ${CENTRE.name} bagi ${monthOf(p.month)}:`,
  `Sesi mengajar: ${p.sessions}`,
  `Jumlah dikira: ${rm(p.calculated_amount)}`,
  Number(p.adjustment) ? `Pelarasan: ${rm(p.adjustment)} (${p.adjustment_note})` : '',
  `Jumlah bayaran: ${rm(p.amount_payable)}`,
  p.status === 'PAID' ? `Dibayar ${date(p.paid_date)} melalui ${p.payment_method_label}${p.payment_reference ? ` (rujukan ${p.payment_reference})` : ''}.` : 'Status: diluluskan, bayaran akan dibuat.',
  sessions.length ? `Butiran: ${sessions.map((s) => `${s.date} ${s.class_code}`).join(', ')}` : '',
  'Terima kasih.',
].filter(Boolean).join('\n');

function Payslip({ payment: p, onClose }) {
  const notify = useToast();
  const [sessions, setSessions] = useState([]);
  useEffect(() => { teacherPayApi.sessions(p.id).then(setSessions).catch(() => setSessions([])); }, [p.id]);
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Slip gaji guru"
      footer={
        <>
          {['APPROVED', 'PAID'].includes(p.status) && p.teacher_phone && (
            <Button as="a" href={waLink(p.teacher_phone, payslipText(p, sessions))} target="_blank" rel="noreferrer">
              <WhatsAppIcon /> Hantar slip
            </Button>
          )}
          <Button
            variant="primary"
            icon={Download}
            onClick={() => downloadPdf(`/teachers/payments/${p.id}/payslip/`, `slip-gaji-${p.teacher_code}-${p.month.slice(0, 7)}.pdf`).catch((err) => notify(err.message, 'error'))}
          >
            Slip PDF
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <p className="font-semibold text-gray-900">{CENTRE.name}</p>
            <p className="text-[13px] text-gray-500">{CENTRE.address}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-gray-500">Slip gaji</p>
            <p className="font-semibold text-gray-900">{monthOf(p.month)}</p>
          </div>
        </div>
        <DescriptionList
          items={[
            ['Guru', `${p.teacher_name} (${p.teacher_code})`],
            ['Kadar semasa / sesi', rm(p.rate_per_session)],
            ['Bank', [p.bank_name, p.bank_account].filter(Boolean).join(' ')],
            ['Status', p.status_label],
            ['Disahkan oleh', p.verified_by],
            ['Diluluskan oleh', p.decided_by],
          ]}
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-2 font-medium">Tarikh</th><th className="py-2 font-medium">Kelas</th><th className="py-2 font-medium">Peranan</th><th className="py-2 text-right font-medium">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 text-gray-600">{date(s.date)}</td>
                <td className="py-2 text-gray-900">{s.class_code}</td>
                <td className="py-2 text-gray-600">{s.role}{s.for_teacher ? ` (${s.for_teacher})` : ''}</td>
                <td className="py-2 text-right tnum">{rm(s.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="pt-3 text-gray-600">Jumlah dikira ({p.sessions} sesi)</td><td className="pt-3 text-right tnum">{rm(p.calculated_amount)}</td></tr>
            {Number(p.adjustment) !== 0 && <tr><td colSpan={3} className="pt-1 text-gray-600">Pelarasan: {p.adjustment_note}</td><td className="pt-1 text-right tnum">{rm(p.adjustment)}</td></tr>}
            <tr><td colSpan={3} className="pt-2 font-semibold text-gray-900">Jumlah bayaran</td><td className="pt-2 text-right font-semibold tnum">{rm(p.amount_payable)}</td></tr>
          </tfoot>
        </table>
        {p.status === 'PAID' && (
          <p className="text-[13px] text-gray-500">
            Dibayar {date(p.paid_date)} · {p.payment_method_label}{p.payment_reference ? ` · ${p.payment_reference}` : ''} · oleh {p.paid_by}
          </p>
        )}
      </div>
    </Modal>
  );
}

// Pay is worked out from teacher attendance. Supervisor checks and verifies; Management approves
// or rejects; then the payment is recorded and the payslip sent.
export default function TeacherPayrollView({ role }) {
  const { teachers } = useStore();
  const notify = useToast();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [teacher, setTeacher] = useState('');
  const [payments, setPayments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // { type, payment }
  const canApprove = can(role, 'payroll.approve');

  // One teacher: full payment history across months; otherwise the chosen month
  const load = useCallback(() => {
    teacherPayApi.payments(teacher ? { teacher } : { month }).then(setPayments).catch(() => setPayments([]));
  }, [month, teacher]);
  useEffect(() => { load(); }, [load]);

  // Runs a server call and reloads; a failure is shown and re-thrown so an open dialog stays open
  const run = async (call, message) => {
    setBusy(true);
    try {
      const res = await call();
      notify(typeof message === 'function' ? message(res) : message);
      load();
      return res;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      notify(detail || err.message || 'Ralat.', 'error');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const totals = payments.reduce((s, p) => ({ sessions: s.sessions + p.sessions, amount: s.amount + Number(p.amount_payable) }), { sessions: 0, amount: 0 });
  const counts = payments.reduce((c, p) => ({ ...c, [p.status]: (c[p.status] || 0) + 1 }), {});
  const p = dialog?.payment;

  const exportCsv = () => downloadCsv(`gaji-guru-${teacher ? 'sejarah' : month}.csv`,
    ['Bulan', 'Kod', 'Guru', 'Sesi', 'Dikira', 'Pelarasan', 'Sebab pelarasan', 'Perlu dibayar', 'Status', 'Disahkan oleh', 'Diluluskan / ditolak oleh', 'Ulasan', 'Tarikh bayar', 'Kaedah', 'Rujukan', 'Catatan'],
    payments.map((x) => [x.month.slice(0, 7), x.teacher_code, x.teacher_name, x.sessions, x.calculated_amount, x.adjustment, x.adjustment_note, x.amount_payable,
      x.status_label, x.verified_by, x.decided_by, x.decision_comment, x.paid_date || '', x.payment_method_label || '', x.payment_reference, x.remarks]));

  return (
    <>
      <PageHeader
        title="Bayaran elaun guru"
        description="Dikira daripada kehadiran guru. Supervisor semak dan sahkan; Pengurusan lulus atau tolak; kemudian rekod bayaran dan hantar slip."
        actions={
          <>
            <input type="month" value={month} disabled={Boolean(teacher)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Bulan" className={filterClass} />
            <select value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="Sejarah guru" className={filterClass}>
              <option value="">Semua guru (bulan dipilih)</option>
              {[...teachers].sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.pk} value={t.pk}>Sejarah: Cikgu {t.name}</option>)}
            </select>
            {!teacher && (
              <Button
                variant="primary"
                icon={Calculator}
                disabled={busy}
                onClick={() => run(() => teacherPayApi.calculate(month), (r) => `Gaji ${monthLabel(month)} dikira: ${r.updated} dikemas kini${r.kept ? `, ${r.kept} sudah disahkan (tidak diubah)` : ''}.`).catch(() => {})}
              >
                Kira daripada kehadiran
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Jumlah bayaran" value={rm(totals.amount)} />
        <Stat label="Jumlah sesi" value={totals.sessions} />
        <Stat label="Menunggu pengesahan" value={counts.DRAFT || 0} />
        <Stat label="Menunggu kelulusan" value={counts.VERIFIED || 0} />
        <Stat label="Telah dibayar" value={counts.PAID || 0} />
      </div>

      <Card>
        <CardHeader
          title={teacher ? 'Sejarah bayaran' : `Bayaran ${monthLabel(month)}`}
          actions={<Button size="sm" icon={Download} onClick={exportCsv}>Excel</Button>}
        />
        {payments.length === 0 ? (
          <EmptyState icon={Wallet} title="Tiada rekod gaji">Rekod kehadiran guru dahulu, kemudian tekan “Kira daripada kehadiran”.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Guru</Th><Th>Bulan</Th><Th className="text-right">Sesi</Th><Th className="text-right">Dikira</Th><Th className="text-right">Pelarasan</Th>
                <Th className="text-right">Perlu dibayar</Th><Th>Status</Th><Th className="w-0"><span className="sr-only">Tindakan</span></Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((x) => (
                <tr key={x.id} className="align-top">
                  <Td className="min-w-44">
                    <p className="font-medium text-gray-900">{x.teacher_name} <span className="font-normal text-gray-400">· {x.teacher_code}</span></p>
                    <p className="text-[13px] text-gray-500">{x.teacher_type === 'REPLACEMENT' ? 'Guru ganti' : 'Guru tetap'}</p>
                  </Td>
                  <Td className="whitespace-nowrap">{monthOf(x.month)}</Td>
                  <Td className="text-right tnum">{x.sessions}</Td>
                  <Td className="text-right tnum">{rm(x.calculated_amount)}</Td>
                  <Td className="text-right tnum">
                    {Number(x.adjustment) ? rm(x.adjustment) : '—'}
                    {Number(x.adjustment) !== 0 && x.adjustment_note && <p className="text-xs text-gray-500">{x.adjustment_note}</p>}
                  </Td>
                  <Td className="text-right font-medium tnum">{rm(x.amount_payable)}</Td>
                  <Td className="min-w-40">
                    <Badge tone={STATUS_TONE[x.status]}>{x.status_label}</Badge>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      {x.verified_by && <p>Disahkan oleh {x.verified_by}</p>}
                      {x.decided_by && <p>{x.status === 'REJECTED' ? 'Ditolak' : 'Diluluskan'} oleh {x.decided_by}</p>}
                      {x.decision_comment && <p>“{x.decision_comment}”</p>}
                      {x.paid_date && <p>Dibayar {date(x.paid_date)}</p>}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      {['DRAFT', 'REJECTED'].includes(x.status) && <Button size="sm" onClick={() => setDialog({ type: 'adjust', payment: x })}>Pelarasan</Button>}
                      {x.status === 'DRAFT' && (
                        <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => teacherPayApi.action(x.id, 'verify'), `Gaji ${x.teacher_name} disahkan.`).catch(() => {})}>Sahkan</Button>
                      )}
                      {x.status === 'VERIFIED' && canApprove && (
                        <>
                          <Button size="sm" variant="danger" onClick={() => setDialog({ type: 'reject', payment: x })}>Tolak</Button>
                          <Button size="sm" variant="primary" onClick={() => setDialog({ type: 'approve', payment: x })}>Lulus</Button>
                        </>
                      )}
                      {x.status === 'APPROVED' && <Button size="sm" variant="primary" onClick={() => setDialog({ type: 'paid', payment: x })}>Rekod bayaran</Button>}
                      <Button size="sm" onClick={() => setDialog({ type: 'payslip', payment: x })}>Slip</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {dialog?.type === 'payslip' && <Payslip payment={p} onClose={() => setDialog(null)} />}
      {dialog?.type === 'adjust' && (
        <FormModal
          title="Pelarasan gaji"
          description={`${p.teacher_name} · dikira ${rm(p.calculated_amount)}`}
          initial={{ adjustment: p.adjustment, adjustment_note: p.adjustment_note, remarks: p.remarks }}
          fields={[
            { name: 'adjustment', label: 'Pelarasan (RM)', type: 'number', step: '0.01', hint: 'Tambah (+) untuk kurang bayar sebelum ini, tolak (−) untuk lebih bayar.' },
            { name: 'adjustment_note', label: 'Sebab pelarasan' },
            { name: 'remarks', label: 'Catatan', type: 'textarea' },
          ]}
          onSubmit={(v) => run(() => teacherPayApi.action(p.id, 'adjust', v), 'Pelarasan disimpan.')}
          onClose={() => setDialog(null)}
        />
      )}
      {['approve', 'reject'].includes(dialog?.type) && (
        <FormModal
          title={dialog.type === 'approve' ? 'Luluskan gaji' : 'Tolak gaji'}
          description={`${p.teacher_name} · ${rm(p.amount_payable)}`}
          danger={dialog.type === 'reject'}
          submitLabel={dialog.type === 'approve' ? 'Luluskan' : 'Tolak'}
          initial={{ comment: '' }}
          fields={[{ name: 'comment', label: dialog.type === 'approve' ? 'Ulasan (pilihan)' : 'Sebab penolakan', type: 'textarea', required: dialog.type === 'reject' }]}
          onSubmit={(v) => run(() => teacherPayApi.action(p.id, dialog.type, v), dialog.type === 'approve' ? 'Gaji diluluskan. Hantar slip melalui WhatsApp.' : 'Gaji ditolak dan dikembalikan kepada supervisor.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'paid' && (
        <FormModal
          title="Rekod bayaran gaji"
          description={`${p.teacher_name} · ${rm(p.amount_payable)} · ${[p.bank_name, p.bank_account].filter(Boolean).join(' ') || 'tiada maklumat bank'}`}
          initial={{ paid_date: todayISO(), payment_method: 'BANK_TRANSFER', payment_reference: '' }}
          fields={[
            { name: 'paid_date', label: 'Tarikh bayar', type: 'date', required: true },
            { name: 'payment_method', label: 'Kaedah', type: 'select', required: true, options: METHODS },
            { name: 'payment_reference', label: 'No. rujukan' },
          ]}
          onSubmit={(v) => run(() => teacherPayApi.action(p.id, 'mark_paid', v), 'Bayaran gaji direkodkan.')}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
