import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Award, Copy, Download, Printer, QrCode } from 'lucide-react';
import { studentsApi } from '../api/client';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { classLabel, grade, gradeOrder } from '../lib/domain';
import { formLabel, FORMS, todayISO } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { useGrades } from '../lib/grades';
import { examsOf, isFail, isFinalYear, passMark, RESULT_GRADES, resultsFormUrl, summarize, TERMS, termLabel, termOf } from '../lib/results';
import { CENTRE } from '../lib/config';
import { HBarList, TrendChart } from './charts';
import ResultSubmissions from './ResultSubmissions';
import { Badge, Button, Card, CardHeader, cx, EmptyState, filterClass, inputClass, Modal, PageHeader, Stat, Table, Tabs, Td, Th, useToast } from './ui';

// School exam results (not tuition-class tests): per year and term, shown by tuition class. Results come in by
// class here, by student on the profile, or from parents on the public form (#/keputusan) after review.
export default function ResultsView({ role }) {
  const { classes, subjects, teachers, results, students } = useStore();
  const { grades } = useGrades();
  const thisYear = Number(todayISO().slice(0, 4));
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.hash.split('?')[1]).get('tab') === 'review' ? 'review' : 'classes'));
  const [year, setYear] = useState(thisYear);
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState('ALL');
  const [classId, setClassId] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [pending, setPending] = useState(0);

  const countPending = useCallback(() => {
    studentsApi.resultSubmissions('PENDING').then((rows) => setPending(rows.length)).catch(() => setPending(0));
  }, []);
  useEffect(() => { countPending(); }, [countPending]);

  const years = [...new Set([thisYear, ...results.map((r) => r.year)])].sort((a, b) => b - a);
  // Until one is picked, the latest exam of the year that has results
  const term = picked ?? examsOf(results.filter((r) => r.year === year)).at(-1)?.term ?? 'PENGGAL_1';
  const finalOnly = termOf(term)?.finalOnly;

  const rosterOf = useCallback((c) => students.filter((s) => ['ACTIVE', 'ON_HOLD'].includes(s.status) && s.classes.includes(c.id)), [students]);
  const rowsOf = (c, y = year, t = term) => {
    const pks = new Set(rosterOf(c).map((s) => s.pk));
    return results.filter((r) => r.year === y && r.term === t && r.subjectPk === c.subjectPk && pks.has(r.studentPk));
  };
  const visible = classes
    .filter((c) => (form === 'ALL' || c.form === form) && (!finalOnly || isFinalYear(c.form, grades)))
    .sort((a, b) => a.form.localeCompare(b.form) || (a.subject || '').localeCompare(b.subject || '') || a.section.localeCompare(b.section));
  const teacherName = (c) => teachers.find((t) => t.code === c.teacher)?.name;

  if (classId) {
    const cls = classes.find((c) => c.id === classId);
    return <ClassResults key={`${year}-${term}-${classId}`} cls={cls} year={year} term={term} roster={rosterOf(cls)} role={role} onBack={() => setClassId(null)} />;
  }

  const all = visible.flatMap((c) => rowsOf(c));
  const overall = summarize(all);
  const entered = visible.filter((c) => rowsOf(c).length).length;
  const exportAll = () => downloadCsv(`keputusan-${termLabel(term).replace(/\s+/g, '-')}-${year}.csv`, ['Kelas', 'Guru', 'Bilangan', 'Purata', 'Lulus %', 'Gred A'],
    visible.map((c) => {
      const st = summarize(rowsOf(c));
      return [classLabel(c, subjects), teacherName(c), st?.n ?? 0, st?.avg ?? '', st?.pass ?? '', st?.aCount ?? ''];
    }));

  return (
    <>
      <PageHeader
        title="Keputusan peperiksaan"
        description="Keputusan peperiksaan sekolah pelajar: Penggal 1, Pertengahan Tahun, Penggal 2 dan Akhir Tahun, serta Percubaan SPM dan SPM bagi Tingkatan 5."
        actions={
          <>
            <Button icon={QrCode} onClick={() => setSharing(true)}>Borang ibu bapa</Button>
            {tab === 'classes' && <Button icon={Download} onClick={exportAll}>Excel</Button>}
          </>
        }
      />
      {sharing && <ShareFormModal onClose={() => setSharing(false)} />}
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[{ value: 'classes', label: 'Mengikut kelas' }, { value: 'review', label: 'Semakan borang', count: pending }]}
      />

      {tab === 'review' && <ResultSubmissions onChanged={countPending} />}

      {tab === 'classes' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select aria-label="Tahun" value={year} onChange={(e) => { setYear(Number(e.target.value)); setPicked(null); }} className={filterClass}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <Tabs
              value={term}
              onChange={setPicked}
              items={TERMS.map((t) => ({ value: t.code, label: t.finalOnly ? `${t.label} (T5)` : t.label }))}
            />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Purata markah" value={overall?.avg != null ? `${overall.avg}%` : '—'} hint={termOf(term)?.gradeOnly ? 'SPM: gred sahaja' : overall ? `${overall.n} keputusan` : 'Belum ada markah'} />
            <Stat label="Kadar lulus" value={overall ? `${overall.pass}%` : '—'} hint={`Markah ${passMark()} ke atas`} />
            <Stat label="Gred A dan A+" value={overall ? overall.aCount : '—'} hint={overall ? `daripada ${overall.n} keputusan` : ''} />
            <Stat label="Kelas direkod" value={`${entered}/${visible.length}`} hint={`${termLabel(term)} ${year}`} />
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
              <select value={form} onChange={(e) => setForm(e.target.value)} aria-label="Tapis tingkatan" className={filterClass}>
                <option value="ALL">Semua tingkatan</option>
                {FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <span className="text-sm text-gray-500">{visible.length} kelas{finalOnly ? ' Tingkatan 5' : ''}</span>
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
                    <Th className="text-right"><span className="sr-only">Tindakan</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => {
                    const rows = rowsOf(c);
                    const st = summarize(rows);
                    const empty = rosterOf(c).length === 0;
                    const enter = !st && !empty && can(role, 'results.enter');
                    return (
                      <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setClassId(c.id)}>
                        <Td className="font-medium text-gray-900">
                          {classLabel(c, subjects)}
                          <p className="text-[13px] font-normal text-gray-500">{rows.length}/{rosterOf(c).length} pelajar direkod</p>
                        </Td>
                        <Td className="hidden text-gray-700 md:table-cell">{teacherName(c) ? `Cikgu ${teacherName(c)}` : '—'}</Td>
                        <Td className="text-right tnum">{st ? (st.avg != null ? `${st.avg}%` : '—') : <Badge>{empty ? 'Tiada pelajar' : 'Belum direkod'}</Badge>}</Td>
                        <Td className={cx('hidden text-right tnum sm:table-cell', st && st.pass < 75 && 'font-medium text-red-700')}>{st ? `${st.pass}%` : '—'}</Td>
                        <Td className="hidden text-right tnum sm:table-cell">{st ? st.aCount : '—'}</Td>
                        <Td className="whitespace-nowrap text-right">
                          <Button size="sm" variant={enter ? 'primary' : 'secondary'}>{enter ? 'Masukkan keputusan' : 'Lihat'}</Button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  );
}

// One tuition class's results for one school exam: the roster with a mark (or an SPM grade) each, the change
// from the exam before, and the class average across the year's exams.
function ClassResults({ cls, year, term, roster, role, onBack }) {
  const { subjects, teachers, results, saveResults } = useStore();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const gradeOnly = termOf(term)?.gradeOnly;
  const label = classLabel(cls, subjects);
  const sorted = useMemo(() => [...roster].sort((a, b) => a.name.localeCompare(b.name)), [roster]);
  const pks = new Set(roster.map((s) => s.pk));
  const mine = results.filter((r) => r.subjectPk === cls.subjectPk && pks.has(r.studentPk));
  const exams = examsOf(mine.filter((r) => r.year === year).concat({ year, term }));
  const at = exams.findIndex((e) => e.year === year && e.term === term);
  const prevExam = examsOf(mine).filter((e) => e.year < year || (e.year === year && termOf(e.term).order < termOf(term).order)).at(-1);
  const resultOf = (s, y, t) => mine.find((r) => r.studentPk === s.pk && r.year === y && r.term === t);

  const editable = can(role, 'results.enter');
  const [values, setValues] = useState(() => Object.fromEntries(sorted.map((s) => {
    const r = resultOf(s, year, term);
    return [s.id, r ? String(gradeOnly ? r.grade : r.mark ?? r.grade ?? '') : ''];
  })));
  const [dirty, setDirty] = useState(false);
  const typed = Object.values(values).filter((v) => v !== '');
  const shown = sorted.map((s) => ({ s, v: values[s.id] })).filter(({ v }) => v !== '')
    .map(({ v }) => (gradeOnly || Number.isNaN(Number(v)) ? { mark: null, grade: v } : { mark: Number(v), grade: gradeOf(v) }));
  const st = summarize(shown);
  const dist = (gradeOnly ? RESULT_GRADES : gradeOrder()).map((g) => ({ label: g, value: shown.filter((r) => r.grade === g).length }));
  const trend = exams.map((e) => ({ label: termOf(e.term).short, value: summarize(e.key === exams[at]?.key ? shown : mine.filter((r) => r.year === e.year && r.term === e.term))?.avg ?? null }));
  const teacher = teachers.find((t) => t.code === cls.teacher);

  const save = async () => {
    setBusy(true);
    try {
      await saveResults({ classId: cls.id, year, term, marks: values });
      setDirty(false);
      notify(`Keputusan ${termLabel(term)} ${year} bagi ${label} disimpan (${typed.length} pelajar).`);
    } catch {
      // the store has already shown the reason
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () => downloadCsv(`keputusan-${cls.code.replace(/\s+/g, '-')}-${term}-${year}.csv`, ['ID', 'Nama', gradeOnly ? 'Gred' : 'Markah', 'Gred'],
    sorted.map((s) => [s.id, s.name, values[s.id], gradeOnly ? values[s.id] : gradeOf(values[s.id])]));

  return (
    <>
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
        <ArrowLeft className="size-4" /> Semua kelas
      </button>
      <PageHeader
        title={`${label} · ${termLabel(term)} ${year}`}
        description={`${formLabel(cls.form)}${teacher ? ` · Cikgu ${teacher.name}` : ''} · keputusan peperiksaan sekolah dalam subjek kelas ini`}
        actions={<Button icon={Download} onClick={exportCsv}>Excel</Button>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`${sorted.length} pelajar`} description={editable ? (gradeOnly ? 'SPM: pilih gred yang diperoleh.' : 'Markah 0–100. Gred dikira mengikut skala pusat.') : undefined} />
          <Table>
            <thead>
              <tr>
                <Th>Pelajar</Th>
                <Th className="w-28">{gradeOnly ? 'Gred' : 'Markah'}</Th>
                {!gradeOnly && <Th className="w-16">Gred</Th>}
                {prevExam && <Th className="hidden text-right sm:table-cell">{prevExam.label}</Th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const v = values[s.id];
                const before = prevExam && resultOf(s, prevExam.year, prevExam.term);
                const diff = !gradeOnly && v !== '' && before?.mark != null ? Number(v) - before.mark : null;
                const set = (next) => { setValues((m) => ({ ...m, [s.id]: next })); setDirty(true); };
                const fail = v !== '' && isFail(gradeOnly ? { mark: null, grade: v } : { mark: Number(v) });
                return (
                  <tr key={s.id}>
                    <Td>
                      <a href={`#/students/${s.id}?tab=results`} className="text-gray-900 hover:text-brand-700 hover:underline">{s.name}</a>
                      {resultOf(s, year, term)?.source === 'PARENT' && <p className="text-[13px] text-gray-500">Daripada borang ibu bapa</p>}
                    </Td>
                    <Td>
                      {!editable ? (
                        <span className="tnum">{v === '' ? '—' : v}</span>
                      ) : gradeOnly ? (
                        <select aria-label={`Gred ${s.name}`} value={v} onChange={(e) => set(e.target.value)} className={cx(inputClass, 'max-w-24 py-1.5')}>
                          <option value="">—</option>
                          {RESULT_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      ) : (
                        <input
                          type="number" min="0" max="100" inputMode="numeric" aria-label={`Markah ${s.name}`} value={v}
                          onChange={(e) => set(e.target.value === '' ? '' : String(Math.max(0, Math.min(100, Number(e.target.value)))))}
                          className={cx(inputClass, 'max-w-20 py-1.5 text-right tnum')}
                        />
                      )}
                    </Td>
                    {!gradeOnly && <Td className={cx('font-semibold', fail && 'text-red-700')}>{gradeOf(v)}</Td>}
                    {prevExam && (
                      <Td className="hidden text-right sm:table-cell">
                        <span className="text-gray-500 tnum">{before ? (before.mark ?? before.grade) : '—'}</span>
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
              <span className="text-sm text-gray-600">{typed.length}/{sorted.length} dimasukkan{dirty ? ' · belum disimpan' : ''}</span>
              <Button variant="primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Menyimpan…' : 'Simpan keputusan'}</Button>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Ringkasan kelas" />
            <dl className="grid grid-cols-3 divide-x divide-gray-100 text-center">
              {[['Purata', st?.avg != null ? `${st.avg}%` : '—'], ['Lulus', st ? `${st.pass}%` : '—'], ['Gred A', st ? st.aCount : '—']].map(([k, v]) => (
                <div key={k} className="py-4">
                  <dd className="text-lg font-semibold tnum">{v}</dd>
                  <dt className="text-[13px] text-gray-500">{k}</dt>
                </div>
              ))}
            </dl>
          </Card>
          {!gradeOnly && trend.filter((p) => p.value != null).length > 1 && (
            <Card>
              <CardHeader title={`Purata kelas ${year}`} description="Mengikut peperiksaan sekolah" />
              <div className="px-5 pb-4"><TrendChart points={trend} suffix="%" /></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Taburan gred" />
            <div className="p-5">
              {shown.length ? <HBarList rows={dist} labelWidth="2rem" max={Math.max(...dist.map((d) => d.value), 1)} danger={(r) => ['G', 'TH'].includes(r.label)} /> : <p className="text-sm text-gray-500">Belum ada keputusan.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// The grade of a typed mark, on the centre's scale (Data induk → Gred & jalur markah)
const gradeOf = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? '' : grade(Number(v)));

// The link and QR code of the public results form, to print or send to parents
function ShareFormModal({ onClose }) {
  const notify = useToast();
  const [qr, setQr] = useState('');
  const url = resultsFormUrl();
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: '#133b2c', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [url]);
  const copy = () => navigator.clipboard.writeText(url).then(() => notify('Pautan disalin.', 'info'), () => notify('Tidak dapat menyalin pautan.', 'error'));
  return (
    <Modal
      open
      onClose={onClose}
      title="Borang keputusan ibu bapa"
      description="Ibu bapa atau pelajar mengisi keputusan peperiksaan sekolah sendiri dengan kod pelajar dan 4 digit akhir No. K/P. Keputusan disimpan selepas anda menyemaknya di Semakan borang."
      footer={
        <>
          <Button icon={Copy} onClick={copy}>Salin pautan</Button>
          <Button icon={Printer} onClick={() => window.print()}>Cetak</Button>
          <Button variant="primary" as="a" href="#/keputusan" target="_blank" rel="noreferrer">Buka borang</Button>
        </>
      }
    >
      <div className="print-area text-center">
        <p className="text-sm font-semibold text-gray-900">{CENTRE.name}</p>
        <p className="mt-0.5 text-[13px] text-gray-500">Imbas untuk menghantar keputusan peperiksaan sekolah</p>
        {qr ? <img src={qr} alt="Kod QR borang keputusan" className="mx-auto mt-4 size-56" /> : <div className="mx-auto mt-4 size-56 rounded bg-gray-100" />}
        <p className="mt-3 break-all text-xs text-gray-500">{url}</p>
      </div>
    </Modal>
  );
}
