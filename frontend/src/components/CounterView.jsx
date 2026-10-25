import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Info, Wallet } from 'lucide-react';
import { billingApi, checklistApi } from '../api/client';
import { describeError } from '../lib/apiErrors';
import { can } from '../lib/permissions';
import { clock, date, monthLabel, rm, todayISO } from '../lib/format';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, Checkbox, cx, EmptyState, Input, PageHeader, Stat, Table, Tabs, Td, Textarea, Th, useToast } from './ui';

// Kaunter harian (Phase D): the day's cash close and the office checklist, kept for every day.
// Admin closes the counter and ticks the checklist; Supervisor or Management verifies the close (or returns it for a
// recount) and checks the day's list. The server keeps the rules (billing/counter.py, core/checklist.py).

const CLOSE_TONE = { CLOSED: 'amber', RETURNED: 'red', VERIFIED: 'green' };
const num = (v) => Number(v) || 0;
const signed = (v) => `${num(v) > 0 ? '+' : num(v) < 0 ? '−' : ''}${rm(Math.abs(num(v)))}`;
const lastMonths = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});

export default function CounterView({ role }) {
  const query = new URLSearchParams(window.location.hash.split('?')[1]);
  const [tab, setTab] = useState(query.get('tab') === 'checklist' ? 'checklist' : 'close');
  const [day, setDay] = useState(query.get('date') || todayISO());
  return (
    <>
      <PageHeader
        title="Kaunter harian"
        description="Tutup kaunter dan kira tunai, serta senarai semak pejabat. Setiap hari disimpan untuk semakan."
        actions={<Input type="date" aria-label="Tarikh" value={day} max={todayISO()} onChange={(e) => e.target.value && setDay(e.target.value)} />}
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[{ value: 'close', label: 'Tutup kaunter' }, { value: 'checklist', label: 'Senarai semak' }]}
      />
      {/* each date gets its own panel, so nothing from the previous date is shown while the new one loads */}
      {tab === 'close' ? <CashClose key={day} day={day} onPickDay={setDay} role={role} /> : <Checklist key={day} day={day} role={role} />}
    </>
  );
}

// ---- Tutup kaunter ------------------------------------------------------------------------------------------------

