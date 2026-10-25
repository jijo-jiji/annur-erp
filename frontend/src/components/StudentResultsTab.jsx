import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Award, Pencil, Plus } from 'lucide-react';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { grade, gradeOrder } from '../lib/domain';
import { todayISO } from '../lib/format';
import { useGrades } from '../lib/grades';
import { examKey, examsOf, isFail, mean, RESULT_GRADES, summarize, termLabel, termOf, termsFor } from '../lib/results';
import { HBarList, TrendChart } from './charts';
import { Button, Card, CardHeader, cx, EmptyState, filterClass, inputClass, Modal, Select, Stat, Table, Td, Th, useToast } from './ui';

const SUBJECT_LEVEL = { PRIMARY: 'PRIMARY', LOWER: 'LOWER_SEC', UPPER: 'UPPER_SEC' };
const cell = (r) => (r ? (r.mark ?? r.grade) : null);

// The Keputusan tab of a student: school exam results by year and term, entered for a whole term at once, and
// how the student is doing: average per exam against the class, each subject's trend, and the latest grades.
export default function StudentResultsTab({ student: s, role, live }) {
  const { results, students, classes, subjects, teachers } = useStore();
  const { grades } = useGrades();
  const thisYear = Number(todayISO().slice(0, 4));
  const mine = useMemo(() => results.filter((r) => r.studentPk === s.pk), [results, s.pk]);
  const years = [...new Set([thisYear, ...mine.map((r) => r.year)])].sort((a, b) => b - a);
  const [year, setYear] = useState(() => (mine.length ? Math.max(...mine.map((r) => r.year)) : thisYear));
  const [entering, setEntering] = useState(null); // { term }
  const subjectName = (pk) => subjects.find((x) => x.pk === pk)?.name ?? '?';
  const enrolled = classes.filter((c) => s.classes.includes(c.id));
  const tuitionSubjects = [...new Set(enrolled.map((c) => c.subjectPk))];

  // Columns: the terms of the student's form, plus any other term that has results that year
  const yearRows = mine.filter((r) => r.year === year);
  const terms = [...new Map([...termsFor(s.form, grades), ...yearRows.map((r) => termOf(r.term))].map((t) => [t.code, t])).values()]
    .sort((a, b) => termOf(a.code).order - termOf(b.code).order);
  const subjectRows = [...new Set([...tuitionSubjects, ...yearRows.map((r) => r.subjectPk)])]
    .sort((a, b) => Number(!tuitionSubjects.includes(a)) - Number(!tuitionSubjects.includes(b)) || subjectName(a).localeCompare(subjectName(b)));
  const at = (subjectPk, term, y = year) => mine.find((r) => r.subjectPk === subjectPk && r.term === term && r.year === y);

  // Class average: the other students of the same tuition class in that subject; without a class, the students
  // of the same form who have a result in that subject for that exam
  const peersFor = (subjectPk) => {
    const cls = enrolled.find((c) => c.subjectPk === subjectPk);
    return cls ? new Set(students.filter((x) => x.classes.includes(cls.id)).map((x) => x.pk)) : null;
  };
  const classAvg = (subjectPk, y, term) => {
    const peers = peersFor(subjectPk);
    const marks = results
      .filter((r) => r.subjectPk === subjectPk && r.year === y && r.term === term && r.mark != null && (peers ? peers.has(r.studentPk) : r.form === s.form))
      .map((r) => r.mark);
    return marks.length > 1 ? mean(marks) : null; // the student alone is no comparison
  };

  const exams = examsOf(mine).slice(-8);
  const latest = exams.at(-1);
  const previous = exams.at(-2);
  const rowsOf = (e) => (e ? mine.filter((r) => r.year === e.year && r.term === e.term) : []);
  const latestRows = rowsOf(latest);
  const latestSt = summarize(latestRows);
  const previousSt = summarize(rowsOf(previous));
  const avgOfClassAverages = (e) => mean(rowsOf(e).filter((r) => r.mark != null).map((r) => classAvg(r.subjectPk, e.year, e.term)).filter((v) => v != null));
  const vsClass = latestSt?.avg != null && avgOfClassAverages(latest) != null ? latestSt.avg - avgOfClassAverages(latest) : null;
  const change = latestSt?.avg != null && previousSt?.avg != null ? latestSt.avg - previousSt.avg : null;
  const passed = latestRows.filter((r) => !isFail(r)).length;
  const gradeRows = (latest && termOf(latest.term).gradeOnly ? RESULT_GRADES : gradeOrder()).map((g) => ({ label: g, value: latestRows.filter((r) => r.grade === g).length }));
  const editable = can(role, 'results.enter') && live;
  const teacherOf = (subjectPk) => {
    const cls = enrolled.find((c) => c.subjectPk === subjectPk);
    return cls && teachers.find((t) => t.code === cls.teacher)?.name;
  };
  const nextTerm = terms.find((t) => !yearRows.some((r) => r.term === t.code))?.code ?? terms.at(-1)?.code;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Keputusan peperiksaan sekolah"
          description="Markah dan gred peperiksaan di sekolah. Dikemas kini oleh kaunter atau daripada borang ibu bapa selepas disemak."
          actions={
            <div className="flex items-center gap-2">
              <select aria-label="Tahun" value={year} onChange={(e) => setYear(Number(e.target.value))} className={filterClass}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {editable && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEntering({ term: nextTerm })}>Isi keputusan</Button>}
            </div>
          }
        />
        {subjectRows.length === 0 ? (
          <EmptyState icon={Award} title={`Belum ada keputusan ${year}`}>Pelajar belum mengambil subjek di pusat ini.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Subjek</Th>
                {terms.map((t) => (
                  <Th key={t.code} className="text-right">
                    {editable ? (
                      <button type="button" onClick={() => setEntering({ term: t.code })} className="inline-flex items-center gap-1 hover:text-brand-700" title={`Isi ${t.label} ${year}`}>
                        {t.short} <Pencil className="size-3" aria-hidden />
                      </button>
                    ) : t.short}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjectRows.map((pk) => (
                <tr key={pk}>
                  <Td className="text-gray-900">
                    {subjectName(pk)}
                    {tuitionSubjects.includes(pk) && <p className="text-[13px] text-gray-500">Kelas tuisyen{teacherOf(pk) ? ` · Cikgu ${teacherOf(pk)}` : ''}</p>}
                  </Td>
                  {terms.map((t) => {
                    const r = at(pk, t.code);
                    return (
                      <Td key={t.code} className={cx('text-right tnum', r && isFail(r) && 'font-medium text-red-700')}>
                        {r ? (
                          <>
                            {cell(r)}
                            {r.mark != null && <span className="ml-1 text-[13px] text-gray-500">{r.grade}</span>}
                          </>
                        ) : <span className="text-gray-300">—</span>}
                      </Td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-gray-50">
                <Td className="font-medium text-gray-700">Purata</Td>
                {terms.map((t) => {
                  const avg = summarize(yearRows.filter((r) => r.term === t.code))?.avg;
                  return <Td key={t.code} className="text-right font-medium tnum">{avg != null ? avg : '—'}</Td>;
                })}
              </tr>
            </tbody>
          </Table>
        )}
      </Card>

      {latest && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label={`Purata · ${latest.label}`}
              value={latestSt?.avg != null ? `${latestSt.avg}%` : '—'}
              hint={change != null ? <Change value={change} suffix={` berbanding ${previous.label}`} /> : latestSt?.avg != null ? `Gred ${grade(latestSt.avg)}` : 'SPM: gred sahaja'}
            />
            <Stat label="Berbanding purata kelas" value={vsClass != null ? `${vsClass > 0 ? '+' : ''}${vsClass}` : '—'} hint={vsClass != null ? (vsClass >= 0 ? 'Di atas atau sama dengan purata' : 'Di bawah purata kelas') : 'Belum cukup data kelas'} />
            <Stat label="Subjek lulus" value={`${passed}/${latestRows.length}`} hint={latestRows.length - passed ? `${latestRows.length - passed} subjek gagal` : 'Semua subjek lulus'} />
            <Stat label="Gred A dan A+" value={latestSt?.aCount ?? 0} hint={latest.label} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Purata mengikut peperiksaan" description="Garis putus-putus: purata kelas tuisyen dalam subjek yang sama" />
              <div className="px-5 pb-4">
                <TrendChart
                  points={exams.map((e) => ({ label: e.short, value: summarize(rowsOf(e))?.avg ?? null }))}
                  compare={exams.map((e) => avgOfClassAverages(e))}
                  height={160}
                  suffix="%"
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Gred terkini" description={latest.label} />
              <div className="p-5">
                <HBarList rows={gradeRows.filter((g) => g.value || !['TH'].includes(g.label))} labelWidth="2rem" max={Math.max(...gradeRows.map((g) => g.value), 1)} danger={(r) => ['G', 'TH'].includes(r.label)} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...new Set(mine.map((r) => r.subjectPk))].sort((a, b) => subjectName(a).localeCompare(subjectName(b))).map((pk) => {
              const points = exams.map((e) => ({ label: e.short, value: at(pk, e.term, e.year)?.mark ?? null }));
              const last = [...exams].reverse().map((e) => at(pk, e.term, e.year)).find(Boolean);
              return (
                <Card key={pk} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{subjectName(pk)}</p>
                      <p className="text-[13px] text-gray-500">{teacherOf(pk) ? `Cikgu ${teacherOf(pk)}` : 'Bukan subjek tuisyen'}</p>
                    </div>
                    {last && (
                      <div className="text-right">
                        <p className={cx('text-lg font-semibold tnum', isFail(last) && 'text-red-700')}>{cell(last)}</p>
                        <p className="text-xs text-gray-500">{last.mark != null ? `Gred ${last.grade} · ` : ''}{termOf(last.term).short} {last.year}</p>
                      </div>
                    )}
                  </div>
                  {points.some((p) => p.value != null) && (
                    <div className="mt-2">
                      <TrendChart points={points} compare={exams.map((e) => classAvg(pk, e.year, e.term))} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {entering && (
        <TermGridModal
          student={s}
          initialYear={year}
          initialTerm={entering.term}
          years={years}
          tuitionSubjects={tuitionSubjects}
          onClose={() => setEntering(null)}
          onSaved={(y) => { setEntering(null); setYear(y); }}
        />
      )}
    </div>
  );
}

function Change({ value, suffix }) {
  if (!value) return <span>Tiada perubahan{suffix}</span>;
  return (
    <span className={cx('inline-flex items-center gap-0.5', value > 0 ? 'text-brand-700' : 'text-red-700')}>
      {value > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(value)}{suffix}
    </span>
  );
}

// One school exam for one student, every subject in one grid
function TermGridModal({ student: s, initialYear, initialTerm, years, tuitionSubjects, onClose, onSaved }) {
  const { results, subjects, saveResultGrid } = useStore();
  const { grades } = useGrades();
  const notify = useToast();
  const [year, setYear] = useState(initialYear);
  const [term, setTerm] = useState(initialTerm);
  const [values, setValues] = useState({}); // `${year}-${term}` -> subjectPk -> value typed
  const [added, setAdded] = useState([]);
  const [busy, setBusy] = useState(false);
  const key = examKey(year, term);
  const gradeOnly = termOf(term)?.gradeOnly;
  const saved = results.filter((r) => r.studentPk === s.pk && r.year === year && r.term === term);
  const level = SUBJECT_LEVEL[grades.find((g) => g.code === s.form)?.level] ?? 'UPPER_SEC';
  const rows = [...new Set([...tuitionSubjects, ...saved.map((r) => r.subjectPk), ...added])];
  const others = subjects.filter((x) => x.active && x.level === level && !rows.includes(x.pk));
  const nameOf = (pk) => subjects.find((x) => x.pk === pk)?.name ?? '?';
  const valueOf = (pk) => {
    const typed = values[key]?.[pk];
    if (typed !== undefined) return typed;
    const r = saved.find((x) => x.subjectPk === pk);
    return r ? String(gradeOnly ? r.grade : r.mark ?? r.grade ?? '') : '';
  };
  const set = (pk, v) => setValues((prev) => ({ ...prev, [key]: { ...prev[key], [pk]: v } }));
  const filled = rows.filter((pk) => valueOf(pk) !== '').length;

  const save = async () => {
    setBusy(true);
    try {
      await saveResultGrid({
        studentPk: s.pk, year, term,
        rows: rows.map((pk) => {
          const v = valueOf(pk);
          return gradeOnly || (v !== '' && Number.isNaN(Number(v))) ? { subject: pk, grade: v } : { subject: pk, mark: v };
        }),
      });
      notify(`Keputusan ${termLabel(term)} ${year} disimpan (${filled} subjek).`);
      onSaved(year);
    } catch {
      // the store has already shown the reason
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Keputusan ${s.name}`}
      description={gradeOnly ? 'SPM: pilih gred setiap subjek.' : 'Markah 0–100; gred dikira. Kosongkan markah untuk memadam keputusan subjek itu.'}
      footer={
        <>
          <span className="mr-auto text-sm text-gray-500">{filled}/{rows.length} subjek diisi</span>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Tahun" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[...new Set([...years, years[0] - 1])].map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select label="Peperiksaan" value={term} onChange={(e) => setTerm(e.target.value)}>
            {termsFor(s.form, grades).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </Select>
        </div>
        <div className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {rows.map((pk) => {
            const v = valueOf(pk);
            const fail = v !== '' && isFail(gradeOnly || Number.isNaN(Number(v)) ? { grade: v } : { mark: Number(v) });
            return (
              <div key={pk} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-gray-900">
                  {nameOf(pk)}
                  {tuitionSubjects.includes(pk) && <span className="ml-1.5 text-[13px] text-gray-500">tuisyen</span>}
                </span>
                <span className="flex items-center gap-2">
                  {gradeOnly ? (
                    <select aria-label={`Gred ${nameOf(pk)}`} value={v} onChange={(e) => set(pk, e.target.value)} className={cx(inputClass, 'w-24 py-1.5')}>
                      <option value="">—</option>
                      {RESULT_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  ) : (
                    <>
                      <input
                        type="number" min="0" max="100" inputMode="numeric" aria-label={`Markah ${nameOf(pk)}`} value={v}
                        onChange={(e) => set(pk, e.target.value === '' ? '' : String(Math.max(0, Math.min(100, Number(e.target.value)))))}
                        className={cx(inputClass, 'w-20 py-1.5 text-right tnum')}
                      />
                      <span className={cx('w-8 text-sm font-semibold', fail && 'text-red-700')}>{v !== '' && !Number.isNaN(Number(v)) ? grade(Number(v)) : ''}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {others.length > 0 && (
          <select aria-label="Tambah subjek" value="" onChange={(e) => e.target.value && setAdded((a) => [...a, Number(e.target.value)])} className={filterClass}>
            <option value="">+ Tambah subjek sekolah lain</option>
            {others.map((x) => <option key={x.pk} value={x.pk}>{x.name}</option>)}
          </select>
        )}
      </div>
    </Modal>
  );
}
