import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, FilePlus2, Printer, Receipt, Search } from 'lucide-react';
import { CENTRE, CURRENT_MONTH } from '../data/demo';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import {
  addMonths, arrearsCases, discountsFor, invoiceBalance, invoiceStatus, monthlyFee, preferredContact,
} from '../lib/domain';
import { date, formLabel, monthLabel, PAYMENT_METHOD_LABEL, rm, ROLE_LABEL, TIER_CATEGORY_LABEL, todayISO, waLink } from '../lib/format';
import { publicUrl } from '../lib/nav';
import {
  Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, SearchInput, Segmented, Select, Stat, Table, Tabs, Td, Th,
  useToast, WhatsAppIcon,
} from './ui';

const STATUS_BADGE = {
  PAID: <Badge tone="green">Dibayar</Badge>,
  PARTIAL: <Badge tone="amber">Separa</Badge>,
  UNPAID: <Badge tone="red">Belum bayar</Badge>,
};

const PAGE = 50;

function clearPayLink() {
  if (window.location.hash.includes('?')) window.history.replaceState(null, '', '#/billing');
}

export default function BillingView({ role }) {
  const { invoices, receipts, students, settings } = useStore();
  const query = new URLSearchParams(window.location.hash.split('?')[1]);
  const [tab, setTab] = useState(query.get('tab') ?? 'invoices');
  const [status, setStatus] = useState('ALL');
  const [month, setMonth] = useState(CURRENT_MONTH);
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
            {can(role, 'billing.run') && (
              <Button variant="primary" icon={FilePlus2} onClick={() => setRunning(true)}>
                Jana invois bulanan
              </Button>
            )}
          </>
        }
      />

      {can(role, 'finance.summary') && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label={`Dibilkan ${monthLabel(CURRENT_MONTH)}`} value={rm(billed)} hint={`${monthInv.length} invois`} />
          <Stat label="Dikutip" value={rm(collected)} hint={`${billed ? Math.round((collected / billed) * 100) : 0}% daripada jumlah dibilkan`} />
          <Stat label="Tertunggak (semua bulan)" value={rm(outstanding)} hint={`${invoices.filter((i) => invoiceBalance(i) > 0).length} invois`} tone={outstanding ? 'red' : undefined} />
        </div>
      )}

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
          ...(can(role, 'billing.arrears') ? [{ value: 'arrears', label: 'Tunggakan', count: cases.length }] : []),
        ]}
      />

      {tab === 'arrears' ? (
        <ArrearsPanel cases={cases} role={role} />
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
                        <p className="text-[13px] text-gray-500">{monthLabel(inv.month)}</p>
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
                      </Td>
                      <Td className="hidden text-right tnum md:table-cell">{invoiceBalance(inv) ? rm(invoiceBalance(inv)) : '—'}</Td>
                      <Td>{STATUS_BADGE[st]}</Td>
                      <Td className="whitespace-nowrap text-right">
                        {st !== 'PAID'
                          ? canRecord && (
                              <Button size="sm" variant="primary" onClick={() => setPaying(inv)}>
                                Rekod bayaran
                              </Button>
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
                        <p className="text-gray-900">{s?.name}</p>
                        <p className="text-[13px] text-gray-500">{r.invoiceNo}</p>
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
    </>
  );
}

// ---- Arrears (unpaid-months rule) --------------------------------------------

function ArrearsPanel({ cases, role }) {
  const { settings, arrearsWarnings, warnArrears, updateStudent } = useStore();
  const notify = useToast();
  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-gray-200 bg-amber-50/60 px-5 py-3.5 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Polisi: pelajar yang tertunggak yuran <strong>{settings.unpaidMonthsLimit} bulan</strong> tanpa makluman boleh diberhentikan. Hantar amaran
          terlebih dahulu, kemudian gantung jika tiada maklum balas.
        </p>
      </div>
      {cases.length === 0 ? (
        <EmptyState title="Tiada pelajar melebihi had tunggakan" />
      ) : (
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
              const warned = arrearsWarnings[s.id];
              const msg = `Assalamualaikum ${contact.name}. Yuran ${s.name} bagi ${overdue.map((i) => monthLabel(i.month)).join(' dan ')} berjumlah ${rm(amount)} masih belum dijelaskan. Mengikut syarat pendaftaran, pelajar boleh diberhentikan jika yuran tertunggak ${settings.unpaidMonthsLimit} bulan. Sila jelaskan bayaran atau hubungi kaunter. Bayar dalam talian: ${publicUrl(`bayar/${overdue[0].no}`)}`;
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
                  <Td className="whitespace-nowrap">
                    {s.status === 'SUSPENDED' ? <Badge tone="amber">Digantung</Badge> : warned ? <Badge tone="blue">Amaran {date(warned)}</Badge> : <Badge>Belum diberi amaran</Badge>}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        as="a"
                        size="sm"
                        href={waLink(contact.phone, msg)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          warnArrears(s.id);
                          notify('Amaran direkodkan.', 'info');
                        }}
                      >
                        <WhatsAppIcon className="size-3.5" /> Amaran
                      </Button>
                      {s.status === 'ACTIVE' && can(role, 'billing.arrears') && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!warned}
                          title={warned ? undefined : 'Hantar amaran dahulu'}
                          onClick={() => {
                            updateStudent(s.id, { status: 'SUSPENDED' });
                            notify(`${s.name} digantung. Tempat kelas dilepaskan.`, 'info');
                          }}
                        >
                          Gantung
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
  );
}

// ---- Monthly invoice run ------------------------------------------------------

function MonthlyRunModal({ onClose, onDone }) {
  const { invoices, students, pricingTiers, discounts, runMonthlyInvoices } = useStore();
  const notify = useToast();
  const latest = invoices.reduce((m, i) => (i.month > m ? i.month : m), CURRENT_MONTH);
  const [month, setMonth] = useState(addMonths(latest, 1));
  const have = new Set(invoices.filter((i) => i.month === month).map((i) => i.studentId));
  const eligible = students.filter((s) => s.status === 'ACTIVE' && s.classes.length > 0 && !have.has(s.id));
  const preview = eligible.map((s) => {
    const monthly = monthlyFee(s.form, s.classes.length, pricingTiers);
    const disc = discountsFor(s, students, discounts, monthly).reduce((a, d) => a + d.amount, 0);
    return { monthly, disc };
  });
  const gross = preview.reduce((a, p) => a + p.monthly, 0);
  const disc = preview.reduce((a, p) => a + p.disc, 0);
  const skipped = students.filter((s) => s.status === 'SUSPENDED').length;
  const options = [0, 1, 2].map((n) => addMonths(latest, n));

  return (
    <Modal
      open
      onClose={onClose}
      title="Jana invois bulanan"
      description="Invois dijana untuk semua pelajar aktif berdasarkan subjek dan pakej semasa."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            disabled={eligible.length === 0}
            onClick={() => {
              const created = runMonthlyInvoices(month);
              notify(`${created.length} invois ${monthLabel(month)} dijana.`);
              onDone(month);
            }}
          >
            Jana {eligible.length} invois
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
        <dl className="space-y-2 rounded-md bg-gray-50 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Pelajar aktif tanpa invois {monthLabel(month)}</dt>
            <dd className="font-medium tnum">{eligible.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Jumlah yuran</dt>
            <dd className="tnum">{rm(gross)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Diskaun (adik-beradik, asnaf, dll.)</dt>
            <dd className="tnum">− {rm(disc)}</dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
            <dt>Jumlah dibilkan</dt>
            <dd className="tnum">{rm(gross - disc)}</dd>
          </div>
        </dl>
        {have.size > 0 && <p className="text-[13px] text-gray-500">{have.size} pelajar sudah mempunyai invois bulan ini dan akan dilangkau.</p>}
        {skipped > 0 && <p className="text-[13px] text-gray-500">{skipped} pelajar yang digantung tidak akan dibilkan.</p>}
      </div>
    </Modal>
  );
}

// ---- Payment & receipt --------------------------------------------------------

export function InvoiceLines({ inv, showPaid = true }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-gray-600">Yuran bulanan ({monthLabel(inv.month)})</dt>
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
      {showPaid && inv.paid > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-gray-600">Telah dibayar</dt>
          <dd className="tnum">− {rm(inv.paid)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t border-gray-200 pt-2 font-semibold">
        <dt>{showPaid ? 'Baki perlu dibayar' : 'Jumlah'}</dt>
        <dd className="tnum">{rm(showPaid ? invoiceBalance(inv) : inv.total - inv.discount)}</dd>
      </div>
    </dl>
  );
}

export function PaymentModal({ invoice: inv, role, onClose, onPaid }) {
  const { students, recordPayment } = useStore();
  const notify = useToast();
  const balance = invoiceBalance(inv);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState('DUITNOW_QR');
  const [ref, setRef] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const s = students.find((x) => x.id === inv.studentId);

  const submit = (e) => {
    e.preventDefault();
    const amt = Number(amount);
    const receipt = recordPayment(inv.no, { amount: amt, method, ref: ref.trim(), date: payDate, by: ROLE_LABEL[role] });
    notify(`Bayaran ${rm(amt)} direkodkan. Resit ${receipt.no} dikeluarkan.`);
    onPaid(receipt);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Rekod bayaran"
      description={`${inv.no} · ${s?.name}`}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="payment-form" variant="primary">
            Simpan & keluarkan resit
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-gray-50 p-4">
          <InvoiceLines inv={inv} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amaun diterima (RM)" type="number" required min="1" max={balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Tarikh bayaran" type="date" required max={todayISO()} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </div>
        <Select label="Kaedah bayaran" value={method} onChange={(e) => setMethod(e.target.value)}>
          {Object.entries(PAYMENT_METHOD_LABEL)
            .filter(([k]) => k !== 'ONLINE')
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </Select>
        {method !== 'CASH' && (
          <Input
            label="No. rujukan transaksi"
            required
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Seperti pada bukti pindahan"
            hint={method === 'DUITNOW_QR' ? `DuitNow ke akaun ${CENTRE.bank}` : undefined}
          />
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
  const message = `Assalamualaikum ${contact?.name}. Terima kasih atas bayaran yuran ${CENTRE.name} bagi ${s?.name}.\n\nNo. resit: ${r.no}\nTarikh: ${date(r.date)}\nAmaun: ${rm(r.amount)}\nKaedah: ${PAYMENT_METHOD_LABEL[r.method]}\n\nSila simpan mesej ini sebagai rekod.`;
  return (
    <>
      {!hideActions && contact?.phone && (
        <Button as="a" href={waLink(contact.phone, message)} target="_blank" rel="noreferrer">
          <WhatsAppIcon /> Hantar kepada penjaga
        </Button>
      )}
      <Button variant="primary" icon={Printer} onClick={() => window.print()}>
        Cetak / simpan PDF
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
      </dl>

      {inv && (
        <div className="border-t border-gray-200 pt-3">
          <InvoiceLines inv={inv} showPaid={false} />
        </div>
      )}
      <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 text-base font-semibold">
        <span>Amaun diterima</span>
        <span className="tnum">{rm(r.amount)}</span>
      </div>
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
