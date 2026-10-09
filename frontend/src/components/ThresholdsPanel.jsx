import { useCallback, useEffect, useState } from 'react';
import { request } from '../api/client';
import { loadThresholds } from '../lib/thresholds';
import { Badge, Button, Card, CardHeader, Input, useToast } from './ui';

// Voucher approval amounts and alert thresholds. Everyone with Settings can read them;
// only Management changes them. Every number has a safe range, and each change is recorded.
export default function ThresholdsPanel({ editable }) {
  const notify = useToast();
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => request('/thresholds/').then((data) => { setRows(data); setDraft({}); }).catch(() => notify('Gagal memuat had dan amaran.', 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  const changed = Object.fromEntries(Object.entries(draft).filter(([name, v]) => String(v) !== String(rows.find((r) => r.name === name)?.value)));
  const dirty = Object.keys(changed).length > 0;

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await request('/thresholds/', { method: 'PUT', body: JSON.stringify(changed) });
      await Promise.all([load(), loadThresholds()]);
      notify('Had dan amaran disimpan.');
    } catch (err) {
      const data = err?.data && typeof err.data === 'object' ? err.data : {};
      setErrors(data);
      notify(Object.values(data).flat().join(' ') || err.message || 'Ralat.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <Card key={group}>
          <CardHeader
            title={group === 'Baucar' ? 'Had kelulusan baucar' : 'Amaran dan peringatan'}
            description={group === 'Baucar'
              ? 'Amaun yang menentukan siapa meluluskan baucar. Had baharu terpakai kepada baucar yang dibuat selepas perubahan; baucar yang sedang menunggu kekal dengan pelulusnya.'
              : 'Berapa awal amaran dipaparkan pada dashboard dan bila kehadiran dianggap rendah.'}
            actions={!editable && <Badge>Hanya pengurusan boleh mengubah</Badge>}
          />
          <div className="divide-y divide-gray-100">
            {rows.filter((r) => r.group === group).map((r) => (
              <div key={r.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="max-w-md">
                  <p className="text-sm font-medium text-gray-900">{r.label}</p>
                  <p className="text-[13px] text-gray-500">Asal: {r.default} {r.unit} · Julat {r.min.toLocaleString()} hingga {r.max.toLocaleString()}</p>
                  {errors[r.name] && <p role="alert" className="mt-1 text-[13px] text-red-700">{[].concat(errors[r.name]).join(' ')}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={r.label}
                    type="number"
                    min={r.min}
                    max={r.max}
                    step={r.unit === 'RM' ? '0.01' : '1'}
                    className="w-32"
                    value={draft[r.name] ?? r.value}
                    disabled={!editable}
                    onChange={(e) => setDraft((d) => ({ ...d, [r.name]: e.target.value }))}
                  />
                  <span className="w-24 text-sm text-gray-600">{r.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
      {editable && (
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" onClick={() => { setDraft({}); setErrors({}); }}>Buang perubahan</Button>}
          <Button variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      )}
    </div>
  );
}
