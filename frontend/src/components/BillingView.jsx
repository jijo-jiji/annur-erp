import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Download, FilePlus2, Plus, Printer, Receipt, Search, Tag } from 'lucide-react';
import { CENTRE } from '../lib/config';
import { downloadPdf } from '../api/client';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import {
  addMonths, arrearsCases, invoiceBalance, invoiceStatus, monthlyFee, preferredContact,
} from '../lib/domain';
import {
  CURRENT_MONTH, date, formLabel, monthLabel, PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, rm, TIER_CATEGORY_LABEL, todayISO, waLink,
} from '../lib/format';
import { downloadCsv } from '../lib/csv';
import {
  Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, SearchInput, Segmented, Select, Stat, Table, Tabs, Td, Textarea, Th,
  useToast, WhatsAppIcon,
} from './ui';

const STATUS_BADGE = {
  PAID: <Badge tone="green">Dibayar</Badge>,
  PARTIAL: <Badge tone="amber">Separa</Badge>,
  UNPAID: <Badge tone="red">Belum bayar</Badge>,
  OVERDUE: <Badge tone="red">Tertunggak</Badge>,
};

// What an invoice is for: its month, or its description for other charges (seminar etc.)
export const invoiceTitle = (inv) => (inv.type === 'OTHER' ? inv.description : monthLabel(inv.month));

// Payment follow-up runs through weeks 2-5 of the month; older balances are arrears
const followUpLabel = (inv) => (inv.followUpWeek ? `Minggu ${inv.followUpWeek}` : 'Bulan lepas');

// The wording firms up with the week, and only says "overdue" once the due date has passed
function reminderMessage(inv, contact, studentName) {
  const what = `yuran ${CENTRE.name} bagi ${studentName}: baki ${rm(invoiceBalance(inv))} (invois ${inv.no}, ${invoiceTitle(inv)})`;
  if (inv.status !== 'OVERDUE') {
    return inv.followUpWeek && inv.followUpWeek <= 2
      ? `Assalamualaikum ${contact?.name}, sekadar peringatan mesra ${what}, tarikh akhir ${date(inv.dueDate)}. Abaikan mesej ini jika sudah membuat bayaran. Terima kasih.`
      : `Assalamualaikum ${contact?.name}, peringatan ${what}, tarikh akhir ${date(inv.dueDate)}. Mohon jelaskan bayaran sebelum tarikh akhir. Terima kasih.`;
  }
  return inv.followUpWeek
    ? `Assalamualaikum ${contact?.name}, ${what} masih belum dijelaskan selepas tarikh akhir ${date(inv.dueDate)}. Mohon jelaskan minggu ini atau hubungi kaunter. Terima kasih.`
    : `Assalamualaikum ${contact?.name}, notis tunggakan ${what}. Mohon hubungi kaunter untuk penyelesaian. Terima kasih.`;
}

const PAGE = 50;

function clearPayLink() {
  if (window.location.hash.includes('?')) window.history.replaceState(null, '', '#/billing');
}

