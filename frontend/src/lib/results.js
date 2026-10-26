// School exam results. The terms are the same fixed list as the server (backend/students/exam_terms.py):
// four exams a year for everyone, Percubaan SPM and SPM for Tingkatan 5 only. SPM gives a grade, no mark.
// `usual` is the month and day the exam is usually over by, to suggest the latest one already sat
import { THRESHOLDS } from './thresholds';
export const TERMS = [
  { code: 'PENGGAL_1', label: 'Penggal 1', short: 'P1', usual: '03-31' },
  { code: 'PERTENGAHAN', label: 'Pertengahan Tahun', short: 'PPT', usual: '06-15' },
  { code: 'PENGGAL_2', label: 'Penggal 2', short: 'P2', usual: '08-31' },
  { code: 'PERCUBAAN_SPM', label: 'Percubaan SPM', short: 'Percubaan', usual: '09-15', finalOnly: true },
  { code: 'AKHIR', label: 'Akhir Tahun', short: 'Akhir', usual: '10-31' },
  { code: 'SPM', label: 'SPM', short: 'SPM', usual: '12-15', finalOnly: true, gradeOnly: true },
];
export const RESULT_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'G', 'TH']; // TH: tidak hadir
// The pass mark is a setting (Tetapan > Had & amaran > Prestasi pelajar)
export const passMark = () => THRESHOLDS.results_pass_mark;

const byCode = Object.fromEntries(TERMS.map((t, i) => [t.code, { ...t, order: i }]));
export const termOf = (code) => byCode[code];
export const termLabel = (code) => byCode[code]?.label ?? code;

// The last secondary grade (Tingkatan 5) is the one that sits Percubaan SPM and SPM
export function isFinalYear(form, grades = []) {
  const g = grades.find((x) => x.code === form);
  return Boolean(g) && g.level === 'UPPER' && !g.next;
}
export const termsFor = (form, grades) => TERMS.filter((t) => !t.finalOnly || isFinalYear(form, grades));

// Exams in the order they were sat: [{ key, year, term, label, short }]
export const examKey = (year, term) => `${year}-${term}`;
export function examsOf(rows) {
  const seen = new Map();
  for (const r of rows) if (!seen.has(examKey(r.year, r.term))) seen.set(examKey(r.year, r.term), { year: r.year, term: r.term });
  return [...seen.values()]
    .sort((a, b) => a.year - b.year || byCode[a.term].order - byCode[b.term].order)
    .map((e) => ({ ...e, key: examKey(e.year, e.term), label: `${termLabel(e.term)} ${e.year}`, short: `${byCode[e.term].short} ${String(e.year).slice(2)}` }));
}

export const mean = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

// Average mark, pass rate and number of A / A+ for a set of result rows. SPM rows have a grade only, so they
// count for the pass rate and the A's but not the average.
export function summarize(rows) {
  if (!rows.length) return null;
  return {
    n: rows.length,
    avg: mean(rows.map((r) => r.mark).filter((v) => v != null)),
    pass: Math.round((rows.filter((r) => !isFail(r)).length / rows.length) * 100),
    aCount: rows.filter((r) => ['A+', 'A'].includes(r.grade)).length,
  };
}

// Below the pass mark, or a failing grade when only the grade is known
export const isFail = (r) => (r.mark != null ? r.mark < passMark() : ['G', 'TH'].includes(r.grade));

// The latest exam a student has results for, with its average mark (for the profile header)
export function latestSummary(rows) {
  const last = examsOf(rows).at(-1);
  if (!last) return null;
  const st = summarize(rows.filter((r) => r.year === last.year && r.term === last.term));
  return { exam: last, avg: st?.avg ?? null };
}

// The public form where parents and students send school results
export const resultsFormUrl = () => `${window.location.origin}${window.location.pathname}#/keputusan`;

// Of the given term codes, the latest one usually sat by `today` (YYYY-MM-DD) this year; the first otherwise
export function latestSat(codes, today) {
  const sat = codes.filter((c) => byCode[c] && byCode[c].usual <= today.slice(5));
  return sat.at(-1) ?? codes[0];
}
