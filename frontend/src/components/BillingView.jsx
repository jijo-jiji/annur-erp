import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Printer, Calculator, Download, X, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { billingApi, dashboardApi } from '../api/client';
import { FORMS, waLink, today, downloadCsv, estimateMonthlyFee } from './studentShared';
import { MonthlyRunPanel, DiscountsPanel, InvoiceAdjustModal, OtherInvoiceModal } from './BillingTools';

const METHODS = [
  { value: 'DUITNOW_QR', label: 'DuitNow QR' },
  { value: 'CASH', label: 'Tunai' },
  { value: 'ONLINE_BANKING', label: 'Online Banking / FPX' },
  { value: 'CARD', label: 'Kad Debit / Kredit' },
];
const PAYMENT_TYPES = [
  { value: 'MONTHLY', label: 'Yuran Bulanan' },
  { value: 'REG_FEE', label: 'Yuran Pendaftaran' },
  { value: 'SEMINAR', label: 'Seminar' },
  { value: 'OUTSTANDING', label: 'Tunggakan' },
];
const METHOD_LABELS = Object.fromEntries(METHODS.map((m) => [m.value, m.label]));
const TYPE_LABELS = Object.fromEntries(PAYMENT_TYPES.map((t) => [t.value, t.label]));
const STATUS = {
  PAID: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-800' },
  PARTIAL: { label: 'Sebahagian', cls: 'bg-amber-100 text-amber-800' },
  UNPAID: { label: 'Belum Bayar', cls: 'bg-rose-100 text-rose-800' },
  OVERDUE: { label: 'Tertunggak', cls: 'bg-rose-200 text-rose-900' },
};

