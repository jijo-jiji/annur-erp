import React, { useEffect, useState } from 'react';
import { X, Play, Eye, Plus, Tag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { billingApi } from '../api/client';
import { FORM_LABELS, today } from './studentShared';

export const money = (v) => `RM ${Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white';
const APPROVERS = ['SUPERVISOR', 'MANAGEMENT'];

export const discountValue = (d) => (d.mode === 'PERCENT' ? `${Number(d.value)}%` : money(d.value));

export function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-3 text-xs max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Monthly run: preview who will be invoiced this month, then raise the invoices in one go
export function MonthlyRunPanel() {
  const { billingAction } = useApp();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun) => {
    setBusy(true);
    try {
      const res = dryRun
        ? await billingApi.monthlyRun(month, true)
        : await billingAction(() => billingApi.monthlyRun(month, false), (r) => `${r.created} invois bulanan dijana.`);
      setResult(res);
    } catch {
      // toast shown by billingAction; a failed preview just leaves the old result
    } finally {
      setBusy(false);
    }
  };

  // Preview automatically when the month changes
  useEffect(() => {
    let cancelled = false;
    billingApi.monthlyRun(month, true).then((r) => { if (!cancelled) setResult(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [month]);

  const billed = result?.rows.filter((r) => r.result !== 'SKIPPED') || [];
  const skipped = result?.rows.filter((r) => r.result === 'SKIPPED') || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Jana Invois Bulanan</h3>
          <p className="text-slate-500 max-w-xl">
            Invois dijana untuk pelajar bulanan aktif yang belum ada invois bagi bulan itu. Yuran ikut pakej atau kadar khas,
            ditolak diskaun tetap dan kredit pelajar. Pelajar ditangguh dan walk-in tidak dibil. Selamat dijalankan semula: pelajar yang sudah dibil dilangkau.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="font-semibold text-slate-700">Bulan
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${input} mt-1`} />
          </label>
          <button onClick={() => run(true)} disabled={busy} className="px-3 py-2 rounded-xl border border-slate-200 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-60"><Eye className="w-3.5 h-3.5" /> Semak</button>
          <button onClick={() => run(false)} disabled={busy || !result?.ready} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50">
            <Play className="w-3.5 h-3.5" /> Jana {result?.ready || 0} invois
          </button>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Sedia dijana', result.ready],
              ['Dijana', result.created],
              ['Dilangkau', result.skipped],
              ['Jumlah dibil', money(result.total_billed)],
            ].map(([l, v]) => (
              <div key={l} className="p-3 rounded-xl bg-slate-50 border border-slate-200"><span className="text-slate-500 block">{l}</span><strong className="text-base text-slate-900">{v}</strong></div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]">
                <tr><th className="py-2 px-3">Pelajar</th><th className="px-3">Subjek</th><th className="px-3">Yuran</th><th className="px-3">Diskaun</th><th className="px-3">Kredit</th><th className="px-3">Perlu Dibayar</th><th className="px-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {billed.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">Tiada pelajar untuk dibil bagi bulan ini.</td></tr>}
                {billed.map((r) => (
                  <tr key={r.student_id}>
                    <td className="py-2 px-3 font-semibold">{r.name}<div className="text-[10px] text-slate-400 font-normal">{r.student_code} • {FORM_LABELS[r.form_level] || r.form_level}</div></td>
                    <td className="px-3">{r.subjects}</td>
                    <td className="px-3">{money(r.monthly_fee)}</td>
                    <td className="px-3">{Number(r.discount) > 0 ? <span className="text-indigo-700">-{money(r.discount)} <span className="text-[10px]">{r.discount_name}</span></span> : '-'}
                      {r.discount_note && <div className="text-[10px] text-amber-700">{r.discount_note}</div>}</td>
                    <td className="px-3">{Number(r.credit) > 0 ? <span className="text-emerald-700">-{money(r.credit)}</span> : '-'}</td>
                    <td className="px-3 font-bold">{money(r.balance)}</td>
                    <td className="px-3">{r.result === 'CREATED' ? <span className="text-emerald-700 font-semibold">{r.invoice_number}</span> : <span className="text-slate-500">Sedia</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {skipped.length > 0 && (
            <details className="text-slate-600">
              <summary className="cursor-pointer font-semibold">Dilangkau ({skipped.length})</summary>
              <ul className="mt-2 space-y-1">
                {skipped.map((r) => <li key={r.student_id}>{r.name} ({r.student_code}): {r.reason}</li>)}
              </ul>
            </details>
          )}
          <p className="text-[11px] text-slate-400">Untuk menjana secara automatik setiap 1hb, jadualkan arahan <code>python manage.py generate_monthly_invoices</code> pada pelayan.</p>
        </>
      )}
    </div>
  );
}

