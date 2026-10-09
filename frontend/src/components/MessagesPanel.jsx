import { useCallback, useEffect, useState } from 'react';
import { request } from '../api/client';
import { loadMessages } from '../lib/messages';
import { Badge, Button, Card, CardHeader, Textarea, useToast } from './ui';

const fillWith = (text, samples) => text.replace(/\{(\w+)\}/g, (m, name) => (name in samples ? samples[name] : m));

// The wording of the WhatsApp messages (Management only). Staff still press send; the program only
// prepares the message. {Placeholders} are filled in by the screen; the original wording can be restored.
export default function MessagesPanel() {
  const notify = useToast();
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');

  const load = useCallback(() => request('/messages/')
    .then((data) => { setRows(data); setDrafts({}); })
    .catch(() => notify('Gagal memuat mesej.', 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  const act = async (row, call, message) => {
    setBusy(row.key);
    setErrors((e) => ({ ...e, [row.key]: '' }));
    try {
      await call();
      await Promise.all([load(), loadMessages()]);
      notify(message);
    } catch (err) {
      const text = [].concat(err?.data?.text || err?.message || 'Ralat.').join(' ');
      setErrors((e) => ({ ...e, [row.key]: text }));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Wording mesej WhatsApp"
          description="Sistem hanya menyediakan mesej dan membuka WhatsApp; kakitangan menekan hantar. Ubah ayat di bawah. Penanda dalam {kurungan} diisi oleh sistem semasa mesej dihantar, jadi kekalkan penanda yang anda perlukan."
        />
      </Card>
      {rows.map((row) => {
        const text = drafts[row.key] ?? row.text;
        const samples = Object.fromEntries(row.placeholders.map((p) => [p.name, p.sample]));
        const dirty = text !== row.text;
        return (
          <Card key={row.key}>
            <CardHeader
              title={row.label}
              description={`Digunakan di: ${row.where}`}
              actions={row.customised ? <Badge tone="blue">Diubah</Badge> : <Badge>Asal</Badge>}
            />
            <div className="space-y-3 p-5">
              <Textarea
                label="Teks mesej"
                rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
                value={text}
                onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                error={errors[row.key] || undefined}
              />
              <p className="text-[13px] text-gray-600">
                Penanda: {row.placeholders.map((p) => <span key={p.name} title={p.description} className="mr-1.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">{`{${p.name}}`}</span>)}
                {row.required.length > 0 && <span className="text-gray-500"> · Wajib: {row.required.map((r) => `{${r}}`).join(', ')}</span>}
              </p>
              <div className="rounded-md bg-gray-50 p-3">
                <p className="mb-1 text-xs font-medium text-gray-500">Contoh mesej</p>
                <p className="whitespace-pre-line text-sm text-gray-800">{fillWith(text, samples)}</p>
              </div>
              <div className="flex justify-end gap-2">
                {row.customised && <Button variant="ghost" disabled={busy === row.key} onClick={() => {
                  if (window.confirm('Kembalikan wording asal untuk mesej ini?')) act(row, () => request(`/messages/${row.key}/`, { method: 'DELETE' }), 'Wording asal dikembalikan.');
                }}>Kembali ke asal</Button>}
                {dirty && <Button variant="ghost" onClick={() => setDrafts((d) => { const next = { ...d }; delete next[row.key]; return next; })}>Buang perubahan</Button>}
                <Button variant="primary" disabled={!dirty || busy === row.key} onClick={() => act(row, () => request(`/messages/${row.key}/`, { method: 'PUT', body: JSON.stringify({ text }) }), 'Mesej disimpan.')}>
                  {busy === row.key ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
