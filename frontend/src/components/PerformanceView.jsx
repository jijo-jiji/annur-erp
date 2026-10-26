import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, FilePlus2, Search } from 'lucide-react';
import { studentsApi } from '../api/client';
import { cikgu, formLabel, FORMS } from '../lib/format';
import FormModal from './FormModal';
import { REPORT_CATEGORIES } from '../lib/reports';
import { Badge, Button, Card, EmptyState, PageHeader, Stat, cx, useToast } from './ui';

// Prestasi pelajar (Phase H): students failing or falling in a school exam, grouped by the teacher and tuition class of
// that subject, with the student's attendance in that class before the exam, the subject's marks over time, open teacher
// reports and likely reasons (backend students/performance.py). The pass mark and the drop that counts as falling are
// settings (Tetapan > Had & amaran > Prestasi pelajar).

const selectClass = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-600 focus:outline-none';
const NO_CLASS = 'Tiada kelas subjek ini di pusat';

export default function PerformanceView() {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [exam, setExam] = useState('');
  const [kind, setKind] = useState('ALL');
  const [form, setForm] = useState('ALL');
  const [query, setQuery] = useState('');
  const [reporting, setReporting] = useState(null); // the row a teacher report is being written for

  const load = useCallback(() => {
    const [year, term] = exam ? exam.split(':') : [];
    return studentsApi.performance(year, term).then(setData).catch((err) => notify(err.message, 'error'));
  }, [exam, notify]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <p className="py-10 text-center text-sm text-gray-500">Memuatkan…</p>;

  const q = query.trim().toLowerCase();
  const rows = data.rows.filter((r) => (kind === 'ALL' || (kind === 'FAIL' ? r.failing : r.falling))
    && (form === 'ALL' || r.form === form) && (!q || `${r.name} ${r.code} ${r.subject}`.toLowerCase().includes(q)));
  const students = new Set(data.rows.map((r) => r.student)).size;
  const lowAttendance = data.rows.filter((r) => r.attendance_rate !== null && r.attendance_rate < data.low_attendance_pct).length;

  // teacher → class → rows, in the order the server sorted them
  const groups = [];
  for (const r of rows) {
    const teacher = r.teacher || (r.class_code ? 'Guru belum ditetapkan' : NO_CLASS);
    let g = groups.find((x) => x.teacher === teacher);
    if (!g) groups.push((g = { teacher, classes: [] }));
    const code = r.class_code || '';
    let c = g.classes.find((x) => x.code === code);
    if (!c) g.classes.push((c = { code, rows: [] }));
    c.rows.push(r);
  }

  return (
    <>
      <PageHeader
        title="Prestasi pelajar"
        description={`Pelajar yang gagal (markah bawah ${data.pass_mark}) atau merosot (turun ${data.drop_marks} markah atau lebih berbanding peperiksaan sebelumnya), mengikut guru dan kelas.`}
      />
      {data.exams.length === 0 ? (
        <Card><EmptyState title="Belum ada keputusan peperiksaan" description="Rekod keputusan di Keputusan peperiksaan dahulu." /></Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Pelajar dipantau" value={students} hint={data.exam.label} />
            <Stat label="Subjek gagal" value={data.rows.filter((r) => r.failing).length} tone={data.rows.some((r) => r.failing) ? 'red' : undefined} />
            <Stat label="Subjek merosot" value={data.rows.filter((r) => r.falling).length} />
            <Stat label="Kehadiran kelas rendah" value={lowAttendance} hint={`Bawah ${data.low_attendance_pct}% sebelum peperiksaan`} />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select value={exam} onChange={(e) => setExam(e.target.value)} aria-label="Peperiksaan" className={selectClass}>
              <option value="">Peperiksaan terakhir setiap pelajar</option>
              {data.exams.map((e) => <option key={`${e.year}:${e.term}`} value={`${e.year}:${e.term}`}>{e.label}</option>)}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Jenis" className={selectClass}>
              <option value="ALL">Gagal atau merosot</option>
              <option value="FAIL">Gagal sahaja</option>
              <option value="DROP">Merosot sahaja</option>
            </select>
            <select value={form} onChange={(e) => setForm(e.target.value)} aria-label="Tingkatan" className={selectClass}>
              <option value="ALL">Semua tingkatan</option>
              {FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari pelajar atau subjek" aria-label="Cari"
                className="rounded-md border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-brand-600 focus:outline-none" />
            </label>
            <span className="ml-auto text-sm text-gray-500">{rows.length} subjek</span>
          </div>

          {groups.length === 0 ? (
            <Card><EmptyState title="Tiada pelajar gagal atau merosot" description={`Untuk ${data.exam.label} dengan tapisan ini.`} /></Card>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <Card key={g.teacher} className="overflow-hidden">
                  <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
                    <h2 className="text-sm font-semibold text-gray-900">{g.teacher === NO_CLASS || g.teacher === 'Guru belum ditetapkan' ? g.teacher : cikgu(g.teacher)}</h2>
                    <p className="text-[13px] text-gray-500">{g.classes.reduce((a, c) => a + c.rows.length, 0)} subjek · {g.classes.filter((c) => c.code).length} kelas</p>
                  </div>
                  {g.classes.map((c) => (
                    <section key={c.code} aria-label={c.code || NO_CLASS}>
                      {c.code && <p className="border-b border-gray-100 px-5 pt-3 text-[13px] font-medium text-gray-700">{c.code}</p>}
                      <ul className="divide-y divide-gray-100">
                        {c.rows.map((r) => <ConcernRow key={`${r.student}-${r.subject_id}`} row={r} lowPct={data.low_attendance_pct} onReport={() => setReporting(r)} />)}
                      </ul>
                    </section>
                  ))}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {reporting && (
        <FormModal
          title={`Laporan guru: ${reporting.name}`}
          description={`${reporting.subject}${reporting.class_code ? ` · ${reporting.class_code}` : ''}. Laporan disimpan pada profil pelajar.`}
          submitLabel="Simpan laporan"
          initial={{ category: 'ACADEMIC', details: '' }}
          fields={[
            { name: 'category', label: 'Jenis laporan', type: 'select', required: true, options: REPORT_CATEGORIES },
            { name: 'details', label: 'Butiran', type: 'textarea', required: true, hint: 'Apa yang guru perhatikan, dan cadangan tindakan.' },
          ]}
          onSubmit={async (v) => {
            await studentsApi.addReport({ student: reporting.student, timetable_class: reporting.class_id, teacher: reporting.teacher_id, ...v });
            notify('Laporan guru disimpan.');
            setReporting(null);
            load();
          }}
          onClose={() => setReporting(null)}
        />
      )}
    </>
  );
}

function ConcernRow({ row: r, lowPct, onReport }) {
  const low = r.attendance_rate !== null && r.attendance_rate < lowPct;
  return (
    <li className="flex flex-wrap items-start gap-x-6 gap-y-2 px-5 py-3">
      <div className="min-w-48 flex-1">
        <a href={`#/students/${r.code}?tab=results`} className="text-sm font-medium text-gray-900 hover:text-brand-700 hover:underline">{r.name}</a>
        <p className="text-[13px] text-gray-500">{r.code} · {formLabel(r.form)} · {r.subject} · {r.exam}</p>
      </div>
      <div className="w-52">
        <p className={cx('text-sm font-semibold tnum', r.failing ? 'text-red-700' : 'text-gray-900')}>
          {r.mark ?? '—'}{r.grade ? ` · ${r.grade}` : ''}
        </p>
        {r.change !== null && (
          <p className={cx('flex items-center gap-0.5 text-[13px] tnum', r.falling ? 'text-amber-700' : 'text-gray-500')}>
            {r.change < 0 && <ArrowDown className="size-3.5" />}{r.change > 0 ? `+${r.change}` : r.change} dari {r.previous.exam}
          </p>
        )}
        <div className="mt-1 flex gap-1">
          {r.failing && <Badge tone="red">Gagal</Badge>}
          {r.falling && <Badge tone="amber">Merosot</Badge>}
        </div>
      </div>
      <div className="w-40 text-[13px] text-gray-600">
        <p className="tnum" title="Markah subjek ini mengikut peperiksaan">{r.trend.map((t) => t.mark ?? t.grade ?? '—').join(' → ')}</p>
        <p className={cx('tnum', low && 'font-medium text-red-700')}>
          {r.attendance === null ? 'Tiada kelas di pusat' : r.attendance.total === 0 ? 'Tiada rekod kedatangan' : `Hadir ${r.attendance.present}/${r.attendance.total} (${r.attendance_rate}%)`}
        </p>
      </div>
      <div className="min-w-48 flex-[1.4]">
        {r.reasons.length > 0 ? (
          <ul className="space-y-0.5">
            {r.reasons.map((why) => <li key={why} className="flex items-start gap-1.5 text-[13px] text-gray-700"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />{why}</li>)}
          </ul>
        ) : <p className="text-[13px] text-gray-400">Tiada sebab jelas daripada rekod</p>}
        {r.reports.map((rep) => (
          <p key={rep.id} className="mt-1 text-[13px] text-gray-500">{rep.category}{rep.teacher ? ` (${cikgu(rep.teacher)})` : ''}: {rep.details}</p>
        ))}
      </div>
      <Button size="sm" icon={FilePlus2} onClick={onReport}>Laporan guru</Button>
    </li>
  );
}