const EMPTY_DISCOUNT = { name: '', code: '', mode: 'FIXED', value: '', recurring: false, valid_from: '', valid_until: '', max_uses: '', is_active: true };

// Discount types and voucher codes; Supervisor / Management maintain them
export function DiscountsPanel({ currentRole, discounts, onChanged }) {
  const { billingAction } = useApp();
  const [editing, setEditing] = useState(null);
  const canEdit = APPROVERS.includes(currentRole);

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...editing };
    ['valid_from', 'valid_until', 'max_uses'].forEach((k) => { if (payload[k] === '') payload[k] = null; });
    try {
      await billingAction(() => billingApi.saveDiscount(payload), 'Diskaun disimpan.');
      setEditing(null);
      onChanged();
    } catch { /* toast shown */ }
  };

  const toggle = (d) => billingAction(() => billingApi.saveDiscount({ id: d.id, is_active: !d.is_active }), d.is_active ? 'Diskaun dinyahaktifkan.' : 'Diskaun diaktifkan.')
    .then(onChanged).catch(() => {});
  const remove = (d) => billingAction(() => billingApi.deleteDiscount(d.id), 'Diskaun dipadam.').then(onChanged).catch(() => {});

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Diskaun & Kod Baucar</h3>
          <p className="text-slate-500">Diskaun tetap (cth. adik-beradik) diberi kepada pelajar dalam profil dan ditolak setiap bulan. Kod sekali guna dimasukkan pada invois. Diskaun hanya untuk yuran bulanan, bukan yuran pendaftaran.</p>
        </div>
        {canEdit && <button onClick={() => setEditing(EMPTY_DISCOUNT)} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Diskaun Baharu</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]">
            <tr><th className="py-2 px-3">Jenis</th><th className="px-3">Kod</th><th className="px-3">Nilai</th><th className="px-3">Guna</th><th className="px-3">Tempoh</th><th className="px-3">Digunakan</th><th className="px-3">Status</th>{canEdit && <th className="px-3 text-right">Tindakan</th>}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {discounts.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">Belum ada diskaun.</td></tr>}
            {discounts.map((d) => (
              <tr key={d.id} className={d.is_active ? '' : 'text-slate-400'}>
                <td className="py-2 px-3 font-semibold">{d.name}</td>
                <td className="px-3 font-mono">{d.code}</td>
                <td className="px-3 font-bold">{discountValue(d)}</td>
                <td className="px-3">{d.recurring ? 'Tetap setiap bulan' : 'Sekali (kod invois)'}</td>
                <td className="px-3">{d.valid_from || d.valid_until ? `${d.valid_from || '…'} hingga ${d.valid_until || '…'}` : 'Tiada had'}</td>
                <td className="px-3">{d.used_count}{d.max_uses ? ` / ${d.max_uses}` : ''}</td>
                <td className="px-3">{d.is_active ? <span className="text-emerald-700 font-semibold">Aktif</span> : 'Tidak aktif'}</td>
                {canEdit && (
                  <td className="px-3 text-right space-x-1 whitespace-nowrap">
                    <button onClick={() => setEditing({ ...EMPTY_DISCOUNT, ...d, valid_from: d.valid_from || '', valid_until: d.valid_until || '', max_uses: d.max_uses ?? '' })} className="px-2 py-1 rounded-lg bg-slate-100 font-semibold cursor-pointer">Edit</button>
                    <button onClick={() => toggle(d)} className="px-2 py-1 rounded-lg bg-slate-100 font-semibold cursor-pointer">{d.is_active ? 'Nyahaktif' : 'Aktifkan'}</button>
                    {d.used_count === 0 && <button onClick={() => remove(d)} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 font-semibold cursor-pointer">Padam</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit Diskaun' : 'Diskaun Baharu'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            <label className="block font-semibold text-slate-700">Jenis diskaun *
              <input required placeholder="cth. Adik-beradik, Anak yatim, Promosi Merdeka" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`${input} mt-1`} />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="font-semibold text-slate-700">Kod baucar *
                <input required value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} className={`${input} mt-1 font-mono`} />
              </label>
              <label className="font-semibold text-slate-700">Jenis nilai
                <select value={editing.mode} onChange={(e) => setEditing({ ...editing, mode: e.target.value })} className={`${input} mt-1`}><option value="FIXED">RM</option><option value="PERCENT">%</option></select>
              </label>
              <label className="font-semibold text-slate-700">Nilai *
                <input required type="number" step="0.01" min="0.01" max={editing.mode === 'PERCENT' ? 100 : undefined} value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} className={`${input} mt-1`} />
              </label>
            </div>
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              <input type="checkbox" checked={editing.recurring} onChange={(e) => setEditing({ ...editing, recurring: e.target.checked })} /> Diskaun tetap (diberi kepada pelajar, ditolak setiap bulan)
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="font-semibold text-slate-700">Sah dari<input type="date" value={editing.valid_from} onChange={(e) => setEditing({ ...editing, valid_from: e.target.value })} className={`${input} mt-1`} /></label>
              <label className="font-semibold text-slate-700">Hingga<input type="date" value={editing.valid_until} onChange={(e) => setEditing({ ...editing, valid_until: e.target.value })} className={`${input} mt-1`} /></label>
              <label className="font-semibold text-slate-700">Had guna<input type="number" min="1" placeholder="Tiada had" value={editing.max_uses} onChange={(e) => setEditing({ ...editing, max_uses: e.target.value })} className={`${input} mt-1`} /></label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer">Simpan</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Voucher code and student credit for one invoice
export function InvoiceAdjustModal({ invoice, onClose }) {
  const { billingAction } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (call, msg) => {
    setBusy(true);
    try { await billingAction(call, msg); onClose(); } catch { /* toast shown */ } finally { setBusy(false); }
  };
  const credit = Math.min(Number(invoice.student_credit || 0), Number(invoice.balance_due || 0));
  const canDiscount = !invoice.discount && Number(invoice.discount_amount) === 0 && Number(invoice.monthly_fee) > 0;

  return (
    <Modal title="Diskaun & Kredit" subtitle={`${invoice.student_name} • ${invoice.invoice_number} • baki ${money(invoice.balance_due)}`} onClose={onClose}>
      {canDiscount ? (
        <form onSubmit={(e) => { e.preventDefault(); run(() => billingApi.invoiceAction(invoice.id, 'apply_discount', { code }), 'Diskaun digunakan.'); }} className="space-y-2">
          <label className="block font-semibold text-slate-700 flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Kod baucar
            <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${input} mt-1 font-mono`} />
          </label>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer disabled:opacity-60">Guna kod</button>
        </form>
      ) : (
        <p className="p-2 rounded-lg bg-slate-50 text-slate-600">{invoice.discount_remarks ? `Diskaun sudah digunakan: ${invoice.discount_remarks} (-${money(invoice.discount_amount)})` : 'Invois ini tiada yuran bulanan untuk didiskaun.'}</p>
      )}
      <div className="pt-3 border-t border-slate-100 space-y-2">
        <p className="font-semibold text-slate-700">Kredit pelajar: {money(invoice.student_credit)}</p>
        {credit > 0 ? (
          <button onClick={() => run(() => billingApi.invoiceAction(invoice.id, 'apply_credit'), `Kredit ${money(credit)} ditolak.`)} disabled={busy}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer disabled:opacity-60">Tolak {money(credit)} daripada baki</button>
        ) : <p className="text-slate-500">Tiada kredit untuk digunakan.</p>}
      </div>
    </Modal>
  );
}

// Charges outside the monthly fee, e.g. a seminar
export function OtherInvoiceModal({ onClose }) {
  const { students, billingAction } = useApp();
  const [form, setForm] = useState({ student: '', description: '', monthly_fee: '' });
  const active = students.filter((s) => ['ACTIVE', 'ON_HOLD'].includes(s.status));
  const submit = async (e) => {
    e.preventDefault();
    try {
      await billingAction(() => billingApi.createInvoice(form), (inv) => `Invois ${inv.invoice_number} dijana.`);
      onClose();
    } catch { /* toast shown */ }
  };
  return (
    <Modal title="Invois Lain" subtitle="Caj selain yuran bulanan, cth. seminar atau buku. Tarikh akhir 7 hari." onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block font-semibold text-slate-700">Pelajar *
          <select required value={form.student} onChange={(e) => setForm({ ...form, student: e.target.value })} className={`${input} mt-1`}>
            <option value="">Pilih pelajar</option>
            {active.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.student_id})</option>)}
          </select>
        </label>
        <label className="block font-semibold text-slate-700">Keterangan *
          <input required placeholder="cth. Seminar Teknik Menjawab SPM" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${input} mt-1`} />
        </label>
        <label className="block font-semibold text-slate-700">Jumlah (RM) *
          <input required type="number" step="0.01" min="0.01" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} className={`${input} mt-1`} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
          <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer">Jana Invois</button>
        </div>
      </form>
    </Modal>
  );
}
