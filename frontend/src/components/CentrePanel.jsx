import { useCallback, useEffect, useState } from 'react';
import { request } from '../api/client';
import { loadCentre } from '../lib/centre';
import { date } from '../lib/format';
import { Button, Card, CardHeader, EmptyState, Input, Textarea, useToast } from './ui';

const when = (iso) => (iso ? `${date(String(iso).slice(0, 10))} ${new Date(iso).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}` : '');

// The number WhatsApp links will use: country code, digits only (013-983 8085 becomes 60139838085)
function whatsappPreview(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `6${digits}`;
  return digits;
}

// The centre's own details, in one place (Management only). Receipts, vouchers, payslips, the login page
// and the messages to parents read them, so a change shows on the next document.
export default function CentrePanel() {
  const notify = useToast();
  const [f, setF] = useState(null);
  const [saved, setSaved] = useState(null);
  const [events, setEvents] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => Promise.all([request('/centre/profile/'), request('/centre/events/')])
    .then(([profile, history]) => { setF(profile); setSaved(profile); setEvents(history); })
    .catch(() => notify('Gagal memuat maklumat pusat.', 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  if (!f) return <p className="py-10 text-center text-sm text-gray-500">Memuatkan…</p>;
  const set = (name) => (e) => setF((v) => ({ ...v, [name]: e.target.value }));
  const dirty = Object.keys(f).some((k) => f[k] !== saved[k]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const changes = Object.fromEntries(Object.keys(f).filter((k) => f[k] !== saved[k]).map((k) => [k, f[k]]));
      await request('/centre/profile/', { method: 'PUT', body: JSON.stringify(changes) });
      await Promise.all([load(), loadCentre()]);
      notify('Maklumat pusat disimpan.');
    } catch (err) {
      const data = err?.data && typeof err.data === 'object' ? err.data : {};
      setErrors(data);
      notify(Object.values(data).flat().join(' ') || err.message || 'Ralat.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const field = (name, label, extra = {}) => (
    <Input label={label} value={f[name] ?? ''} onChange={set(name)} error={[].concat(errors[name] || []).join(' ') || undefined} {...extra} />
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader title="Maklumat pusat" description="Dipaparkan pada halaman log masuk, resit, baucar, slip gaji dan mesej kepada ibu bapa." />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {field('name', 'Nama pusat', { required: true })}
          {field('branch', 'Cawangan')}
          <div className="sm:col-span-2">
            <Textarea label="Alamat" required value={f.address ?? ''} onChange={set('address')} error={[].concat(errors.address || []).join(' ') || undefined} />
          </div>
          {field('phone', 'Telefon', { required: true })}
          {field('whatsapp', 'Nombor WhatsApp', { required: true, hint: f.whatsapp ? `Pautan WhatsApp menggunakan ${whatsappPreview(f.whatsapp)}.` : undefined })}
          {field('email', 'E-mel', { type: 'email' })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Cukai dan akaun bank" description="Dikosongkan sehingga pusat memberikannya. No. TIN dicetak pada resit, baucar dan slip gaji; maklumat bank ditambah pada mesej peringatan bayaran. Hanya kakitangan yang log masuk boleh melihatnya." />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {field('tin', 'No. TIN')}
          <span className="hidden sm:block" />
          {field('bank_name', 'Bank')}
          {field('bank_account', 'No. akaun bank')}
          {field('bank_holder', 'Nama pemegang akaun')}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        {dirty && <Button type="button" variant="ghost" onClick={() => { setF(saved); setErrors({}); }}>Buang perubahan</Button>}
        <Button type="submit" variant="primary" disabled={!dirty || busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
      </div>

      <Card>
        <CardHeader title="Sejarah perubahan" description="Siapa mengubah apa, dan bila." />
        {events.length === 0 ? <EmptyState title="Belum ada perubahan" /> : (
          <ul className="divide-y divide-gray-100">
            {events.slice(0, 15).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-gray-900">{e.label}</span>
                  <span className="text-gray-600">: <span className="text-gray-400 line-through">{e.old || '—'}</span> → {e.new || '—'}</span>
                </span>
                <span className="text-xs text-gray-500">{e.by ? `oleh ${e.by} · ` : ''}{when(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </form>
  );
}