export default function BillingView({ role }) {
  const { invoices, receipts, students, settings } = useStore();
  const query = new URLSearchParams(window.location.hash.split('?')[1]);
  const [tab, setTab] = useState(query.get('tab') ?? 'invoices');
  const [status, setStatus] = useState('ALL');
  const [month, setMonth] = useState(() => (invoices.some((i) => i.month === CURRENT_MONTH) ? CURRENT_MONTH : 'ALL'));
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const canRecord = can(role, 'billing.record');
  // Deep link from the dashboard: #/billing?pay=INV-2026-0004
  const [paying, setPaying] = useState(() => {
    const inv = invoices.find((i) => i.no === query.get('pay'));
    return inv && canRecord && invoiceBalance(inv) > 0 ? inv : null;
  });
  const [viewing, setViewing] = useState(null);
  const [calc, setCalc] = useState(false);
  const [running, setRunning] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const [addingOther, setAddingOther] = useState(false);

  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const months = [...new Set(invoices.map((i) => i.month))].sort().reverse();
  const needle = q.trim().toLowerCase();
  const matches = (no, sid) => !needle || `${no} ${studentById[sid]?.name} ${sid}`.toLowerCase().includes(needle);

  const invoiceRows = invoices.filter((i) => {
    if (month !== 'ALL' && i.month !== month) return false;
    const st = invoiceStatus(i);
    if (status === 'UNPAID' && st === 'PAID') return false;
    if (status === 'PAID' && st !== 'PAID') return false;
    return matches(i.no, i.studentId);
  });
  const invoiceByNo = useMemo(() => Object.fromEntries(invoices.map((i) => [i.no, i])), [invoices]);
  const receiptRows = receipts.filter((r) => (month === 'ALL' || r.date.startsWith(month)) && matches(r.no, invoiceByNo[r.invoiceNo]?.studentId));
  const cases = arrearsCases(students, invoices, settings.unpaidMonthsLimit);
  const openInvoices = invoices.filter((i) => invoiceBalance(i) > 0);
  const collectedToday = receipts.filter((r) => r.date === todayISO()).reduce((a, r) => a + r.amount, 0);

  const monthInv = invoices.filter((i) => i.month === CURRENT_MONTH);
  const billed = monthInv.reduce((a, i) => a + i.total - i.discount, 0);
  const collected = monthInv.reduce((a, i) => a + i.paid, 0);
  const outstanding = invoices.reduce((a, i) => a + invoiceBalance(i), 0);

  const rows = tab === 'invoices' ? invoiceRows : receiptRows;

  return (
    <>
      <PageHeader
        title="Yuran & resit"
        description={`Invois bulanan, rekod bayaran dan resit rasmi · ${monthLabel(CURRENT_MONTH)}`}
        actions={
          <>
            <Button icon={Calculator} onClick={() => setCalc(true)}>
              Kalkulator yuran
            </Button>
            {canRecord && (
              <Button icon={Plus} onClick={() => setAddingOther(true)}>
                Invois lain
              </Button>
            )}
            {can(role, 'billing.run') && (
              <Button variant="primary" icon={FilePlus2} onClick={() => setRunning(true)}>
                Jana invois bulanan
              </Button>
            )}
          </>
        }
      />

      <div className={`mb-6 grid grid-cols-1 gap-4 ${can(role, 'finance.summary') ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
        <Stat label="Kutipan hari ini" value={rm(collectedToday)} hint={date(todayISO())} />
        {!can(role, 'finance.summary') && <Stat label="Invois belum selesai" value={openInvoices.length} hint={rm(outstanding)} tone={outstanding ? 'red' : undefined} />}
        {can(role, 'finance.summary') && (
          <>
          <Stat label={`Dibilkan ${monthLabel(CURRENT_MONTH)}`} value={rm(billed)} hint={`${monthInv.length} invois`} />
          <Stat label="Dikutip" value={rm(collected)} hint={`${billed ? Math.round((collected / billed) * 100) : 0}% daripada jumlah dibilkan`} />
          <Stat label="Tertunggak (semua bulan)" value={rm(outstanding)} hint={`${openInvoices.length} invois`} tone={outstanding ? 'red' : undefined} />
          </>
        )}
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setLimit(PAGE);
        }}
        items={[
          { value: 'invoices', label: 'Invois' },
          { value: 'receipts', label: 'Resit' },
          ...(can(role, 'billing.arrears') ? [{ value: 'arrears', label: 'Tunggakan & susulan', count: openInvoices.length }] : []),
        ]}
      />

      {tab === 'arrears' ? (
        <ArrearsPanel cases={cases} role={role} openInvoices={openInvoices} onPay={setPaying} />
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
            <SearchInput icon={Search} value={q} onChange={setQ} placeholder="Cari no. invois / resit atau pelajar" className="w-full sm:w-72" />
            <select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setLimit(PAGE);
              }}
              aria-label="Bulan"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-600 focus:outline-none"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
              <option value="ALL">Semua bulan</option>
            </select>
            {tab === 'invoices' && (
              <Segmented
                value={status}
                onChange={setStatus}
                items={[
                  { value: 'ALL', label: 'Semua' },
                  { value: 'UNPAID', label: 'Belum selesai' },
                  { value: 'PAID', label: 'Dibayar' },
                ]}
              />
            )}
            <span className="ml-auto text-sm text-gray-500">{rows.length} rekod</span>
            <Button
              size="sm"
              icon={Download}
              onClick={() => (tab === 'invoices'
                ? downloadCsv(`invois-${month}.csv`, ['Invois', 'Untuk', 'Pelajar', 'ID', 'Jumlah', 'Diskaun', 'Dibayar', 'Baki', 'Status', 'Tarikh akhir'],
                  invoiceRows.map((i) => [i.no, invoiceTitle(i), studentById[i.studentId]?.name, i.studentId, i.total - i.discount, i.discount, i.paid, invoiceBalance(i), invoiceStatus(i), i.dueDate]))
                : downloadCsv(`resit-${month}.csv`, ['Resit', 'Tarikh', 'Pelajar', 'Invois', 'Jenis', 'Bulan', 'Kaedah', 'Rujukan', 'Amaun', 'Lebihan', 'Diterima oleh', 'Catatan'],
                  receiptRows.map((r) => [r.no, r.date, r.studentName, r.invoiceNo, PAYMENT_TYPE_LABEL[r.type], r.month, PAYMENT_METHOD_LABEL[r.method], r.ref, r.amount, r.overpaid, r.by, r.notes])))}
            >
              CSV
            </Button>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={Receipt} title={tab === 'invoices' ? 'Tiada invois' : 'Tiada resit'} />
          ) : tab === 'invoices' ? (
            <Table>
              <thead>
                <tr>
                  <Th>Invois</Th>
                  <Th>Pelajar</Th>
                  <Th className="text-right">Jumlah</Th>
                  <Th className="hidden text-right md:table-cell">Baki</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Tindakan</Th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.slice(0, limit).map((inv) => {
                  const s = studentById[inv.studentId];
                  const st = invoiceStatus(inv);
                  const receipt = inv.receipt && receipts.find((r) => r.no === inv.receipt);
                  return (
                    <tr key={inv.no} className="hover:bg-gray-50">
                      <Td className="whitespace-nowrap">
                        <p className="font-medium text-gray-900">{inv.no}</p>
                        <p className="text-[13px] text-gray-500">{invoiceTitle(inv)}</p>
                      </Td>
                      <Td>
                        <a href={`#/students/${s?.id}?tab=fees`} className="text-gray-900 hover:text-brand-700 hover:underline">
                          {s?.name}
                        </a>
                        <p className="text-[13px] text-gray-500">{formLabel(s?.form)}</p>
                      </Td>
                      <Td className="text-right tnum">
                        {rm(inv.total - inv.discount)}
                        {inv.discount > 0 && <p className="text-xs text-gray-500">diskaun {rm(inv.discount)}</p>}
                        {inv.creditApplied > 0 && <p className="text-xs text-gray-500">kredit {rm(inv.creditApplied)}</p>}
                      </Td>
                      <Td className="hidden text-right tnum md:table-cell">{invoiceBalance(inv) ? rm(invoiceBalance(inv)) : '—'}</Td>
                      <Td>{STATUS_BADGE[st]}</Td>
                      <Td className="whitespace-nowrap text-right">
                        {st !== 'PAID'
                          ? canRecord && (
                              <div className="flex justify-end gap-2">
                                <Button size="sm" icon={Tag} onClick={() => setAdjusting(inv)} title="Kod baucar atau kredit pelajar">
                                  Diskaun
                                </Button>
                                <Button size="sm" variant="primary" onClick={() => setPaying(inv)}>
                                  Rekod bayaran
                                </Button>
                              </div>
                            )
                          : receipt && (
                              <Button size="sm" onClick={() => setViewing(receipt)}>
                                Lihat resit
                              </Button>
                            )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Resit</Th>
                  <Th>Pelajar</Th>
                  <Th className="hidden md:table-cell">Kaedah</Th>
                  <Th className="text-right">Amaun</Th>
                  <Th className="text-right">Tindakan</Th>
                </tr>
              </thead>
              <tbody>
                {receiptRows.slice(0, limit).map((r) => {
                  const s = studentById[invoiceByNo[r.invoiceNo]?.studentId];
                  return (
                    <tr key={r.no} className="hover:bg-gray-50">
                      <Td className="whitespace-nowrap">
                        <p className="font-medium text-gray-900">{r.no}</p>
                        <p className="text-[13px] text-gray-500">{date(r.date)}</p>
                      </Td>
                      <Td>
                        <p className="text-gray-900">{s?.name ?? r.studentName}</p>
                        <p className="text-[13px] text-gray-500">{r.invoiceNo} · {PAYMENT_TYPE_LABEL[r.type]}{r.month ? ` ${monthLabel(r.month)}` : ''}</p>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <p className="text-gray-900">{PAYMENT_METHOD_LABEL[r.method]}</p>
                        {r.ref && <p className="text-[13px] text-gray-500">{r.ref}</p>}
                      </Td>
                      <Td className="text-right font-medium tnum">{rm(r.amount)}</Td>
                      <Td className="text-right">
                        <Button size="sm" onClick={() => setViewing(r)}>
                          Lihat
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {rows.length > limit && (
            <div className="border-t border-gray-200 p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Tunjuk {Math.min(PAGE, rows.length - limit)} lagi ({rows.length - limit} baki)
              </Button>
            </div>
          )}
        </Card>
      )}

      {paying && (
        <PaymentModal
          invoice={paying}
          role={role}
          onClose={() => {
            setPaying(null);
            clearPayLink();
          }}
          onPaid={(receipt) => {
            setPaying(null);
            clearPayLink();
            setViewing(receipt);
          }}
        />
      )}
      <ReceiptModal receipt={viewing} onClose={() => setViewing(null)} hideActions={!canRecord} />
      <CalculatorModal open={calc} onClose={() => setCalc(false)} />
      {running && <MonthlyRunModal onClose={() => setRunning(false)} onDone={(m) => { setMonth(m); setTab('invoices'); setRunning(false); }} />}
      {adjusting && <InvoiceAdjustModal invoice={adjusting} onClose={() => setAdjusting(null)} />}
      {addingOther && <OtherInvoiceModal onClose={() => setAddingOther(false)} />}
    </>
  );
}

// ---- Arrears (unpaid-months rule) --------------------------------------------

function ArrearsPanel({ cases, role, openInvoices, onPay }) {
  const { settings, students, warnArrears, studentAction, invoiceAction } = useStore();
  const notify = useToast();
  const studentById = Object.fromEntries(students.map((x) => [x.id, x]));
  const today = todayISO();
  const daysLate = (inv) => Math.max(0, Math.round((new Date(today) - new Date(inv.dueDate)) / 86400000));
  const open = [...openInvoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="space-y-6">
      {cases.length > 0 && (
        <Card>
          <div className="flex items-start gap-3 border-b border-gray-200 bg-amber-50/60 px-5 py-3.5 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Polisi: pelajar yang tertunggak yuran <strong>{settings.unpaidMonthsLimit} bulan</strong> tanpa makluman boleh diberhentikan. Hantar amaran
              terlebih dahulu.
            </p>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Pelajar</Th>
                <Th>Bulan tertunggak</Th>
                <Th className="text-right">Jumlah</Th>
                <Th>Status</Th>
                <Th className="text-right">Tindakan</Th>
              </tr>
            </thead>
            <tbody>
              {cases.map(({ student: s, overdue, amount }) => {
                const contact = preferredContact(s);
                const warned = overdue.map((i) => i.lastReminder).filter(Boolean).sort().pop();
                const msg = `Assalamualaikum ${contact.name}. Yuran ${s.name} bagi ${overdue.map((i) => monthLabel(i.month)).join(' dan ')} berjumlah ${rm(amount)} masih belum dijelaskan. Mengikut syarat pendaftaran, pelajar boleh diberhentikan jika yuran tertunggak ${settings.unpaidMonthsLimit} bulan. Sila jelaskan bayaran atau hubungi kaunter.`;
                return (
                  <tr key={s.id}>
                    <Td>
                      <a href={`#/students/${s.id}?tab=fees`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
                        {s.name}
                      </a>
                      <p className="text-[13px] text-gray-500">
                        {contact.name} · {contact.phone}
                      </p>
                    </Td>
                    <Td className="text-gray-700">{overdue.map((i) => monthLabel(i.month)).join(', ')}</Td>
                    <Td className="text-right font-medium text-red-700 tnum">{rm(amount)}</Td>
                    <Td className="whitespace-nowrap">{warned ? <Badge tone="blue">Amaran {date(warned)}</Badge> : <Badge>Belum diberi amaran</Badge>}</Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          as="a"
                          size="sm"
                          href={waLink(contact.phone, msg)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => warnArrears(s.id).then(() => notify('Amaran direkodkan.', 'info')).catch(() => {})}
                        >
                          <WhatsAppIcon className="size-3.5" /> Amaran
                        </Button>
                        {s.status === 'ACTIVE' && can(role, 'students.approve') && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!warned}
                            title={warned ? undefined : 'Hantar amaran dahulu'}
                            onClick={() => {
                              if (!window.confirm(`Berhentikan ${s.name} kerana tunggakan yuran? Tempat dalam kelas akan dilepaskan.`)) return;
                              studentAction(s.id, 'terminate', { reason_code: 'TUNGGAKAN', reason_text: `Yuran tertunggak ${overdue.length} bulan` })
                                .then(() => notify(`${s.name} diberhentikan. Tempat kelas dilepaskan.`, 'info'))
                                .catch(() => {});
                            }}
                          >
                            Berhentikan
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Senarai tertunggak & susulan bayaran</h2>
            <p className="mt-0.5 text-[13px] text-gray-500">Susulan minggu 2 hingga 5: butang Peringatan membuka WhatsApp dengan mesej mengikut minggu dan merekodkannya.</p>
          </div>
          <Button
            size="sm"
            icon={Download}
            onClick={() => downloadCsv(`tertunggak-${today}.csv`, ['Invois', 'Pelajar', 'Penjaga', 'Telefon', 'Baki', 'Tarikh akhir', 'Hari lewat', 'Susulan', 'Peringatan', 'Terakhir'],
              open.map((i) => [i.no, i.studentName, i.parentName, i.phone, invoiceBalance(i), i.dueDate, daysLate(i), followUpLabel(i), i.reminders, i.lastReminder || '']))}
          >
            CSV
          </Button>
        </div>
        {open.length === 0 ? (
          <EmptyState title="Tiada invois tertunggak" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pelajar</Th>
                <Th>Invois</Th>
                <Th className="text-right">Baki</Th>
                <Th>Tarikh akhir</Th>
                <Th>Susulan</Th>
                <Th className="text-right">Tindakan</Th>
              </tr>
            </thead>
            <tbody>
              {open.map((inv) => {
                const s = studentById[inv.studentId];
                const contact = preferredContact(s) || { name: inv.parentName, phone: inv.phone };
                const late = daysLate(inv);
                return (
                  <tr key={inv.no}>
                    <Td>
                      <a href={`#/students/${inv.studentId}?tab=fees`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
                        {inv.studentName}
                      </a>
                      <p className="text-[13px] text-gray-500">{contact.name} · {contact.phone}</p>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <p className="text-gray-900">{inv.no}</p>
                      <p className="text-[13px] text-gray-500">{invoiceTitle(inv)}</p>
                    </Td>
                    <Td className="text-right font-medium text-red-700 tnum">{rm(invoiceBalance(inv))}</Td>
                    <Td className="whitespace-nowrap">
                      {date(inv.dueDate)}
                      {late > 0 && <p className="text-[13px] text-red-700">{late} hari lewat</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Badge tone={inv.status === 'OVERDUE' ? 'red' : 'amber'}>{followUpLabel(inv)}</Badge>
                      <p className="mt-0.5 text-[13px] text-gray-500">{inv.reminders ? `${inv.reminders} peringatan · ${date(inv.lastReminder)}` : 'Belum diingatkan'}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          as="a"
                          size="sm"
                          href={waLink(contact.phone, reminderMessage(inv, contact, inv.studentName))}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => invoiceAction(inv.no, 'remind').catch(() => {})}
                        >
                          <WhatsAppIcon className="size-3.5" /> Peringatan
                        </Button>
                        {can(role, 'billing.record') && (
                          <Button size="sm" variant="primary" onClick={() => onPay(inv)}>
                            Rekod bayaran
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ---- Monthly invoice run ------------------------------------------------------

function MonthlyRunModal({ onClose, onDone }) {
  const { invoices, runMonthlyInvoices } = useStore();
  const notify = useToast();
  const latest = invoices.reduce((m, i) => (i.month > m ? i.month : m), CURRENT_MONTH);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const options = [...new Set([CURRENT_MONTH, addMonths(CURRENT_MONTH, 1), addMonths(latest, 1)])].sort();

  // The server works out who is billed and how much; this only shows its answer
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    runMonthlyInvoices(month, true).then((r) => { if (!cancelled) setPreview(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [month, runMonthlyInvoices]);

  const ready = preview?.rows.filter((r) => r.result === 'READY') ?? [];
  const skipped = preview?.rows.filter((r) => r.result === 'SKIPPED') ?? [];
  const sum = (key) => ready.reduce((a, r) => a + Number(r[key] || 0), 0);

  const run = async () => {
    setBusy(true);
    try {
      const done = await runMonthlyInvoices(month, false);
      notify(`${done.created} invois ${monthLabel(month)} dijana.`);
      onDone(month);
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Jana invois bulanan"
      description="Untuk pelajar bulanan aktif yang belum ada invois bulan itu. Selamat dijalankan semula: tiada pelajar dibilkan dua kali."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" disabled={busy || ready.length === 0} onClick={run}>
            {busy ? 'Menjana…' : `Jana ${ready.length} invois`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select label="Bulan" value={month} onChange={(e) => setMonth(e.target.value)}>
          {options.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
        {!preview ? (
          <p className="text-sm text-gray-500">Menyemak…</p>
        ) : (
          <>
            <dl className="space-y-2 rounded-md bg-gray-50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Pelajar akan dibilkan</dt>
                <dd className="font-medium tnum">{ready.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Jumlah yuran</dt>
                <dd className="tnum">{rm(sum('monthly_fee'))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Diskaun tetap</dt>
                <dd className="tnum">− {rm(sum('discount'))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Kredit pelajar digunakan</dt>
                <dd className="tnum">− {rm(sum('credit'))}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                <dt>Perlu dibayar</dt>
                <dd className="tnum">{rm(sum('balance'))}</dd>
              </div>
            </dl>
            {ready.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200">
                <Table>
                  <thead>
                    <tr>
                      <Th>Pelajar</Th>
                      <Th className="text-right">Yuran</Th>
                      <Th className="text-right">Diskaun</Th>
                      <Th className="text-right">Perlu dibayar</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ready.map((r) => (
                      <tr key={r.student_id}>
                        <Td>
                          <p className="text-gray-900">{r.name}</p>
                          <p className="text-[13px] text-gray-500">{formLabel(r.form_level)} · {r.subjects} subjek</p>
                        </Td>
                        <Td className="text-right tnum">{rm(r.monthly_fee)}</Td>
                        <Td className="text-right tnum">{Number(r.discount) ? `− ${rm(r.discount)}` : '—'}</Td>
                        <Td className="text-right font-medium tnum">{rm(r.balance)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
            {skipped.length > 0 && (
              <details className="text-[13px] text-gray-600">
                <summary className="cursor-pointer font-medium">{skipped.length} pelajar dilangkau</summary>
                <ul className="mt-2 space-y-1">
                  {skipped.map((r) => (
                    <li key={r.student_id}>{r.name}: {r.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---- Voucher code, student credit, other charges ------------------------------

function InvoiceAdjustModal({ invoice: inv, onClose }) {
  const { invoiceAction } = useStore();
  const notify = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const credit = Math.min(inv.studentCredit, invoiceBalance(inv));
  const canDiscount = inv.discount === 0 && inv.monthlyFee > 0;
  const run = async (name, payload, message) => {
    setBusy(true);
    try {
      await invoiceAction(inv.no, name, payload);
      notify(message);
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Diskaun & kredit" description={`${inv.no} · ${inv.studentName} · baki ${rm(invoiceBalance(inv))}`} size="sm">
      <div className="space-y-5">
        {canDiscount ? (
          <form onSubmit={(e) => { e.preventDefault(); run('apply_discount', { code }, 'Diskaun digunakan.'); }} className="space-y-3">
            <Input label="Kod baucar" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} hint="Diskaun hanya untuk yuran bulanan, bukan yuran pendaftaran." />
            <Button type="submit" variant="primary" disabled={busy}>Guna kod</Button>
          </form>
        ) : (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {inv.discount > 0 ? `Diskaun sudah digunakan: ${inv.discounts[0]?.label} (− ${rm(inv.discount)}).` : 'Invois ini tiada yuran bulanan untuk didiskaun.'}
          </p>
        )}
        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-700">Kredit pelajar (lebihan bayaran): <strong>{rm(inv.studentCredit)}</strong></p>
          {credit > 0 ? (
            <Button className="mt-3" disabled={busy} onClick={() => run('apply_credit', {}, `Kredit ${rm(credit)} ditolak daripada baki.`)}>
              Tolak {rm(credit)} daripada baki
            </Button>
          ) : (
            <p className="mt-1 text-[13px] text-gray-500">Tiada kredit untuk digunakan.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function OtherInvoiceModal({ onClose }) {
  const { students, createOtherInvoice } = useStore();
  const notify = useToast();
  const [f, setF] = useState({ student: '', description: '', amount: '' });
  const active = students.filter((x) => x.status === 'ACTIVE' || x.status === 'ON_HOLD');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const inv = await createOtherInvoice(f.student, f.description, f.amount);
      notify(`Invois ${inv.invoice_number} dijana.`);
      onClose();
    } catch {
      // reason already shown
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Invois lain"
      description="Caj selain yuran bulanan, cth. seminar atau buku. Tarikh akhir 7 hari."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="other-invoice" variant="primary">Jana invois</Button>
        </>
      }
    >
      <form id="other-invoice" onSubmit={submit} className="space-y-4">
        <Select label="Pelajar" required value={f.student} onChange={(e) => setF({ ...f, student: e.target.value })}>
          <option value="">Pilih pelajar</option>
          {active.map((x) => (
            <option key={x.id} value={x.id}>{x.name} ({x.id})</option>
          ))}
        </Select>
        <Input label="Keterangan" required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="cth. Seminar Teknik Menjawab SPM" />
        <Input label="Jumlah (RM)" type="number" required min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      </form>
    </Modal>
  );
}

// ---- Payment & receipt --------------------------------------------------------

export function InvoiceLines({ inv, showPaid = true }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-gray-600">{inv.type === 'OTHER' ? inv.description : `Yuran bulanan (${monthLabel(inv.month)})`}</dt>
        <dd className="tnum">{rm(inv.monthlyFee)}</dd>
      </div>
      {inv.regFee > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-gray-600">Yuran pendaftaran</dt>
          <dd className="tnum">{rm(inv.regFee)}</dd>
        </div>
      )}
      {inv.discounts?.map((d) => (
        <div key={d.id} className="flex justify-between gap-4">
          <dt className="text-gray-600">{d.label}</dt>
          <dd className="tnum">− {rm(d.amount)}</dd>
        </div>
      ))}
      {inv.creditApplied > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-gray-600">Kredit pelajar</dt>
          <dd className="tnum">− {rm(inv.creditApplied)}</dd>
        </div>
      )}
      {showPaid && inv.paid - inv.creditApplied > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-gray-600">Telah dibayar</dt>
          <dd className="tnum">− {rm(inv.paid - inv.creditApplied)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t border-gray-200 pt-2 font-semibold">
        <dt>{showPaid ? 'Baki perlu dibayar' : 'Jumlah'}</dt>
        <dd className="tnum">{rm(showPaid ? invoiceBalance(inv) : inv.total - inv.discount)}</dd>
      </div>
    </dl>
  );
}

export function PaymentModal({ invoice: inv, onClose, onPaid }) {
  const { students, recordPayment } = useStore();
  const notify = useToast();
  const balance = invoiceBalance(inv);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState('DUITNOW_QR');
  const [type, setType] = useState(inv.type === 'OTHER' ? 'SEMINAR' : inv.regFee > 0 && inv.paid === 0 ? 'REG_FEE' : inv.status === 'OVERDUE' ? 'OUTSTANDING' : 'MONTHLY');
  const [payMonth, setPayMonth] = useState(inv.month);
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const s = students.find((x) => x.id === inv.studentId);
  const amt = Number(amount) || 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const receipt = await recordPayment(inv.no, { amount: amt, method, ref: ref.trim(), date: payDate, type, month: payMonth, notes: notes.trim() });
      notify(`Bayaran ${rm(amt)} direkodkan. Resit ${receipt.no} dikeluarkan.`);
      onPaid(receipt);
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Rekod bayaran"
      description={`${inv.no} · ${s?.name ?? inv.studentName}`}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="payment-form" variant="primary" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan & keluarkan resit'}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-gray-50 p-4">
          <InvoiceLines inv={inv} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amaun diterima (RM)" type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Tarikh bayaran" type="date" required max={todayISO()} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <Select label="Jenis bayaran" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(PAYMENT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          {type === 'MONTHLY' ? (
            <Input label="Bulan" type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} />
          ) : (
            <div />
          )}
          <Select label="Kaedah bayaran" value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Input label="No. rujukan transaksi" required={method !== 'CASH'} value={ref} onChange={(e) => setRef(e.target.value)} placeholder={method === 'CASH' ? 'Pilihan' : 'Seperti pada bukti pindahan'} />
        </div>
        <Textarea label="Catatan untuk pembayar" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {amt > balance && (
          <p className="rounded-md bg-brand-50 px-3 py-2 text-[13px] text-brand-900">Lebihan {rm(amt - balance)} akan disimpan sebagai kredit pelajar.</p>
        )}
        {amt > 0 && amt < balance && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Bayaran separa: baki {rm(balance - amt)} kekal tertunggak.</p>
        )}
      </form>
    </Modal>
  );
}

export function ReceiptModal({ receipt: r, onClose, hideActions }) {
  if (!r) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Resit ${r.no}`}
      footer={<ReceiptActions receipt={r} hideActions={hideActions} />}
    >
      <ReceiptDocument receipt={r} />
    </Modal>
  );
}

function ReceiptActions({ receipt: r, hideActions }) {
  const { invoices, students } = useStore();
  const inv = invoices.find((i) => i.no === r.invoiceNo);
  const s = students.find((x) => x.id === inv?.studentId);
  const contact = preferredContact(s);
  const notify = useToast();
  const message = `Assalamualaikum ${contact?.name}. Terima kasih atas bayaran yuran ${CENTRE.name} bagi ${s?.name}.\n\nNo. resit: ${r.no}\nTarikh: ${date(r.date)}\nAmaun: ${rm(r.amount)} (${PAYMENT_TYPE_LABEL[r.type] ?? ''}${r.month ? ` ${monthLabel(r.month)}` : ''})\nKaedah: ${PAYMENT_METHOD_LABEL[r.method]}${r.overpaid > 0 ? `\nLebihan ${rm(r.overpaid)} disimpan sebagai kredit.` : ''}\n\nSila simpan mesej ini sebagai rekod.`;
  return (
    <>
      {!hideActions && contact?.phone && (
        <Button as="a" href={waLink(contact.phone, message)} target="_blank" rel="noreferrer">
          <WhatsAppIcon /> Hantar kepada penjaga
        </Button>
      )}
      <Button icon={Printer} onClick={() => window.print()}>
        Cetak
      </Button>
      <Button variant="primary" icon={Download} onClick={() => downloadPdf(`/billing/receipts/${r.pk}/pdf/`, `${r.no}.pdf`).catch((err) => notify(err.message, 'error'))}>
        Resit PDF
      </Button>
    </>
  );
}

export function ReceiptDocument({ receipt: r }) {
  const { invoices, students } = useStore();
  const inv = invoices.find((i) => i.no === r.invoiceNo);
  const s = students.find((x) => x.id === inv?.studentId);
  const contact = preferredContact(s);
  return (
    <div className="print-area bg-white text-sm">
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <p className="text-base font-semibold text-gray-900">{CENTRE.name}</p>
          <p className="max-w-xs text-[13px] text-gray-500">{CENTRE.address}</p>
          <p className="text-[13px] text-gray-500">Tel: {CENTRE.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tracking-wide text-gray-500">RESIT RASMI</p>
          <p className="mt-1 whitespace-nowrap font-semibold text-gray-900">{r.no}</p>
          <p className="text-[13px] text-gray-500">{date(r.date)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 py-4">
        <div>
          <dt className="text-xs text-gray-500">Diterima daripada</dt>
          <dd className="text-gray-900">{contact?.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Pelajar</dt>
          <dd className="text-gray-900">
            {s?.name} <span className="whitespace-nowrap text-gray-500">({s?.id})</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Kaedah</dt>
          <dd className="text-gray-900">
            {PAYMENT_METHOD_LABEL[r.method]}
            {r.ref && <span className="text-gray-500"> · {r.ref}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Invois</dt>
          <dd className="text-gray-900">{r.invoiceNo}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Jenis bayaran</dt>
          <dd className="text-gray-900">
            {PAYMENT_TYPE_LABEL[r.type]}
            {r.month && <span className="text-gray-500"> · {monthLabel(r.month)}</span>}
          </dd>
        </div>
      </dl>
      {r.notes && <p className="pb-3 text-[13px] text-gray-600">Catatan: {r.notes}</p>}

      {inv && (
        <div className="border-t border-gray-200 pt-3">
          <InvoiceLines inv={inv} showPaid={false} />
        </div>
      )}
      <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 text-base font-semibold">
        <span>Amaun diterima</span>
        <span className="tnum">{rm(r.amount)}</span>
      </div>
      {r.overpaid > 0 && (
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-gray-600">Lebihan disimpan sebagai kredit</span>
          <span className="tnum">{rm(r.overpaid)}</span>
        </div>
      )}
      {inv && invoiceBalance(inv) > 0 && (
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-gray-600">Baki tertunggak</span>
          <span className="text-red-700 tnum">{rm(invoiceBalance(inv))}</span>
        </div>
      )}

      <p className="mt-6 border-t border-gray-200 pt-3 text-xs text-gray-500">
        Diterima oleh {r.by}. Resit ini dijana oleh komputer dan tidak memerlukan tandatangan.
      </p>
    </div>
  );
}

function CalculatorModal({ open, onClose }) {
  const { pricingTiers, settings } = useStore();
  const [category, setCategory] = useState('SECONDARY');
  const [count, setCount] = useState(4);
  const [withReg, setWithReg] = useState(true);

  const secondaryCounts = useMemo(
    () => pricingTiers.filter((t) => t.category === 'SECONDARY').map((t) => t.count).sort((a, b) => a - b),
    [pricingTiers],
  );
  const form = category === 'DARJAH_5' ? 'S5' : category === 'DARJAH_6' ? 'S6' : 'F4';
  const fee = monthlyFee(form, count, pricingTiers);
  const tier = pricingTiers.find((t) => t.category === category && (category !== 'SECONDARY' || t.count === count));

  return (
    <Modal open={open} onClose={onClose} title="Kalkulator yuran" description="Berdasarkan pakej harga semasa dalam Tetapan." size="sm">
      <div className="space-y-4">
        <Select label="Peringkat" value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(TIER_CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {category === 'SECONDARY' ? (
          <Select label="Bilangan subjek" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {secondaryCounts.map((n) => {
              const t = pricingTiers.find((x) => x.category === 'SECONDARY' && x.count === n);
              return (
                <option key={n} value={n}>
                  {n} subjek ({rm(t.rate)} / subjek)
                </option>
              );
            })}
          </Select>
        ) : (
          <p className="text-sm text-gray-600">Pakej {tier?.count} subjek.</p>
        )}
        <Checkbox label={`Pelajar baharu (yuran pendaftaran ${rm(settings.regFee)})`} checked={withReg} onChange={(e) => setWithReg(e.target.checked)} />
        <div className="rounded-md bg-gray-50 p-4">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Yuran bulanan</span>
            <span className="tnum">{rm(fee)}</span>
          </div>
          {withReg && (
            <div className="mt-1 flex justify-between text-sm text-gray-600">
              <span>Pendaftaran</span>
              <span className="tnum">{rm(settings.regFee)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
            <span>Jumlah</span>
            <span className="tnum">{rm(fee + (withReg ? settings.regFee : 0))}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
