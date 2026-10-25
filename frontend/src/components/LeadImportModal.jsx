import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp } from 'lucide-react';
import { leadsApi } from '../api/client';
import { downloadCsv } from '../lib/csv';
import { LEAD_COLUMNS, LEAD_TEMPLATE, readLeadCsv } from '../lib/leadImport';
import { Badge, Button, Input, Modal, Select, Table, Td, Th } from './ui';
import { fmtPhone } from '../lib/format';

const STATUS = {
  ok: { label: 'Sedia', tone: 'green' },
  duplicate: { label: 'Pendua', tone: 'amber' },
  error: { label: 'Ralat', tone: 'red' },
};
const SHOWN_PROBLEMS = 50;

// Import prospects from a CSV the centre has collected. The file is read in the browser, every row is checked by the
// server against the centre's own lists, and only then are the good rows created. A preview never creates anything.
export default function LeadImportModal({ onClose, onImported, stages, sources, campaigns }) {
  const input = useRef(null);
  const [file, setFile] = useState(null); // { name, known, ignored, rows }
  const [problem, setProblem] = useState('');
  const [defaults, setDefaults] = useState({ status: 'ENQUIRY', lead_source: '', campaign: '', assigned_to: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const chooseFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setProblem('');
    setPreview(null);
    const read = readLeadCsv(await picked.text());
    if (read.error) { setFile(null); setProblem(read.error); return; }
    setFile({ name: picked.name, ...read });
  };

  // Check the rows whenever the file or the batch's defaults change
  useEffect(() => {
    if (!file) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      setBusy(true);
      leadsApi.import({ rows: file.rows, defaults, commit: false })
        .then((res) => { if (current) { setPreview(res); setProblem(''); } })
        .catch((err) => { if (current) { setPreview(null); setProblem(describe(err)); } })
        .finally(() => { if (current) setBusy(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [file, defaults]);

  const commit = async () => {
    setBusy(true);
    try {
      const res = await leadsApi.import({ rows: file.rows, defaults, commit: true, filename: file.name });
      setDone(res);
      await onImported();
    } catch (err) {
      setProblem(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const leftOut = (result) => result.rows.filter((r) => r.status !== 'ok');
  const downloadLeftOut = (result) => {
    const known = LEAD_COLUMNS.filter((c) => file.known.some((k) => k.field === c.field));
    downloadCsv(
      'baris-tidak-diimport.csv',
      [...known.map((c) => c.label), 'Status', 'Sebab'],
      leftOut(result).map((r) => [...known.map((c) => file.rows[r.row - 1][c.field] ?? ''), STATUS[r.status].label, r.messages.join(' ')]),
    );
  };

  const counts = (done ?? preview)?.counts;

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title="Import prospek daripada CSV"
      description="Fail diperiksa dahulu. Tiada prospek dicipta sehingga anda tekan Import."
      footer={done ? (
        <Button variant="primary" onClick={onClose}>Selesai</Button>
      ) : (
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" disabled={!file || busy || !preview || preview.counts.ok === 0} onClick={commit}>
            {busy && preview ? 'Mengimport…' : `Import ${preview?.counts.ok ?? 0} prospek`}
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        {done ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <CheckCircle2 className="size-5 text-green-600" /> {done.counts.ok} prospek diimport.
            </p>
            <p className="text-sm text-gray-600">
              {done.counts.duplicate} dilangkau kerana no. telefon sudah ada, {done.counts.error} baris tidak sah.
            </p>
            {leftOut(done).length > 0 && (
              <Button icon={Download} onClick={() => downloadLeftOut(done)}>Muat turun baris yang tidak diimport</Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Fail CSV" onChange={chooseFile} />
              <Button icon={FileUp} onClick={() => input.current?.click()}>{file ? 'Pilih fail lain' : 'Pilih fail CSV'}</Button>
              <Button variant="ghost" icon={Download} onClick={() => downloadCsv('templat-prospek.csv', LEAD_TEMPLATE.header, LEAD_TEMPLATE.rows)}>Muat turun templat</Button>
              {file && <span className="text-sm text-gray-600">{file.name} · {file.rows.length} baris</span>}
            </div>
            <p className="text-[13px] text-gray-500">
              Hanya no. telefon diperlukan pada setiap baris, dan sumber (dalam fail atau dipilih di bawah). No. telefon yang sudah ada
              sebagai prospek atau penjaga pelajar dilangkau supaya keluarga yang sama tidak dimasukkan dua kali.
            </p>

            {problem && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{problem}</p>}

            {file && (
              <>
                <div className="space-y-1 text-[13px] text-gray-600">
                  <p><span className="font-medium text-gray-800">Lajur dikenali:</span> {file.known.map((c) => c.label).join(', ')}</p>
                  {file.ignored.length > 0 && <p><span className="font-medium text-gray-800">Diabaikan:</span> {file.ignored.join(', ')}</p>}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select label="Peringkat permulaan" value={defaults.status} onChange={(e) => setDefaults({ ...defaults, status: e.target.value })}>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                  <Input label="PIC" value={defaults.assigned_to} placeholder="Kosongkan untuk guna nama anda" onChange={(e) => setDefaults({ ...defaults, assigned_to: e.target.value })} />
                  <Select label="Sumber jika tiada dalam fail" value={defaults.lead_source} onChange={(e) => setDefaults({ ...defaults, lead_source: e.target.value })}>
                    <option value="">Tiada (guna lajur Sumber)</option>
                    {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                  <Select label="Kempen jika tiada dalam fail" value={defaults.campaign} onChange={(e) => setDefaults({ ...defaults, campaign: e.target.value })}>
                    <option value="">Tiada kempen</option>
                    {campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              </>
            )}

            {counts && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge tone="green">{counts.ok} sedia diimport</Badge>
                  <Badge tone="amber">{counts.duplicate} pendua</Badge>
                  <Badge tone="red">{counts.error} ralat</Badge>
                </div>
                {leftOut(preview).length > 0 && (
                  <div className="max-h-72 overflow-auto rounded-md border border-gray-200">
                    <Table>
                      <thead><tr><Th>Baris</Th><Th>Prospek</Th><Th>Status</Th><Th>Sebab</Th></tr></thead>
                      <tbody>
                        {leftOut(preview).slice(0, SHOWN_PROBLEMS).map((r) => (
                          <tr key={r.row} className="align-top">
                            <Td className="whitespace-nowrap tnum">{r.row + 1}</Td>
                            <Td className="text-gray-700">{[r.name, fmtPhone(r.phone)].filter(Boolean).join(' · ') || '—'}</Td>
                            <Td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></Td>
                            <Td className="text-[13px] text-gray-600">{r.messages.join(' ')}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
                {leftOut(preview).length > SHOWN_PROBLEMS && <p className="text-[13px] text-gray-500">Dan {leftOut(preview).length - SHOWN_PROBLEMS} baris lagi. Semuanya boleh dimuat turun selepas import.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

const describe = (err) => {
  const data = err?.data && typeof err.data === 'object' ? err.data : {};
  const text = Object.values(data).flatMap((v) => (typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : [v])).flat().join(' ');
  return text || err?.message || 'Ralat semasa menyemak fail.';
};