function CashClose({ day, onPickDay, role }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(day.slice(0, 7));
  const [history, setHistory] = useState(null);
  const [deciding, setDeciding] = useState(null); // 'verify' | 'return'

  const load = useCallback(() => {
    billingApi.cashClose(day).then(setData).catch((err) => notify(describeError(err), 'error'));
  }, [day, notify]);
  const loadHistory = useCallback(() => {
    billingApi.closeHistory(month).then(setHistory).catch(() => setHistory({ days: [] }));
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const after = (fresh, message) => {
    setData(fresh);
    loadHistory();
    notify(message);
  };

  if (!data) return <p className="text-sm text-gray-500">Memuatkan…</p>;
  const { live, close } = data;
  const methods = Object.entries(live.by_method);
  const nonCash = methods.filter(([code]) => code !== 'CASH').reduce((a, [, m]) => a + num(m.amount), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Resit hari ini" value={live.receipt_count} hint={live.cancelled_count ? `${live.cancelled_count} dibatalkan, tidak dikira` : date(day)} />
        <Stat label="Jumlah kutipan" value={rm(live.receipts_total)} />
        <Stat label="Tunai" value={rm(live.cash_receipts)} hint="Perlu ada dalam laci" />
        <Stat label="QR, pindahan & kad" value={rm(nonCash)} hint="Semak dengan penyata bank" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Mengikut kaedah bayaran" description={`Resit sah bertarikh ${date(day)}`} />
          <Table>
            <thead><tr><Th>Kaedah</Th><Th className="text-right">Resit</Th><Th className="text-right">Amaun</Th></tr></thead>
            <tbody>
              {methods.map(([code, m]) => (
                <tr key={code}>
                  <Td>{m.label}</Td>
                  <Td className="text-right tnum">{m.count}</Td>
                  <Td className="text-right tnum">{rm(m.amount)}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td>Jumlah</Td>
                <Td className="text-right tnum">{live.receipt_count}</Td>
                <Td className="text-right tnum">{rm(live.receipts_total)}</Td>
              </tr>
            </tbody>
          </Table>
          <p className="border-t border-gray-100 px-5 py-3 text-[13px] text-gray-500">
            Senarai resit: <a className="text-brand-700 hover:underline" href={`#/billing?tab=receipts&from=${day}&to=${day}`}>Yuran & resit</a>
          </p>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {close && <CloseStatus close={close} live={live} />}
          {data.can_close ? (
            <CloseForm key={`${day}-${close?.closed_at || 'new'}`} day={day} close={close} cashReceipts={num(live.cash_receipts)}
              onSaved={(fresh) => after(fresh, `Kaunter ${date(day)} ditutup.`)} />
          ) : (
            <p className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600">Tutup kaunter hari ini sudah disahkan dan tidak boleh diubah.</p>
          )}
          {data.can_verify && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={CheckCircle2} onClick={() => setDeciding('verify')}>Sahkan tutup kaunter</Button>
              <Button variant="danger" onClick={() => setDeciding('return')}>Kembalikan untuk kira semula</Button>
            </div>
          )}
          {close?.status === 'CLOSED' && !data.can_verify && can(role, 'counter.verify') && (
            <p className="text-[13px] text-gray-500">Anda menutup kaunter ini sendiri, jadi ia perlu disahkan oleh orang lain.</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Sejarah tutup kaunter"
          description="Hari yang ada resit atau sudah ditutup. Pilih satu hari untuk melihatnya."
          actions={
            <select aria-label="Bulan" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:border-brand-600 focus:outline-none">
              {[...new Set([month, ...lastMonths(12)])].sort().reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          }
        />
        {!history ? <p className="px-5 py-4 text-sm text-gray-500">Memuatkan…</p> : history.days.length === 0 ? (
          <EmptyState icon={Wallet} title="Tiada resit atau tutup kaunter bulan ini" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tarikh</Th><Th className="text-right">Kutipan</Th><Th className="hidden text-right sm:table-cell">Tunai dijangka</Th>
                <Th className="hidden text-right sm:table-cell">Tunai dikira</Th><Th className="text-right">Beza</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {history.days.map((d) => {
                const c = d.close;
                return (
                  <tr key={d.date} className={cx('cursor-pointer hover:bg-gray-50', d.date === day && 'bg-brand-50/50')} onClick={() => onPickDay(d.date)}>
                    <Td className="whitespace-nowrap">
                      <button type="button" className="font-medium text-gray-900 hover:text-brand-700 hover:underline" onClick={() => onPickDay(d.date)}>{date(d.date)}</button>
                      <p className="text-[13px] text-gray-500">{d.receipt_count} resit</p>
                    </Td>
                    <Td className="text-right tnum">{rm(d.receipts_total)}</Td>
                    <Td className="hidden text-right tnum sm:table-cell">{c ? rm(c.cash_expected) : '—'}</Td>
                    <Td className="hidden text-right tnum sm:table-cell">{c ? rm(c.cash_counted) : '—'}</Td>
                    <Td className={cx('text-right tnum', c && num(c.difference) !== 0 && 'font-semibold text-red-700')}>{c ? signed(c.difference) : '—'}</Td>
                    <Td>
                      {c ? <Badge tone={CLOSE_TONE[c.status]}>{c.status_label}</Badge> : <Badge tone={d.date === todayISO() ? 'neutral' : 'red'}>Belum ditutup</Badge>}
                      {c?.changed_after_close && <Badge tone="amber" className="ml-1">Berubah</Badge>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {deciding && (
        <FormModal
          title={deciding === 'verify' ? `Sahkan tutup kaunter ${date(day)}` : `Kembalikan tutup kaunter ${date(day)}`}
          description={deciding === 'verify'
            ? `Tunai dikira ${rm(close.cash_counted)}, dijangka ${rm(close.cash_expected)}. Selepas disahkan, hari ini tidak boleh ditutup semula.`
            : 'Admin perlu mengira semula dan menutup kaunter sekali lagi.'}
          danger={deciding === 'return'}
          submitLabel={deciding === 'verify' ? 'Sahkan' : 'Kembalikan'}
          fields={[{ name: 'note', label: deciding === 'verify' ? 'Catatan (pilihan)' : 'Apa yang perlu disemak', type: 'textarea', required: deciding === 'return' }]}
          initial={{ note: '' }}
          onSubmit={async ({ note }) => {
            try {
              const fresh = deciding === 'verify' ? await billingApi.verifyClose(day, note.trim()) : await billingApi.returnClose(day, note.trim());
              after(fresh, deciding === 'verify' ? 'Tutup kaunter disahkan.' : 'Tutup kaunter dikembalikan untuk dikira semula.');
            } catch (err) {
              notify(describeError(err), 'error');
              throw err;
            }
          }}
          onClose={() => setDeciding(null)}
        />
      )}
    </div>
  );
}

function CloseStatus({ close, live }) {
  const diff = num(close.difference);
  return (
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={CLOSE_TONE[close.status]}>{close.status_label}</Badge>
        <p className="text-[13px] text-gray-500">Ditutup oleh {close.closed_by} · {date(String(close.closed_at).slice(0, 10))} {clock(close.closed_at)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-gray-500">Duit tukar awal</dt><dd className="tnum">{rm(close.opening_float)}</dd></div>
        <div><dt className="text-xs text-gray-500">Tunai dijangka</dt><dd className="tnum">{rm(close.cash_expected)}</dd></div>
        <div><dt className="text-xs text-gray-500">Tunai dikira</dt><dd className="tnum">{rm(close.cash_counted)}</dd></div>
        <div>
          <dt className="text-xs text-gray-500">Beza</dt>
          <dd className={cx('font-semibold tnum', diff !== 0 ? 'text-red-700' : 'text-emerald-700')}>{diff === 0 ? 'Tepat' : signed(diff)}</dd>
        </div>
      </dl>
      {close.note && <p className="mt-2 text-[13px] text-gray-600">Catatan: {close.note}</p>}
      {close.verified_by && (
        <p className={cx('mt-2 text-[13px]', close.status === 'RETURNED' ? 'text-red-700' : 'text-gray-600')}>
          {close.status === 'RETURNED' ? 'Dikembalikan' : close.status === 'VERIFIED' ? 'Disahkan' : 'Kali terakhir dikembalikan'} oleh {close.verified_by}
          {close.verify_note && `: “${close.verify_note}”`}
        </p>
      )}
      {close.changed_after_close && (
        <p className="mt-3 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Resit hari ini berubah selepas kaunter ditutup: kini {live.receipt_count} resit, {rm(live.receipts_total)} (tunai {rm(live.cash_receipts)});
            semasa ditutup {close.receipt_count} resit, {rm(close.receipts_total)} (tunai {rm(close.cash_receipts)}).
            {close.status === 'VERIFIED' ? ' Hari ini sudah disahkan; maklumkan Pengurusan.' : ' Tutup kaunter semula.'}
          </span>
        </p>
      )}
    </Card>
  );
}

function CloseForm({ day, close, cashReceipts, onSaved }) {
  const notify = useToast();
  const [opening, setOpening] = useState(close ? String(num(close.opening_float)) : '0');
  const [counted, setCounted] = useState(close ? String(num(close.cash_counted)) : '');
  const [note, setNote] = useState(close?.note || '');
  const [busy, setBusy] = useState(false);
  const expected = num(opening) + cashReceipts;
  const diff = counted === '' ? null : Math.round((num(counted) - expected) * 100) / 100;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved(await billingApi.closeCounter({ date: day, opening_float: opening || '0', cash_counted: counted, note: note.trim() }));
    } catch (err) {
      notify(describeError(err), 'error');
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader title={close ? 'Tutup semula' : 'Kira tunai & tutup kaunter'} description="Kira tunai dalam laci, termasuk duit tukar yang ada sebelum kutipan hari ini." />
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Duit tukar awal (RM)" type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} hint="Tunai dalam laci sebelum kutipan hari ini" />
          <Input label="Tunai dikira (RM)" type="number" min="0" step="0.01" required value={counted} onChange={(e) => setCounted(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600">Dijangka {rm(expected)} <span className="text-gray-400">(duit tukar + tunai {rm(cashReceipts)})</span></span>
          {diff !== null && (
            <span className={cx('font-semibold tnum', diff !== 0 ? 'text-red-700' : 'text-emerald-700')}>
              {diff === 0 ? 'Tepat' : `Beza ${signed(diff)}`}
            </span>
          )}
        </div>
        <Textarea label="Catatan" rows={2} value={note} onChange={(e) => setNote(e.target.value)} required={diff !== null && diff !== 0}
          hint={diff ? 'Terangkan sebab perbezaan tunai.' : undefined} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Menyimpan…' : close ? 'Tutup semula' : 'Tutup kaunter'}</Button>
      </form>
    </Card>
  );
}

// ---- Senarai semak harian -----------------------------------------------------------------------------------------

function Checklist({ day, role }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [checking, setChecking] = useState(false);
  const load = useCallback(() => {
    checklistApi.get(day).then(setData).catch((err) => notify(describeError(err), 'error'));
  }, [day, notify]);
  useEffect(() => { load(); }, [load]);

  const tick = async (item) => {
    setBusy(item.code);
    try {
      setData(await checklistApi.tick(day, item.code, !item.done));
    } catch (err) {
      notify(describeError(err), 'error');
    }
    setBusy(null);
  };

  if (!data) return <p className="text-sm text-gray-500">Memuatkan…</p>;
  const missing = data.items.filter((i) => !i.done);
  return (
    <Card>
      <CardHeader
        title={`Senarai semak ${date(day)}`}
        description={`${data.done}/${data.total} selesai${can(role, 'masterdata.approve') ? ' · Perkara dalam senarai diurus di Data induk → Senarai semak harian' : ''}`}
        actions={data.can_check && <Button variant="primary" icon={CheckCircle2} onClick={() => setChecking(true)}>Semak senarai</Button>}
      />
      {data.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Senarai semak kosong" description="Tambah perkara di Data induk → Senarai semak harian." />
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.items.map((item) => (
            <li key={item.code} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <Checkbox
                label={item.label}
                checked={item.done}
                disabled={!data.can_tick || busy === item.code}
                onChange={() => tick(item)}
                description={item.done ? `${item.by} · ${clock(item.at)}${item.note ? ` · ${item.note}` : ''}` : undefined}
              />
              {item.hint && (
                <span className="flex items-center gap-1.5 text-[13px] text-gray-500"><Info className="size-3.5" />{item.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.checked_by && (
        <p className="border-t border-gray-100 px-5 py-3 text-[13px] text-gray-600">
          Disemak oleh {data.checked_by} · {date(String(data.checked_at).slice(0, 10))} {clock(data.checked_at)}{data.check_note && `: “${data.check_note}”`}
        </p>
      )}
      {checking && (
        <FormModal
          title={`Semak senarai ${date(day)}`}
          description={missing.length ? `Belum ditanda: ${missing.map((i) => i.label).join(', ')}.` : 'Semua perkara sudah ditanda. Selepas disemak, senarai hari ini dikunci.'}
          submitLabel="Semak"
          fields={[{ name: 'note', label: missing.length ? 'Catatan (wajib kerana ada perkara belum ditanda)' : 'Catatan (pilihan)', type: 'textarea', required: missing.length > 0 }]}
          initial={{ note: '' }}
          onSubmit={async ({ note }) => {
            try {
              setData(await checklistApi.check(day, note.trim()));
              notify('Senarai semak disemak.');
            } catch (err) {
              notify(describeError(err), 'error');
              throw err;
            }
          }}
          onClose={() => setChecking(false)}
        />
      )}
    </Card>
  );
}
