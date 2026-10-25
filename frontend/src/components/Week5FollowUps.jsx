import { useCallback, useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { billingApi } from '../api/client';
import { bankLine } from '../lib/centre';
import { CENTRE } from '../lib/config';
import { describeError } from '../lib/apiErrors';
import { preferredContact } from '../lib/domain';
import { date, fmtPhone, formLabel, monthLabel, rm, todayISO } from '../lib/format';
import { fillMessage } from '../lib/messages';
import { isApprover } from '../lib/permissions';
import { telLink } from '../lib/phone';
import { useStore } from '../store';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, Segmented, Table, Td, Th, useToast, WhatsAppIcon } from './ui';
import WhatsAppButton from './WhatsAppButton';

// Week 5 (Phase E): monthly fees still unpaid after the counter's reminders in weeks 2 to 4 become tasks for Supervisor
// to contact the parent and record the outcome. The arrears rule (unpaid for the set number of months) comes after.
// The server makes the tasks (backend/billing/followups.py); Admin sees them, Supervisor and Management record them.

const OUTCOMES = [
  ['WILL_PAY', 'Akan bayar minggu ini'],
  ['PROMISED', 'Berjanji bayar pada tarikh'],
  ['PAID_ALREADY', 'Sudah bayar, belum direkod'],
  ['HARDSHIP', 'Masalah kewangan, minta tempoh'],
  ['STOPPING', 'Mahu berhenti'],
  ['NO_ANSWER', 'Tiada jawapan'],
  ['OTHER', 'Lain-lain'],
];
const CHANNELS = [['WHATSAPP', 'WhatsApp'], ['CALL', 'Panggilan telefon'], ['IN_PERSON', 'Bersemuka']];
const OUTCOME_TONE = { WILL_PAY: 'green', PROMISED: 'blue', PAID_ALREADY: 'green', HARDSHIP: 'amber', STOPPING: 'red', NO_ANSWER: 'amber', OTHER: 'neutral' };

