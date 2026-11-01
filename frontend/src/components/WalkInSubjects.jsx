import { useApp } from '../context/AppContext';
import { groupSubjects } from '../lib/domain';
import { LEVEL_LABEL } from '../lib/format';
import { useGrades } from '../lib/grades';
import { useStore } from '../store';
import { SUBJECT_LEVEL } from './LeadFields';
import { cx } from './ui';

const LEVELS = ['PRIMARY', 'LOWER_SEC', 'UPPER_SEC'];

function Chip({ subject, on, onToggle }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(subject.pk)}
      className={cx(
        'rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors',
        on ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
      )}
    >
      {subject.name} <span className={cx('text-xs font-normal', on ? 'text-white/75' : 'text-gray-400')}>{subject.code}</span>
    </button>
  );
}

// The subjects of one level in the groups the centre set in Data induk (Teras, Sains, Sastera ...), the same groups the
// monthly class picker uses
function Groups({ list, categories, value, onToggle }) {
  return groupSubjects(list, categories).map((group) => (
    <div key={group.code || 'other'} className="mt-2 first:mt-0">
      <p className="mb-1 text-xs font-medium text-gray-500">{group.label}</p>
      <div className="flex flex-wrap gap-1.5">
        {group.subjects.map((s) => <Chip key={s.pk} subject={s} on={value.includes(s.pk)} onToggle={onToggle} />)}
      </div>
    </div>
  ));
}

// Subjects for a walk-in student. The subjects of the student's own tingkatan are shown first, in their groups; those of
// the other levels are folded away (a Form 5 student can still sit in on a Form 4 class). What has been picked stays
// visible at the top whatever level it is from, and can be removed with one click.
// `value` is the list of subject ids; `onChange` receives the new list.
export default function WalkInSubjects({ form, value, onChange }) {
  const { subjects } = useStore();
  const { getMasterOptions } = useApp();
  const { grades } = useGrades();
  const categories = getMasterOptions('26_subject_category');
  const level = SUBJECT_LEVEL[grades.find((g) => g.code === form)?.level];
  const active = subjects.filter((s) => s.active);
  const here = active.filter((s) => s.level === level);
  const elsewhere = active.filter((s) => s.level !== level);
  const chosen = active.filter((s) => value.includes(s.pk));
  const toggle = (pk) => onChange(value.includes(pk) ? value.filter((x) => x !== pk) : [...value, pk]);
  const pickedElsewhere = elsewhere.some((s) => value.includes(s.pk));

  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-gray-700">
        Subjek walk-in<span className="font-normal text-gray-500"> · {form}</span>
      </legend>
      {chosen.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Subjek dipilih">
          <span className="text-xs font-medium text-gray-500">Dipilih ({chosen.length}):</span>
          {chosen.map((s) => (
            <button
              key={s.pk}
              type="button"
              onClick={() => toggle(s.pk)}
              title="Klik untuk buang"
              className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-900 ring-1 ring-brand-200 hover:bg-brand-100"
            >
              {s.name} <span className="text-brand-700">{s.code}</span> ×
            </button>
          ))}
        </div>
      )}
      {here.length === 0
        ? <p className="text-[13px] text-gray-500">Tiada subjek untuk peringkat tingkatan ini. Subjek ditambah dalam Tetapan.</p>
        : <Groups list={here} categories={categories} value={value} onToggle={toggle} />}
      {elsewhere.length > 0 && (
        <details open={pickedElsewhere} className="mt-4 rounded-md border border-gray-200">
          <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-gray-600">Subjek peringkat lain ({elsewhere.length})</summary>
          <div className="space-y-3 border-t border-gray-200 p-3">
            {LEVELS.filter((l) => l !== level && elsewhere.some((s) => s.level === l)).map((l) => (
              <div key={l}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{LEVEL_LABEL[l]}</p>
                <Groups list={elsewhere.filter((s) => s.level === l)} categories={categories} value={value} onToggle={toggle} />
              </div>
            ))}
          </div>
        </details>
      )}
    </fieldset>
  );
}
