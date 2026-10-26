import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCheck } from 'lucide-react';
import { publicTeacherApi } from '../api/client';
import { describeError } from '../lib/apiErrors';
import { clock, formLabel } from '../lib/format';
import { Badge, Button, Card, cx } from './ui';

// The teacher's classes today on their private link (Phase I): the check-in code to write on the whiteboard, the live
// list as students scan, buttons for pupils without a phone, and confirming the list (students not checked in are then
// marked absent). It refreshes itself while open.

const REFRESH_MS = 15000;
const STATE = { OPEN: { label: 'Imbasan dibuka', tone: 'green' }, SOON: { label: 'Belum dibuka', tone: 'amber' }, CLOSED: { label: 'Ditutup', tone: 'neutral' } };
const MARK = { PRESENT: { label: 'Hadir', tone: 'green' }, LATE: { label: 'Lewat', tone: 'amber' }, ABSENT: { label: 'Tidak hadir', tone: 'red' } };
const BUTTONS = [['PRESENT', 'Hadir'], ['LATE', 'Lewat'], ['ABSENT', 'Tidak hadir']];

export default function TeacherClassesToday({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => publicTeacherApi.classes(token).then((d) => { setData(d); setError(''); })
    .catch((err) => setError(err.data?.detail || describeError(err))), [token]);
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (cls, body) => {
    setBusy(`${cls.class_id}:${body.student ?? body.action}`);
    try {
      const fresh = await publicTeacherApi.classAction(token, cls.class_id, body);
      setData((d) => ({ ...d, classes: d.classes.map((c) => (c.class_id === cls.class_id ? fresh : c)) }));
      setError('');
    } catch (err) {
      setError(Object.values(err.data || {}).flat().join(' ') || describeError(err));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <p className="py-6 text-center text-sm text-gray-500">{error || 'Memuatkan…'}</p>;
  if (data.classes.length === 0) return <Card className="p-6 text-center text-sm text-gray-600">Tiada kelas anda hari ini.</Card>;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data.classes.map((cls) => {
        const counts = cls.students.reduce((a, s) => ({ ...a, [s.status || 'NONE']: (a[s.status || 'NONE'] || 0) + 1 }), {});
        const locked = Boolean(cls.confirmed_at);
        return (
          <Card key={cls.class_id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <p className="text-base font-semibold text-gray-900">{cls.subject} · {formLabel(cls.form_level)}</p>
                <p className="text-[13px] text-gray-500">{cls.start}–{cls.end}{cls.room ? ` · ${cls.room}` : ''} · imbasan {cls.opens}–{cls.closes}, lewat selepas {cls.late_after}</p>
                <Badge className="mt-1.5" tone={locked ? 'neutral' : STATE[cls.state].tone}>{locked ? 'Senarai disahkan' : STATE[cls.state].label}</Badge>
              </div>
              {cls.code && !locked && (
                <div className="text-right">
                  <p className="text-xs font-medium text-gray-500">Kod untuk papan putih</p>
                  <p className="font-mono text-4xl font-bold tracking-[0.2em] text-gray-900">{cls.code}</p>
                </div>
              )}
            </div>
            <p className="border-b border-gray-100 bg-gray-50 px-5 py-2 text-[13px] text-gray-600">
              {counts.PRESENT || 0} hadir · {counts.LATE || 0} lewat · {counts.ABSENT || 0} tidak hadir · {counts.NONE || 0} belum
            </p>
            {locked && <p className="border-b border-gray-100 px-5 py-2 text-[13px] text-gray-600">{cls.closed_note}</p>}
            <ul className="divide-y divide-gray-100">
              {cls.students.map((s) => (
                <li key={s.student} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500">
                      {s.status ? <><Badge tone={MARK[s.status].tone}>{MARK[s.status].label}</Badge> {s.source_label}{s.marked_at ? ` · ${clock(s.marked_at)}` : ''}</> : 'Belum'}
                    </p>
                    {s.flag && <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="size-3.5" /> {s.flag}</p>}
                  </div>
                  {!locked && (
                    <div className="flex gap-1" role="group" aria-label={`Kedatangan ${s.name}`}>
                      {BUTTONS.map(([status, label]) => (
                        <button key={status} type="button" disabled={busy !== null} onClick={() => act(cls, { action: 'mark', student: s.student, status })}
                          className={cx('rounded-md border px-2.5 py-1.5 text-[13px] font-medium', s.status === status ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50')}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!locked && (
              <div className="border-t border-gray-200 px-5 py-3">
                <Button variant="primary" icon={CheckCheck} disabled={busy !== null} onClick={() => {
                  if (window.confirm(`Sahkan senarai? ${counts.NONE || 0} pelajar yang belum ditanda akan ditanda tidak hadir.`)) act(cls, { action: 'confirm' });
                }}>
                  Sahkan senarai
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
