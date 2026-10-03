import { useCallback, useEffect, useState } from 'react';
import { studentsApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Table, Td, Th, useToast } from './ui';

// Year-end move of active students to their grade's next grade (from the master-data grade list)
export default function PromotionPanel() {
  const { refreshStudents } = useApp();
  const notify = useToast();
  const [removeOld, setRemoveOld] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const preview = useCallback(() => {
    studentsApi.promote(true, removeOld).then(setResult).catch(() => setResult(null));
  }, [removeOld]);
  useEffect(() => { preview(); }, [preview]);

  const apply = async () => {
    if (!window.confirm(`Naikkan ${result.ready} pelajar ke gred seterusnya? Tindakan ini tidak boleh dibatalkan secara automatik.`)) return;
    setBusy(true);
    try {
      const res = await studentsApi.promote(false, removeOld);
      setResult(res);
      await refreshStudents();
      notify(`${res.promoted} pelajar dinaikkan ke gred seterusnya.`);
    } catch (err) {
      notify(err.message || 'Ralat semasa menaikkan tingkatan.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const moving = result?.rows.filter((r) => r.result !== 'UNCHANGED') || [];
  const staying = result?.rows.filter((r) => r.result === 'UNCHANGED') || [];

  return (
    <Card>
      <CardHeader
        title="Naik tingkatan akhir tahun"
        description="Pelajar aktif dan ditangguh dinaikkan ke gred seterusnya yang ditetapkan dalam Data induk. Gred tanpa gred seterusnya (cth. Tingkatan 5) tidak diubah. Setiap perubahan direkod dalam sejarah pelajar."
        actions={<Button variant="primary" onClick={apply} disabled={busy || !result?.ready}>{busy ? 'Memproses…' : `Naikkan ${result?.ready || 0} pelajar`}</Button>}
      />
      <div className="border-b border-gray-100 px-5 py-3">
        <Checkbox
          label="Keluarkan daripada kelas gred lama"
          description="Pelajar perlu diberi kelas gred baharu dalam profil masing-masing."
          checked={removeOld}
          onChange={(e) => setRemoveOld(e.target.checked)}
        />
      </div>
      {result && (moving.length === 0 ? <EmptyState title="Tiada pelajar untuk dinaikkan" /> : (
        <Table>
          <thead><tr><Th>Pelajar</Th><Th>Dari</Th><Th>Ke</Th><Th>Kelas dikeluarkan</Th><Th>Status</Th></tr></thead>
          <tbody>
            {moving.map((r) => (
              <tr key={r.student_id}>
                <Td className="font-medium text-gray-900">{r.name} <span className="font-normal text-gray-400">· {r.student_code}</span></Td>
                <Td>{r.from_label}</Td>
                <Td className="font-medium text-brand-700">{r.to_label}</Td>
                <Td className="text-gray-600">{r.classes_removed.length ? r.classes_removed.join(', ') : '—'}</Td>
                <Td>{r.result === 'PROMOTED' ? <Badge tone="green">Dinaikkan</Badge> : <Badge>Sedia</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ))}
      {staying.length > 0 && (
        <details className="border-t border-gray-100 px-5 py-3 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium">Tidak berubah ({staying.length})</summary>
          <ul className="mt-2 space-y-1">{staying.map((r) => <li key={r.student_id}>{r.name} ({r.from_label}): {r.reason}</li>)}</ul>
        </details>
      )}
    </Card>
  );
}
