import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Award } from 'lucide-react';
import { DEMO_TEACHER, FORMS } from '../data/demo';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { classLabel, grade } from '../lib/domain';
import { date, formLabel, todayISO } from '../lib/format';
import { HBarList } from './charts';
import { Badge, Button, Card, CardHeader, cx, EmptyState, inputClass, PageHeader, Stat, Table, Tabs, Td, Th, useToast } from './ui';

const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'G'];
const PASS = 40;

function stats(values) {
  if (!values.length) return null;
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const pass = Math.round((values.filter((v) => v >= PASS).length / values.length) * 100);
  const aCount = values.filter((v) => v >= 80).length;
  return { avg, pass, aCount, n: values.length };
}

export default function ResultsView({ role }) {
  const { exams, classes, subjects, teachers, results } = useStore();
  const pastExams = exams.filter((e) => results.some((r) => r.examId === e.id));
  const [examId, setExamId] = useState(pastExams.at(-1)?.id ?? exams[0].id);
  const [form, setForm] = useState('ALL');
  const [classId, setClassId] = useState(null);
  const mine = role === 'TEACHER';

  const visible = classes
    .filter((c) => (!mine || c.teacher === DEMO_TEACHER) && (form === 'ALL' || c.form === form))
    .sort((a, b) => a.form.localeCompare(b.form) || a.subject.localeCompare(b.subject) || a.section.localeCompare(b.section));
  const exam = exams.find((e) => e.id === examId);
  const rec = (id) => results.find((r) => r.examId === examId && r.classId === id);

  if (classId) {
    const cls = classes.find((c) => c.id === classId);
    return <ClassResults key={`${examId}-${classId}`} cls={cls} exam={exam} role={role} onBack={() => setClassId(null)} />;
  }

  const all = visible.flatMap((c) => Object.values(rec(c.id)?.marks ?? {}));
  const overall = stats(all);
  const entered = visible.filter((c) => rec(c.id)).length;

  return (
    <>
      <PageHeader title="Keputusan ujian" description={mine ? 'Masukkan markah bagi kelas anda.' : 'Prestasi pelajar mengikut ujian dan kelas.'} />
      <Tabs
        className="mb-4"
        value={examId}
        onChange={setExamId}
        items={exams.map((e) => ({ value: e.id, label: `${e.name} · ${date(e.date)}` }))}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Purata markah" value={overall ? `${overall.avg}%` : '—'} hint={overall ? `Gred ${grade(overall.avg)}` : 'Belum ada markah'} />
        <Stat label="Kadar lulus" value={overall ? `${overall.pass}%` : '—'} hint={`Markah ${PASS} ke atas`} />
        <Stat label="Gred A" value={overall ? overall.aCount : '—'} hint={overall ? `daripada ${overall.n} keputusan` : ''} />
        <Stat label="Kelas direkod" value={`${entered}/${visible.length}`} hint={exam.date > todayISO() ? `Ujian pada ${date(exam.date)}` : 'Markah dimasukkan'} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
          {!mine && (
            <select
              value={form}
              onChange={(e) => setForm(e.target.value)}
              aria-label="Tapis tingkatan"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-600 focus:outline-none"
            >
              <option value="ALL">Semua tingkatan</option>
              {FORMS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          <span className="text-sm text-gray-500">{visible.length} kelas</span>
        </div>
        {visible.length === 0 ? (
          <EmptyState icon={Award} title="Tiada kelas" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Kelas</Th>
                <Th className="hidden md:table-cell">Guru</Th>
                <Th className="text-right">Purata</Th>
                <Th className="hidden text-right sm:table-cell">Lulus</Th>
                <Th className="hidden text-right sm:table-cell">Gred A</Th>
                <Th className="text-right">
                  <span className="sr-only">Tindakan</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const st = stats(Object.values(rec(c.id)?.marks ?? {}));
                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setClassId(c.id)}>
                    <Td className="font-medium text-gray-900">{classLabel(c, subjects)}</Td>
                    <Td className="hidden text-gray-700 md:table-cell">Cikgu {teachers.find((t) => t.code === c.teacher)?.name}</Td>
                    <Td className="text-right tnum">{st ? `${st.avg}%` : <Badge>Belum direkod</Badge>}</Td>
                    <Td className={cx('hidden text-right tnum sm:table-cell', st && st.pass < 75 && 'font-medium text-red-700')}>{st ? `${st.pass}%` : '—'}</Td>
                    <Td className="hidden text-right tnum sm:table-cell">{st ? st.aCount : '—'}</Td>
                    <Td className="whitespace-nowrap text-right">
                      <Button size="sm" variant={!st && can(role, 'results.enter') ? 'primary' : 'secondary'}>
                        {!st && can(role, 'results.enter') ? 'Masukkan markah' : 'Lihat'}
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function ClassResults({ cls, exam, role, onBack }) {
  const { students, subjects, teachers, exams, results, saveResults } = useStore();
  const notify = useToast();
  const existing = results.find((r) => r.examId === exam.id && r.classId === cls.id);
  const prevExam = exams[exams.indexOf(exam) - 1];
  const prev = prevExam && results.find((r) => r.examId === prevExam.id && r.classId === cls.id);
  const roster = useMemo(
    () => students.filter((s) => s.status === 'ACTIVE' && s.classes.includes(cls.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [students, cls.id],
  );
  const editable = can(role, 'results.enter') && (role !== 'TEACHER' || cls.teacher === DEMO_TEACHER);
  const [marks, setMarks] = useState(() => Object.fromEntries(roster.map((s) => [s.id, existing?.marks[s.id] ?? ''])));
  const [dirty, setDirty] = useState(false);

  const values = Object.values(marks).filter((v) => v !== '').map(Number);
  const st = stats(values);
  const dist = GRADE_ORDER.map((g) => ({ label: g, value: values.filter((v) => grade(v) === g).length }));
  const label = classLabel(cls, subjects);

  const save = () => {
    const clean = Object.fromEntries(Object.entries(marks).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    saveResults({ examId: exam.id, classId: cls.id, marks: clean, enteredBy: role === 'TEACHER' ? DEMO_TEACHER : role });
    setDirty(false);
    notify(`Markah ${exam.name} bagi ${label} disimpan (${Object.keys(clean).length} pelajar).`);
  };

  return (
    <>
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
        <ArrowLeft className="size-4" /> Semua kelas
      </button>
      <PageHeader title={`${label} · ${exam.name}`} description={`${formLabel(cls.form)} · Cikgu ${teachers.find((t) => t.code === cls.teacher)?.name} · ${date(exam.date)}`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`${roster.length} pelajar`} description={editable ? 'Markah 0–100. Gred dikira mengikut skala SPM.' : undefined} />
          <Table>
            <thead>
              <tr>
                <Th>Pelajar</Th>
                <Th className="w-28">Markah</Th>
                <Th className="w-16">Gred</Th>
                {prev && <Th className="hidden text-right sm:table-cell">{prevExam.name}</Th>}
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const v = marks[s.id];
                const before = prev?.marks[s.id];
                const diff = v !== '' && before != null ? Number(v) - before : null;
                return (
                  <tr key={s.id}>
                    <Td>
                      <a href={`#/students/${s.id}?tab=results`} className="text-gray-900 hover:text-brand-700 hover:underline">
                        {s.name}
                      </a>
                    </Td>
                    <Td>
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          inputMode="numeric"
                          aria-label={`Markah ${s.name}`}
                          value={v}
                          onChange={(e) => {
                            const n = e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value)));
                            setMarks((m) => ({ ...m, [s.id]: n }));
                            setDirty(true);
                          }}
                          className={cx(inputClass, 'max-w-20 py-1.5 text-right tnum')}
                        />
                      ) : (
                        <span className="tnum">{v === '' ? '—' : v}</span>
                      )}
                    </Td>
                    <Td className={cx('font-semibold', v !== '' && Number(v) < PASS && 'text-red-700')}>{grade(v === '' ? null : Number(v))}</Td>
                    {prev && (
                      <Td className="hidden text-right sm:table-cell">
                        <span className="text-gray-500 tnum">{before ?? '—'}</span>
                        {diff != null && diff !== 0 && (
                          <span className={cx('ml-2 inline-flex items-center text-xs font-medium', diff > 0 ? 'text-brand-700' : 'text-red-700')}>
                            {diff > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                            {Math.abs(diff)}
                          </span>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {editable && (
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-3">
              <span className="text-sm text-gray-600">
                {values.length}/{roster.length} markah dimasukkan{dirty ? ' · belum disimpan' : ''}
              </span>
              <Button variant="primary" onClick={save} disabled={!dirty}>
                Simpan markah
              </Button>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Ringkasan kelas" />
            <dl className="grid grid-cols-3 divide-x divide-gray-100 text-center">
              {[
                ['Purata', st ? `${st.avg}%` : '—'],
                ['Lulus', st ? `${st.pass}%` : '—'],
                ['Gred A', st ? st.aCount : '—'],
              ].map(([k, v]) => (
                <div key={k} className="py-4">
                  <dd className="text-lg font-semibold tnum">{v}</dd>
                  <dt className="text-[13px] text-gray-500">{k}</dt>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Taburan gred" />
            <div className="p-5">
              {values.length ? <HBarList rows={dist} labelWidth="2rem" max={Math.max(...dist.map((d) => d.value), 1)} danger={(r) => r.label === 'G'} /> : <p className="text-sm text-gray-500">Belum ada markah.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
