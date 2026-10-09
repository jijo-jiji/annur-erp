import { useCallback, useEffect, useState } from 'react';
import { request } from '../api/client';
import { loadThresholds } from '../lib/thresholds';
import { Badge, Button, Card, CardHeader, Checkbox, Input, useToast } from './ui';

const WEEK = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad'];

// What each group is for; the order is the order on the page
const GROUPS = [
  ['Baucar', 'Had kelulusan baucar', 'Amaun yang menentukan siapa meluluskan baucar. Had baharu terpakai kepada baucar yang dibuat selepas perubahan; baucar yang sedang menunggu kekal dengan pelulusnya.'],
  ['Amaran', 'Amaran dan peringatan', 'Berapa awal amaran dipaparkan pada dashboard dan bila kehadiran dianggap rendah.'],
  ['Staf baharu', 'Nilai awal untuk staf baharu', 'Cuti setahun dan waktu bekerja yang diberikan kepada staf yang ditambah selepas ini. Staf sedia ada tidak berubah, dan nilai setiap staf boleh diubah pada profil mereka.'],
  ['Muat naik fail', 'Had saiz muat naik', 'Saiz fail terbesar yang diterima. Jenis fail yang dibenarkan tidak boleh diubah di sini kerana ia peraturan keselamatan.'],
  ['Nombor dokumen', 'Awalan nombor dokumen', 'Huruf di permulaan nombor baharu. Tahun dan nombor turutan diteruskan, dan nombor yang telah dikeluarkan tidak berubah. Awalan baharu memulakan turutan di 1.'],
  ['Peringkat prospek', 'Nama peringkat prospek', 'Nama sahaja. Susunan lapan peringkat dan peraturannya tetap.'],
];

// Voucher approval amounts, alerts, starting values for new staff, upload limits, document number prefixes and
// lead stage names. Everyone with Settings can read them; only Management changes them. Each has a safe check.
export default function ThresholdsPanel({ editable }) {
  const notify = useToast();
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => request('/thresholds/').then((data) => { setRows(data); setDraft({}); }).catch(() => notify('Gagal memuat tetapan.', 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  const changed = Object.fromEntries(Object.entries(draft).filter(([name, v]) => String(v) !== String(rows.find((r) => r.name === name)?.value)));
  const dirty = Object.keys(changed).length > 0;
  const set = (name, value) => setDraft((d) => ({ ...d, [name]: value }));

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await request('/thresholds/', { method: 'PUT', body: JSON.stringify(changed) });
      await Promise.all([load(), loadThresholds()]);
      notify('Tetapan disimpan.');
    } catch (err) {
      const data = err?.data && typeof err.data === 'object' ? err.data : {};
      setErrors(data);
      notify(Object.values(data).flat().join(' ') || err.message || 'Ralat.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const control = (r) => {
    const value = draft[r.name] ?? r.value;
    if (r.kind === 'weekdays') {
      const days = String(value).split(',').filter(Boolean);
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {WEEK.map((d, i) => (
            <Checkbox
              key={d}
              label={d}
              checked={days.includes(String(i))}
              disabled={!editable}
              onChange={(e) => set(r.name, (e.target.checked ? [...days, String(i)] : days.filter((x) => x !== String(i))).sort().join(','))}
            />
          ))}
        </div>
      );
    }
    const inputProps = r.kind === 'time' ? { type: 'time', className: 'w-32' }
      : r.kind === 'text' ? { type: 'text', className: 'w-44', maxLength: r.group === 'Nombor dokumen' ? 6 : 30 }
        : { type: 'number', min: r.min, max: r.max, step: r.unit === 'RM' ? '0.01' : '1', className: 'w-32' };
    return (
      <div className="flex items-center gap-2">
        <Input aria-label={r.label} value={value} disabled={!editable} onChange={(e) => set(r.name, e.target.value)} {...inputProps} />
        {r.unit && <span className="w-24 text-sm text-gray-600">{r.unit}</span>}
      </div>
    );
  };

  const hint = (r) => {
    if (r.kind === 'number') return `Asal: ${r.default} ${r.unit} · Julat ${r.min.toLocaleString()} hingga ${r.max.toLocaleString()}`;
    if (r.kind === 'weekdays') return `Asal: ${r.default.split(',').map((d) => WEEK[Number(d)]).join(', ')}`;
    return `Asal: ${r.default}`;
  };

  return (
    <div className="space-y-6">
      {GROUPS.filter(([group]) => rows.some((r) => r.group === group)).map(([group, title, description]) => (
        <Card key={group}>
          <CardHeader title={title} description={description} actions={!editable && <Badge>Hanya pengurusan boleh mengubah</Badge>} />
          <div className="divide-y divide-gray-100">
            {rows.filter((r) => r.group === group).map((r) => (
              <div key={r.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="max-w-md">
                  <p className="text-sm font-medium text-gray-900">{r.label}</p>
                  <p className="text-[13px] text-gray-500">{hint(r)}</p>
                  {errors[r.name] && <p role="alert" className="mt-1 text-[13px] text-red-700">{[].concat(errors[r.name]).join(' ')}</p>}
                </div>
                {control(r)}
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