const money = (v) => `RM ${Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const daysOverdue = (inv) => (inv.status === 'PAID' ? 0 : Math.max(0, Math.floor((new Date() - new Date(inv.due_date)) / 86400000)));
const monthLabel = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' }) : '');
// j-status.doc: payment follow-up in weeks 2-5 of the month; older balances are arrears
const followUpLabel = (inv) => (inv.follow_up_week ? `Minggu ${inv.follow_up_week}` : 'Tunggakan bulan lepas');
const invoiceTitle = (inv) => (inv.invoice_type === 'OTHER' ? inv.description : monthLabel(inv.billing_month));

export default function BillingView({ currentRole = 'ADMIN' }) {
  const { invoices, receipts, payInvoice, pricingTiers, showToast, refreshBilling } = useApp();
  const [discounts, setDiscounts] = useState([]);
  const [adjustFor, setAdjustFor] = useState(null);
  const [addingOther, setAddingOther] = useState(false);
  const loadDiscounts = () => billingApi.getDiscounts().then(setDiscounts).catch(() => setDiscounts([]));
  useEffect(() => { loadDiscounts(); }, []);
  const [tab, setTab] = useState('invoices');
  const [filter, setFilter] = useState('OPEN');
  const [search, setSearch] = useState('');
  const [payFor, setPayFor] = useState(null);
  const [payment, setPayment] = useState({});
  const [saving, setSaving] = useState(false);
  const [receiptView, setReceiptView] = useState(null);
  const [calc, setCalc] = useState({ form: 'F5', count: 4, reg: true });
  const [regSetting, setRegSetting] = useState(0);

  useEffect(() => {
    dashboardApi.getSettings()
      .then((rows) => setRegSetting(Number(rows.find((r) => r.key === 'REGISTRATION_FEE')?.value || 0)))
      .catch(() => {});
  }, []);

  const isManagement = currentRole === 'MANAGEMENT';
  const open = invoices.filter((i) => i.status !== 'PAID');
  const outstanding = open.reduce((s, i) => s + Number(i.balance_due || 0), 0);
  const overdue2m = open.filter((i) => daysOverdue(i) >= 60);

  const term = search.trim().toLowerCase();
  const listed = invoices.filter((i) =>
    (filter === 'ALL' || (filter === 'OPEN' ? i.status !== 'PAID' : i.status === filter)) &&
    (!term || [i.student_name, i.invoice_number, i.student_code, i.parent_name].some((v) => (v || '').toLowerCase().includes(term)))
  );

  const todayTotal = useMemo(() => receipts.filter((r) => r.payment_date === today()).reduce((s, r) => s + Number(r.amount_paid), 0), [receipts]);
  const calcFee = estimateMonthlyFee(pricingTiers, calc.form, Number(calc.count));

  const startPayment = (inv) => {
    setPayFor(inv);
    setPayment({
      amount_paid: Number(inv.balance_due).toFixed(2),
      payment_method: 'DUITNOW_QR',
      payment_type: Number(inv.registration_fee) > 0 && Number(inv.total_paid) === 0 ? 'REG_FEE' : 'MONTHLY',
      payment_month: inv.billing_month,
      payment_date: today(),
      reference_number: '',
      notes: '',
    });
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const receipt = await payInvoice(payFor.id, {
        ...payment,
        // The month only applies to monthly fees
        payment_month: payment.payment_type === 'MONTHLY' ? payment.payment_month || null : null,
      });
      setPayFor(null);
      setReceiptView({ receipt, invoice: payFor });
    } catch {
      // toast already shown
    } finally {
      setSaving(false);
    }
  };

  const receiptMessage = (r, inv) => [
    `Assalamualaikum ${inv.parent_name}, terima kasih atas bayaran yuran Pusat Tuisyen An Nur bagi ${inv.student_name}.`,
    `No. Resit: ${r.receipt_number}`,
    `Tarikh: ${r.payment_date}`,
    `Jumlah: ${money(r.amount_paid)} (${TYPE_LABELS[r.payment_type] || ''}${r.payment_month ? `, ${monthLabel(r.payment_month)}` : ''})`,
    Number(r.overpaid_amount) > 0 ? `Lebihan ${money(r.overpaid_amount)} disimpan sebagai kredit.` : '',
  ].filter(Boolean).join('\n');

  // Wording firms up with the week of the month, but only says "overdue" once the due date has passed
  const reminderMessage = (inv) => {
    const what = `yuran Pusat Tuisyen An Nur bagi ${inv.student_name}: baki ${money(inv.balance_due)} (invois ${inv.invoice_number}, ${invoiceTitle(inv)})`;
    const week = inv.follow_up_week;
    if (inv.status !== 'OVERDUE') {
      return week && week <= 2
        ? `Assalamualaikum ${inv.parent_name}, sekadar peringatan mesra ${what}, tarikh akhir ${inv.due_date}. Abaikan mesej ini jika sudah membuat bayaran. Terima kasih.`
        : `Assalamualaikum ${inv.parent_name}, peringatan ${what}, tarikh akhir ${inv.due_date}. Mohon jelaskan bayaran sebelum tarikh akhir. Terima kasih.`;
    }
    if (week) return `Assalamualaikum ${inv.parent_name}, ${what} masih belum dijelaskan selepas tarikh akhir ${inv.due_date}. Mohon jelaskan minggu ini atau hubungi kaunter. Terima kasih.`;
    return `Assalamualaikum ${inv.parent_name}, notis tunggakan ${what}. Mengikut syarat pusat, kelas boleh digugurkan selepas 2 bulan tunggakan. Mohon hubungi kaunter untuk penyelesaian. Terima kasih.`;
  };
  // Opens WhatsApp with the message and records that a reminder went out
  const sendReminder = (inv) => {
    billingApi.invoiceAction(inv.id, 'remind').then(refreshBilling).catch(() => {});
  };
  const reminderLink = (inv, cls) => (
    <a href={waLink(inv.preferred_phone, reminderMessage(inv))} target="_blank" rel="noreferrer" onClick={() => sendReminder(inv)}
      className={`${cls} inline-flex items-center gap-1 font-semibold`}><MessageSquare className="w-3.5 h-3.5" /> Peringatan</a>
  );

  const invoiceFor = (r) => invoices.find((i) => i.id === r.invoice) || { student_name: r.student_name, parent_name: '', invoice_number: r.invoice_number };
  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${tab === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
  );
  const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white';

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Kutipan Yuran</h2>
          <p className="text-slate-500">Invois pertama dijana apabila pendaftaran diluluskan; invois bulanan melalui tab Invois Bulanan. Lebihan bayaran disimpan sebagai kredit pelajar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAddingOther(true)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Invois Lain</button>
          <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-slate-200">
            {tabBtn('invoices', `Invois (${invoices.length})`)}
            {tabBtn('run', 'Invois Bulanan')}
            {tabBtn('outstanding', `Tertunggak (${open.length})`)}
            {tabBtn('receipts', `Resit (${receipts.length})`)}
            {tabBtn('discounts', 'Diskaun')}
            {tabBtn('calculator', 'Kalkulator Yuran')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Kutipan Hari Ini', money(todayTotal), 'text-purple-700'],
          ['Jumlah Tertunggak', money(outstanding), outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'],
          ['Invois Belum Selesai', open.length, 'text-slate-900'],
          ['Tertunggak > 2 Bulan', overdue2m.length, overdue2m.length ? 'text-rose-600' : 'text-slate-900'],
        ].map(([l, v, tone]) => (
          <div key={l} className="p-4 bg-white rounded-2xl border border-slate-200">
            <span className="text-slate-500 font-semibold block">{l}</span>
            <span className={`text-xl font-black ${tone}`}>{v}</span>
          </div>
        ))}
      </div>

      {tab === 'invoices' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input type="search" aria-label="Cari invois" placeholder="Cari pelajar, invois, waris…" value={search} onChange={(e) => setSearch(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 min-w-[220px]" />
            <select aria-label="Status invois" value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold">
              <option value="OPEN">Belum selesai</option>
              <option value="ALL">Semua</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]">
                <tr><th className="py-2.5 px-3">Invois</th><th className="px-3">Pelajar</th><th className="px-3">Bulan</th><th className="px-3">Jumlah</th><th className="px-3">Dibayar</th><th className="px-3">Baki</th><th className="px-3">Status</th><th className="px-3 text-right">Tindakan</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listed.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-400">Tiada invois.</td></tr>}
                {listed.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold">{inv.invoice_number}<div className="text-[10px] text-slate-400 font-normal">Akhir {inv.due_date}</div></td>
                    <td className="px-3">
                      <div className="font-semibold">{inv.student_name} <span className="text-slate-400">({inv.student_form})</span></div>
                      <div className="text-[10px] text-slate-500">{inv.parent_name} • {inv.preferred_phone}</div>
                      {Number(inv.student_credit) > 0 && <div className="text-[10px] text-emerald-700 font-semibold">Kredit {money(inv.student_credit)}</div>}
                    </td>
                    <td className="px-3">{invoiceTitle(inv)}<div className="text-[10px] text-slate-400">{inv.invoice_type_label}</div></td>
                    <td className="px-3 font-bold">
                      {money(inv.total_payable)}
                      {Number(inv.registration_fee) > 0 && <div className="text-[10px] text-slate-400 font-normal">termasuk pendaftaran {money(inv.registration_fee)}</div>}
                      {inv.discount_remarks && <div className="text-[10px] text-indigo-600 font-normal">{inv.discount_remarks}{Number(inv.discount_amount) > 0 ? ` -${money(inv.discount_amount)}` : ''}</div>}
                    </td>
                    <td className="px-3">{money(inv.total_paid)}{Number(inv.credit_applied) > 0 && <div className="text-[10px] text-emerald-700">termasuk kredit {money(inv.credit_applied)}</div>}</td>
                    <td className="px-3 font-bold text-rose-600">{Number(inv.balance_due) > 0 ? money(inv.balance_due) : '-'}</td>
                    <td className="px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS[inv.status]?.cls}`}>{STATUS[inv.status]?.label}</span></td>
                    <td className="px-3 text-right">
                      <div className="inline-flex gap-1.5">
                        {inv.status !== 'PAID' && <button onClick={() => startPayment(inv)} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold cursor-pointer">Terima Bayaran</button>}
                        {inv.status !== 'PAID' && <button onClick={() => setAdjustFor(inv)} className="px-2 py-1.5 rounded-lg bg-slate-100 font-semibold cursor-pointer">Diskaun / Kredit</button>}
                        {inv.status !== 'PAID' && reminderLink(inv, 'px-2 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200')}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'outstanding' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Senarai Tertunggak</h3>
              <p className="text-slate-500">Susulan minggu 2 hingga 5: tekan Peringatan untuk membuka WhatsApp dengan mesej mengikut minggu (dihantar seorang demi seorang). Setiap peringatan direkodkan.</p>
            </div>
            <button onClick={() => downloadCsv(`tertunggak-${today()}.csv`, ['Invois', 'Pelajar', 'Tingkatan', 'Waris', 'Telefon', 'Baki', 'Hari Lewat', 'Susulan', 'Peringatan Dihantar', 'Peringatan Terakhir'],
              open.map((i) => [i.invoice_number, i.student_name, i.student_form, i.parent_name, i.preferred_phone, i.balance_due, daysOverdue(i), followUpLabel(i), i.reminder_count, i.last_reminder_at || '']))}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> CSV</button>
          </div>
          {open.length === 0 ? <p className="py-8 text-center text-emerald-700">Tiada tunggakan.</p> : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2.5 px-3">Pelajar</th><th className="px-3">Waris</th><th className="px-3">Baki</th><th className="px-3">Hari Lewat</th><th className="px-3">Susulan</th><th className="px-3 text-right">Tindakan</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...open].sort((a, b) => daysOverdue(b) - daysOverdue(a)).map((inv) => {
                  const days = daysOverdue(inv);
                  return (
                    <tr key={inv.id} className={days >= 60 ? 'bg-rose-50/60' : ''}>
                      <td className="py-2.5 px-3 font-semibold">{inv.student_name} <span className="text-slate-400">({inv.student_form})</span></td>
                      <td className="px-3">{inv.parent_name}<div className="text-[10px] text-slate-500">{inv.preferred_phone}</div></td>
                      <td className="px-3 font-bold text-rose-600">{money(inv.balance_due)}</td>
                      <td className="px-3 font-semibold">{days} hari{days >= 60 && <span className="ml-1 text-rose-700">(&gt; 2 bulan)</span>}</td>
                      <td className="px-3">
                        <span className="font-semibold">{followUpLabel(inv)}</span>
                        <div className="text-[10px] text-slate-500">{inv.reminder_count ? `${inv.reminder_count} peringatan, terakhir ${inv.last_reminder_at}` : 'Belum diingatkan'}</div>
                      </td>
                      <td className="px-3 text-right space-x-1.5">
                        {reminderLink(inv, 'px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200')}
                        <button onClick={() => startPayment(inv)} className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold cursor-pointer">Terima Bayaran</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'run' && <MonthlyRunPanel />}
      {tab === 'discounts' && <DiscountsPanel currentRole={currentRole} discounts={discounts} onChanged={loadDiscounts} />}

      {tab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex justify-end">
            <button onClick={() => downloadCsv(`resit-${today()}.csv`, ['No. Resit', 'Tarikh', 'Pelajar', 'Invois', 'Jenis', 'Bulan', 'Kaedah', 'Jumlah', 'Lebihan', 'Diterima Oleh', 'Catatan'],
              receipts.map((r) => [r.receipt_number, r.payment_date, r.student_name, r.invoice_number, TYPE_LABELS[r.payment_type], r.payment_month, METHOD_LABELS[r.payment_method], r.amount_paid, r.overpaid_amount, r.received_by, r.notes]))}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> CSV</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]"><tr><th className="py-2.5 px-3">Resit</th><th className="px-3">Tarikh</th><th className="px-3">Pelajar</th><th className="px-3">Jenis</th><th className="px-3">Kaedah</th><th className="px-3">Jumlah</th><th className="px-3 text-right">Tindakan</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">Tiada resit.</td></tr>}
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 px-3 font-bold text-indigo-700">{r.receipt_number}</td>
                    <td className="px-3">{r.payment_date}</td>
                    <td className="px-3">{r.student_name}<div className="text-[10px] text-slate-400">{r.invoice_number}</div></td>
                    <td className="px-3">{TYPE_LABELS[r.payment_type]}{r.payment_month ? <div className="text-[10px] text-slate-400">{monthLabel(r.payment_month)}</div> : null}</td>
                    <td className="px-3">{METHOD_LABELS[r.payment_method]}</td>
                    <td className="px-3 font-bold">{money(r.amount_paid)}{Number(r.overpaid_amount) > 0 && <div className="text-[10px] text-emerald-700 font-normal">lebihan {money(r.overpaid_amount)}</div>}</td>
                    <td className="px-3 text-right"><button onClick={() => setReceiptView({ receipt: r, invoice: invoiceFor(r) })} className="px-2.5 py-1.5 rounded-lg bg-slate-100 font-semibold inline-flex items-center gap-1 cursor-pointer"><Printer className="w-3.5 h-3.5" /> Resit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'calculator' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-2xl">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Calculator className="w-4 h-4 text-indigo-600" /> Kalkulator Yuran</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="font-semibold text-slate-700">Tingkatan
              <select value={calc.form} onChange={(e) => setCalc({ ...calc, form: e.target.value })} className={`${input} mt-1`}>{FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
            </label>
            <label className="font-semibold text-slate-700">Bilangan subjek
              <input type="number" min="1" max="12" value={calc.count} onChange={(e) => setCalc({ ...calc, count: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="font-semibold text-slate-700 flex items-center gap-2 mt-5"><input type="checkbox" checked={calc.reg} onChange={(e) => setCalc({ ...calc, reg: e.target.checked })} /> Pelajar baharu (yuran pendaftaran)</label>
          </div>
          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex flex-wrap justify-between gap-3">
            <div className="text-indigo-900">Yuran bulanan: <strong>{money(calcFee)}</strong>{calc.reg ? ` + pendaftaran ${money(regSetting)}` : ''}</div>
            <div className="text-xl font-black text-indigo-950">{money(calcFee + (calc.reg ? regSetting : 0))}</div>
          </div>
          <p className="text-slate-500">Dikira daripada pakej yuran di Hab Konfigurasi, sebelum diskaun. Diskaun diurus di tab Diskaun.</p>
        </div>
      )}

      {payFor && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={submitPayment} className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Terima Bayaran</h3>
                <p className="text-slate-500">{payFor.student_name} • {payFor.invoice_number} • baki {money(payFor.balance_due)}</p>
              </div>
              <button type="button" onClick={() => setPayFor(null)} aria-label="Tutup" className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="font-semibold text-slate-700">Jumlah dibayar (RM)
                <input type="number" step="0.01" min="0.01" required value={payment.amount_paid} onChange={(e) => setPayment({ ...payment, amount_paid: e.target.value })} className={`${input} mt-1 font-bold`} />
              </label>
              <label className="font-semibold text-slate-700">Tarikh
                <input type="date" required value={payment.payment_date} onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })} className={`${input} mt-1`} />
              </label>
              <label className="font-semibold text-slate-700">Kaedah
                <select value={payment.payment_method} onChange={(e) => setPayment({ ...payment, payment_method: e.target.value })} className={`${input} mt-1`}>{METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
              </label>
              <label className="font-semibold text-slate-700">Jenis bayaran
                <select value={payment.payment_type} onChange={(e) => setPayment({ ...payment, payment_type: e.target.value })} className={`${input} mt-1`}>{PAYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
              </label>
              {payment.payment_type === 'MONTHLY' && (
                <label className="font-semibold text-slate-700">Bulan
                  <input type="month" value={(payment.payment_month || '').slice(0, 7)} onChange={(e) => setPayment({ ...payment, payment_month: e.target.value ? `${e.target.value}-01` : '' })} className={`${input} mt-1`} />
                </label>
              )}
              <label className="font-semibold text-slate-700">No. rujukan
                <input value={payment.reference_number} onChange={(e) => setPayment({ ...payment, reference_number: e.target.value })} className={`${input} mt-1`} />
              </label>
            </div>
            <label className="block font-semibold text-slate-700">Catatan untuk pembayar
              <textarea rows="2" value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} className={`${input} mt-1`} />
            </label>
            {Number(payment.amount_paid) > Number(payFor.balance_due) && (
              <p className="p-2 rounded-lg bg-emerald-50 text-emerald-800 font-semibold">Lebihan {money(Number(payment.amount_paid) - Number(payFor.balance_due))} akan disimpan sebagai kredit pelajar.</p>
            )}
            {Number(payment.amount_paid) < Number(payFor.balance_due) && (
              <p className="p-2 rounded-lg bg-amber-50 text-amber-800 font-semibold">Bayaran separa: baki {money(Number(payFor.balance_due) - Number(payment.amount_paid))} kekal tertunggak.</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPayFor(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold">Batal</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan & Jana Resit'}</button>
            </div>
          </form>
        </div>
      )}

      {receiptView && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
            <div className="text-center border-b pb-4">
              <h2 className="text-base font-bold text-slate-900">PUSAT TUISYEN AN NUR</h2>
              <p className="text-[11px] text-slate-500">Tingkat 1&2, PT 105 Seksyen 23, Jalan Telipot, 15150 Kota Bharu</p>
              <div className="mt-2 font-bold text-sm text-indigo-700">RESIT RASMI</div>
            </div>
            <div className="space-y-1.5 text-slate-700">
              {[
                ['No. Resit', receiptView.receipt.receipt_number],
                ['Tarikh', receiptView.receipt.payment_date],
                ['Pelajar', receiptView.invoice.student_name],
                ['Invois', receiptView.invoice.invoice_number],
                ['Jenis', `${TYPE_LABELS[receiptView.receipt.payment_type] || ''}${receiptView.receipt.payment_month ? ` (${monthLabel(receiptView.receipt.payment_month)})` : ''}`],
                ['Kaedah', METHOD_LABELS[receiptView.receipt.payment_method]],
                ['No. Rujukan', receiptView.receipt.reference_number || '-'],
                ['Diterima Oleh', receiptView.receipt.received_by],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span>{k}</span><strong className="text-slate-900 text-right">{v}</strong></div>)}
              {receiptView.receipt.notes && <div className="pt-1 text-slate-600">Catatan: {receiptView.receipt.notes}</div>}
            </div>
            <div className="border-t border-b py-3 flex justify-between text-sm">
              <span className="font-bold">JUMLAH DITERIMA</span>
              <span className="font-extrabold text-indigo-900">{money(receiptView.receipt.amount_paid)}</span>
            </div>
            {Number(receiptView.receipt.overpaid_amount) > 0 && <p className="text-emerald-700 font-semibold">Lebihan {money(receiptView.receipt.overpaid_amount)} disimpan sebagai kredit.</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setReceiptView(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold">Tutup</button>
              {receiptView.invoice.preferred_phone && (
                <a href={waLink(receiptView.invoice.preferred_phone, receiptMessage(receiptView.receipt, receiptView.invoice))} target="_blank" rel="noreferrer"
                  onClick={() => showToast('WhatsApp dibuka dengan butiran resit.')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold inline-flex items-center gap-1"><MessageSquare className="w-4 h-4" /> WhatsApp Resit</a>
              )}
              <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">Cetak / PDF</button>
            </div>
          </div>
        </div>
      )}

      {adjustFor && <InvoiceAdjustModal invoice={adjustFor} onClose={() => setAdjustFor(null)} />}
      {addingOther && <OtherInvoiceModal onClose={() => setAddingOther(false)} />}

      {isManagement && <p className="text-[11px] text-slate-400">Laporan jualan bulanan dan tahunan ada di Pusat Laporan.</p>}
    </div>
  );
}