export default function Week5FollowUps({ role, limit }) {
  const { students, invoices } = useStore();
  const notify = useToast();
  const [rows, setRows] = useState(null);
  const [view, setView] = useState('OPEN');
  const [recording, setRecording] = useState(null);
  const canRecord = isApprover(role);

  // Fetched again when the invoices change, so a payment recorded meanwhile shows the task as paid
  const load = useCallback(() => billingApi.followUps().then(setRows).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load, invoices]);

  if (rows === null) return null;
  if (rows.length === 0) return null; // nothing has reached week 5: the section stays out of the way
  const open = rows.filter((r) => r.state === 'OPEN');
  const shown = view === 'OPEN' ? open : rows.filter((r) => r.state !== 'OPEN');
  const studentByCode = Object.fromEntries(students.map((s) => [s.id, s]));
  const invoiceByNo = Object.fromEntries(invoices.map((i) => [i.no, i]));

  return (
    <Card role="region" aria-label="Minggu 5: hubungi ibu bapa">
      <CardHeader
        title="Minggu 5: hubungi ibu bapa"
        description={`Yuran bulanan yang masih belum dibayar selepas peringatan minggu 2 hingga 4. ${canRecord ? 'Hubungi ibu bapa dan rekod hasilnya.' : 'Supervisor menghubungi ibu bapa dan merekod hasilnya.'} Selepas ini peraturan tunggakan bulanan terpakai.`}
        actions={
          <Segmented value={view} onChange={setView} items={[
            { value: 'OPEN', label: `Perlu tindakan${open.length ? ` (${open.length})` : ''}` },
            { value: 'DONE', label: 'Selesai' },
          ]} />
        }
      />
      {shown.length === 0 ? (
        <EmptyState title={view === 'OPEN' ? 'Semua yuran minggu 5 sudah disusuli' : 'Belum ada susulan selesai'} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Pelajar</Th><Th>Invois</Th><Th className="text-right">Baki</Th><Th>Hasil</Th><Th className="text-right">Tindakan</Th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit ?? shown.length).map((t) => {
              const s = studentByCode[t.student_code];
              const contact = preferredContact(s);
              const inv = invoiceByNo[t.invoice_number];
              const message = fillMessage('reminder_week5', {
                parent: contact?.name, centre: CENTRE.name, student: t.student_name, balance: rm(t.balance), invoice: t.invoice_number,
                title: inv ? `Yuran ${monthLabel(inv.month)}` : monthLabel(t.billing_month.slice(0, 7)), due_date: date(t.due_date), bank: bankLine(),
              });
              return (
                <tr key={t.id}>
                  <Td>
                    <a href={`#/students/${t.student_code}?tab=fees`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">{t.student_name}</a>
                    <p className="text-[13px] text-gray-500">{formLabel(t.form_level)}{contact ? ` · ${contact.name} ${fmtPhone(contact.phone)}` : ''}</p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <p className="text-gray-900">{t.invoice_number}</p>
                    <p className="text-[13px] text-gray-500">{monthLabel(t.billing_month.slice(0, 7))} · {t.reminders} peringatan kaunter</p>
                  </Td>
                  <Td className={`text-right tnum ${t.state === 'PAID' ? 'text-gray-500' : 'font-medium text-red-700'}`}>{t.state === 'PAID' ? 'Dibayar' : rm(t.balance)}</Td>
                  <Td>
                    {t.state === 'PAID' && <Badge tone="green">Dibayar</Badge>}
                    {t.outcome && (
                      <div className="space-y-0.5">
                        <Badge tone={OUTCOME_TONE[t.outcome]}>{t.outcome_label}{t.promised_date ? `: ${date(t.promised_date)}` : ''}</Badge>
                        <p className="text-xs text-gray-500">{t.channel_label} · {t.contacted_by} · {date(String(t.contacted_at).slice(0, 10))}</p>
                        {t.note && <p className="text-xs text-gray-600">{t.note}</p>}
                      </div>
                    )}
                    {t.state === 'OPEN' && !t.outcome && <Badge tone="amber">Belum dihubungi</Badge>}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {canRecord && t.state !== 'PAID' && (
                      <div className="flex justify-end gap-2">
                        {contact?.phone && (
                          <>
                            <WhatsAppButton size="sm" phone={contact.phone} message={message} recipient={contact.name}><WhatsAppIcon className="size-3.5" /> WhatsApp</WhatsAppButton>
                            <Button as="a" size="sm" href={telLink(contact.phone)} icon={PhoneCall}>Telefon</Button>
                          </>
                        )}
                        <Button size="sm" variant={t.outcome ? 'secondary' : 'primary'} onClick={() => setRecording(t)}>{t.outcome ? 'Kemas kini' : 'Rekod hasil'}</Button>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {recording && (
        <FormModal
          title={`Hasil susulan: ${recording.student_name}`}
          description={`${recording.invoice_number} · baki ${rm(recording.balance)}`}
          submitLabel="Simpan hasil"
          fields={[
            { name: 'channel', label: 'Cara menghubungi', type: 'select', required: true, options: CHANNELS.map(([value, label]) => ({ value, label })) },
            { name: 'outcome', label: 'Hasil', type: 'select', required: true, options: OUTCOMES.map(([value, label]) => ({ value, label })) },
            { name: 'promised_date', label: 'Tarikh dijanjikan', type: 'date', min: todayISO(), hint: 'Jika ibu bapa berjanji membayar pada tarikh tertentu.' },
            { name: 'note', label: 'Catatan', type: 'textarea', hint: 'Wajib jika hasil "Lain-lain".' },
          ]}
          initial={{ channel: recording.channel || 'WHATSAPP', outcome: recording.outcome || '', promised_date: recording.promised_date || '', note: recording.note || '' }}
          onSubmit={async (v) => {
            try {
              await billingApi.recordFollowUp(recording.id, { ...v, promised_date: v.outcome === 'PROMISED' ? v.promised_date : null });
              notify('Hasil susulan direkodkan.');
              await load();
            } catch (err) {
              notify(describeError(err), 'error');
              throw err;
            }
          }}
          onClose={() => setRecording(null)}
        />
      )}
    </Card>
  );
}
