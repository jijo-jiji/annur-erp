import React, { useCallback, useEffect, useState } from 'react';
import { Calculator, MessageSquare, Printer, X, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { teacherPayApi } from '../api/client';
import { downloadCsv, today, waLink } from './studentShared';

const money = (v) => `RM ${Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (iso) => new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' });
const STATUS_CLS = {
  DRAFT: 'bg-slate-100 text-slate-700',
  VERIFIED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  PAID: 'bg-indigo-100 text-indigo-800',
};
const METHODS = [
  { id: 'BANK_TRANSFER', label: 'Pindahan Bank' },
  { id: 'CASH', label: 'Tunai' },
  { id: 'CHEQUE', label: 'Cek' },
];
const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white';

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl border border-slate-200 space-y-3 text-xs max-h-[92vh] overflow-y-auto">
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

const payslipText = (p, sessions) => [
  `Assalamualaikum ${p.teacher_name}, slip gaji Pusat Tuisyen An Nur bagi ${monthLabel(p.month)}:`,
  `Sesi mengajar: ${p.sessions}`,
  `Jumlah dikira: ${money(p.calculated_amount)}`,
  Number(p.adjustment) ? `Pelarasan: ${money(p.adjustment)} (${p.adjustment_note})` : '',
  `Jumlah bayaran: ${money(p.amount_payable)}`,
  p.status === 'PAID' ? `Dibayar ${p.paid_date} melalui ${p.payment_method_label}${p.payment_reference ? ` (rujukan ${p.payment_reference})` : ''}.` : 'Status: diluluskan, bayaran akan dibuat.',
  sessions.length ? `Butiran: ${sessions.map((s) => `${s.date} ${s.class_code}`).join(', ')}` : '',
  'Terima kasih.',
].filter(Boolean).join('\n');

function Payslip({ payment, onClose }) {
  const [sessions, setSessions] = useState([]);
  useEffect(() => { teacherPayApi.sessions(payment.id).then(setSessions).catch(() => setSessions([])); }, [payment.id]);
  return (
    <Modal title="Slip Gaji Guru" subtitle={`${payment.teacher_name} • ${monthLabel(payment.month)}`} onClose={onClose}>
      <div className="text-center border-b pb-3">
        <div className="font-bold text-slate-900">PUSAT TUISYEN AN NUR</div>
        <div className="text-[11px] text-slate-500">Tingkat 1&2, PT 105 Seksyen 23, Jalan Telipot, 15150 Kota Bharu</div>
      </div>
      <div className="space-y-1">
        {[
          ['Guru', `${payment.teacher_name} (${payment.teacher_code})`],
          ['Bulan', monthLabel(payment.month)],
          ['Kadar semasa / sesi', money(payment.rate_per_session)],
          ['Bank', [payment.bank_name, payment.bank_account].filter(Boolean).join(' ') || '-'],
          ['Disahkan oleh', payment.verified_by || '-'],
          ['Diluluskan oleh', payment.decided_by || '-'],
          ['Status', payment.status_label],
        ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><strong className="text-right">{v}</strong></div>)}
      </div>
      <table className="w-full text-left border-t">
        <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-1">Tarikh</th><th>Kelas</th><th>Peranan</th><th className="text-right">RM</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {sessions.map((s, i) => (
            <tr key={i}><td className="py-1">{s.date}</td><td>{s.class_code}</td><td>{s.role}{s.for_teacher ? ` (${s.for_teacher})` : ''}</td><td className="text-right">{Number(s.amount).toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="border-t pt-2 space-y-1">
        <div className="flex justify-between"><span>Jumlah dikira ({payment.sessions} sesi)</span><strong>{money(payment.calculated_amount)}</strong></div>
        {Number(payment.adjustment) !== 0 && <div className="flex justify-between"><span>Pelarasan: {payment.adjustment_note}</span><strong>{money(payment.adjustment)}</strong></div>}
        <div className="flex justify-between text-sm"><span className="font-bold">JUMLAH BAYARAN</span><strong className="text-indigo-900">{money(payment.amount_payable)}</strong></div>
        {payment.status === 'PAID' && <p className="text-slate-600">Dibayar {payment.paid_date} • {payment.payment_method_label}{payment.payment_reference ? ` • ${payment.payment_reference}` : ''} • oleh {payment.paid_by}</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {['APPROVED', 'PAID'].includes(payment.status) && payment.teacher_phone && (
          <a href={waLink(payment.teacher_phone, payslipText(payment, sessions))} target="_blank" rel="noreferrer"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold inline-flex items-center gap-1"><MessageSquare className="w-4 h-4" /> WhatsApp Slip</a>
        )}
        <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer"><Printer className="w-4 h-4" /> Cetak / PDF</button>
      </div>
    </Modal>
  );
}

export default function TeacherPayrollView({ currentRole }) {
  const { showToast, teachers } = useApp();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [teacherFilter, setTeacherFilter] = useState('');
  const [payments, setPayments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // { type, payment }
  const [form, setForm] = useState({});
  const isManagement = currentRole === 'MANAGEMENT';

  // One teacher: full payment history across months; otherwise the chosen month
  const load = useCallback(() => {
    const params = teacherFilter ? { teacher: teacherFilter } : { month };
    teacherPayApi.payments(params).then(setPayments).catch(() => setPayments([]));
  }, [month, teacherFilter]);
  useEffect(() => { load(); }, [load]);

  const run = async (call, message) => {
    setBusy(true);
    try {
      const res = await call();
      showToast(typeof message === 'function' ? message(res) : message);
      setDialog(null);
      load();
      return res;
    } catch (err) {
      const detail = err.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '';
      showToast(detail || err.message || 'Ralat.', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const open = (type, payment, preset = {}) => { setDialog({ type, payment }); setForm(preset); };
  const totals = payments.reduce((s, p) => ({ sessions: s.sessions + p.sessions, amount: s.amount + Number(p.amount_payable) }), { sessions: 0, amount: 0 });
  const counts = payments.reduce((c, p) => ({ ...c, [p.status]: (c[p.status] || 0) + 1 }), {});

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gaji Guru</h2>
          <p className="text-slate-500 max-w-2xl">Dikira automatik daripada Kehadiran Guru (kadar guru yang mengajar). Supervisor semak dan sahkan; Management lulus atau tolak; kemudian rekod bayaran dan hantar slip melalui WhatsApp.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="font-semibold text-slate-700">Bulan
            <input type="month" value={month} disabled={Boolean(teacherFilter)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="font-semibold text-slate-700">Sejarah guru
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className={`${input} mt-1`}>
              <option value="">Semua guru (bulan dipilih)</option>
              {teachers.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </label>
          {!teacherFilter && (
            <button onClick={() => run(() => teacherPayApi.calculate(month), (r) => `Gaji ${monthLabel(month)} dikira: ${r.updated} dikemas kini${r.kept ? `, ${r.kept} sudah disahkan (tidak diubah)` : ''}.`)}
              disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
              <Calculator className="w-4 h-4" /> Kira daripada kehadiran
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['Jumlah bayaran', money(totals.amount)],
          ['Jumlah sesi', totals.sessions],
          ['Menunggu pengesahan', counts.DRAFT || 0],
          ['Menunggu kelulusan', counts.VERIFIED || 0],
          ['Telah dibayar', counts.PAID || 0],
        ].map(([l, v]) => (
          <div key={l} className="p-4 bg-white rounded-2xl border border-slate-200"><span className="text-slate-500 font-semibold block">{l}</span><span className="text-xl font-black text-slate-900">{v}</span></div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex justify-end">
          <button onClick={() => downloadCsv(`gaji-guru-${teacherFilter ? 'sejarah' : month}.csv`,
            ['Bulan', 'Kod', 'Guru', 'Sesi', 'Dikira', 'Pelarasan', 'Sebab Pelarasan', 'Perlu Dibayar', 'Status', 'Disahkan Oleh', 'Diluluskan/Ditolak Oleh', 'Ulasan', 'Tarikh Bayar', 'Kaedah', 'Rujukan', 'Catatan'],
            payments.map((p) => [p.month.slice(0, 7), p.teacher_code, p.teacher_name, p.sessions, p.calculated_amount, p.adjustment, p.adjustment_note, p.amount_payable,
              p.status_label, p.verified_by, p.decided_by, p.decision_comment, p.paid_date || '', p.payment_method_label || '', p.payment_reference, p.remarks]))}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[860px]">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]">
              <tr><th className="py-2 px-3">Guru</th><th className="px-3">Bulan</th><th className="px-3">Sesi</th><th className="px-3">Dikira</th><th className="px-3">Pelarasan</th><th className="px-3">Perlu Dibayar</th><th className="px-3">Status</th><th className="px-3 text-right">Tindakan</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-400">Tiada rekod gaji. Rekod Kehadiran Guru dahulu, kemudian tekan "Kira daripada kehadiran".</td></tr>}
              {payments.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="py-2 px-3 font-semibold">{p.teacher_name} <span className="text-slate-400">({p.teacher_code})</span>
                    <div className="text-[10px] text-slate-500 font-normal">{p.teacher_type === 'REPLACEMENT' ? 'Guru ganti' : 'Guru tetap'}</div></td>
                  <td className="px-3">{monthLabel(p.month)}</td>
                  <td className="px-3">{p.sessions}</td>
                  <td className="px-3">{money(p.calculated_amount)}</td>
                  <td className="px-3">{Number(p.adjustment) ? <>{money(p.adjustment)}<div className="text-[10px] text-slate-500">{p.adjustment_note}</div></> : '-'}</td>
                  <td className="px-3 font-bold">{money(p.amount_payable)}</td>
                  <td className="px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[p.status]}`}>{p.status_label}</span>
                    {p.verified_by && <div className="text-[10px] text-slate-500 mt-0.5">Disahkan: {p.verified_by}</div>}
                    {p.decided_by && <div className="text-[10px] text-slate-500">{p.status === 'REJECTED' ? 'Ditolak' : 'Diluluskan'}: {p.decided_by}</div>}
                    {p.decision_comment && <div className="text-[10px] text-slate-500">"{p.decision_comment}"</div>}
                    {p.paid_date && <div className="text-[10px] text-slate-500">Dibayar {p.paid_date}</div>}
                  </td>
                  <td className="px-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {['DRAFT', 'REJECTED'].includes(p.status) && (
                        <button onClick={() => open('adjust', p, { adjustment: p.adjustment, adjustment_note: p.adjustment_note, remarks: p.remarks })} className="px-2 py-1 rounded-lg bg-slate-100 font-semibold cursor-pointer">Pelarasan</button>
                      )}
                      {p.status === 'DRAFT' && (
                        <button onClick={() => run(() => teacherPayApi.action(p.id, 'verify'), `Gaji ${p.teacher_name} disahkan.`)} disabled={busy} className="px-2 py-1 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer">Sahkan</button>
                      )}
                      {p.status === 'VERIFIED' && isManagement && (
                        <>
                          <button onClick={() => open('approve', p, { comment: '' })} className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer">Lulus</button>
                          <button onClick={() => open('reject', p, { comment: '' })} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-semibold cursor-pointer">Tolak</button>
                        </>
                      )}
                      {p.status === 'APPROVED' && (
                        <button onClick={() => open('paid', p, { paid_date: today(), payment_method: 'BANK_TRANSFER', payment_reference: '' })} className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-semibold cursor-pointer">Rekod Bayaran</button>
                      )}
                      <button onClick={() => open('payslip', p)} className="px-2 py-1 rounded-lg bg-slate-100 font-semibold inline-flex items-center gap-1 cursor-pointer"><Printer className="w-3 h-3" /> Slip</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.type === 'payslip' && <Payslip payment={dialog.payment} onClose={() => setDialog(null)} />}

      {dialog?.type === 'adjust' && (
        <Modal title="Pelarasan Gaji" subtitle={`${dialog.payment.teacher_name} • dikira ${money(dialog.payment.calculated_amount)}`} onClose={() => setDialog(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(() => teacherPayApi.action(dialog.payment.id, 'adjust', form), 'Pelarasan disimpan.'); }} className="space-y-3">
            <p className="text-slate-500">Tambah (+) untuk kurang bayar sebelum ini, tolak (-) untuk lebih bayar.</p>
            <label className="block font-semibold text-slate-700">Pelarasan (RM)
              <input type="number" step="0.01" value={form.adjustment} onChange={(e) => setForm({ ...form, adjustment: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="block font-semibold text-slate-700">Sebab pelarasan
              <input value={form.adjustment_note} onChange={(e) => setForm({ ...form, adjustment_note: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="block font-semibold text-slate-700">Catatan
              <textarea rows="2" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`${input} mt-1`} />
            </label>
            <p className="font-semibold">Jumlah baharu: {money(Number(dialog.payment.calculated_amount) + Number(form.adjustment || 0))}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer">Simpan</button>
            </div>
          </form>
        </Modal>
      )}

      {['approve', 'reject'].includes(dialog?.type) && (
        <Modal title={dialog.type === 'approve' ? 'Luluskan Gaji' : 'Tolak Gaji'} subtitle={`${dialog.payment.teacher_name} • ${money(dialog.payment.amount_payable)}`} onClose={() => setDialog(null)}>
          <form onSubmit={(e) => {
            e.preventDefault();
            run(() => teacherPayApi.action(dialog.payment.id, dialog.type, form), dialog.type === 'approve' ? 'Gaji diluluskan. Hantar slip melalui WhatsApp.' : 'Gaji ditolak dan dikembalikan kepada Supervisor.');
          }} className="space-y-3">
            <label className="block font-semibold text-slate-700">{dialog.type === 'approve' ? 'Ulasan (pilihan)' : 'Sebab penolakan *'}
              <textarea rows="2" required={dialog.type === 'reject'} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} className={`${input} mt-1`} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" disabled={busy} className={`px-4 py-2 rounded-xl text-white font-bold cursor-pointer ${dialog.type === 'approve' ? 'bg-emerald-600' : 'bg-rose-600'}`}>{dialog.type === 'approve' ? 'Luluskan' : 'Tolak'}</button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.type === 'paid' && (
        <Modal title="Rekod Bayaran Gaji" subtitle={`${dialog.payment.teacher_name} • ${money(dialog.payment.amount_payable)} • ${[dialog.payment.bank_name, dialog.payment.bank_account].filter(Boolean).join(' ') || 'tiada maklumat bank'}`} onClose={() => setDialog(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(() => teacherPayApi.action(dialog.payment.id, 'mark_paid', form), 'Bayaran gaji direkodkan.'); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="font-semibold text-slate-700">Tarikh bayar<input type="date" required value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} className={`${input} mt-1`} /></label>
              <label className="font-semibold text-slate-700">Kaedah
                <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className={`${input} mt-1`}>{METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
              </label>
            </div>
            <label className="block font-semibold text-slate-700">No. rujukan<input value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} className={`${input} mt-1`} /></label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer">Batal</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer">Simpan</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
