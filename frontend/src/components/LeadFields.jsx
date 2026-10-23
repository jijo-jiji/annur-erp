import { useMemo } from 'react';
import { subjectsForForm } from '../lib/domain';
import { FORMS, formLabel, STREAM_LABEL } from '../lib/format';
import { useGrades } from '../lib/grades';
import { useStore } from '../store';
import SchoolPicker from './SchoolPicker';
import { cx, Input, Select, Textarea } from './ui';

// A grade's level (master data) -> the level the subject list uses
const SUBJECT_LEVEL = { PRIMARY: 'PRIMARY', LOWER: 'LOWER_SEC', UPPER: 'UPPER_SEC' };
const STREAM_ORDER = ['TERAS', 'SAINS', 'SASTERA'];

// The subjects for one tingkatan, in the two groups staff need:
//   offered: classes are open for this tingkatan, so the student can be enrolled now (same rule as registration)
//   others:  taught at this level but no class opened yet, still worth noting as an interest
export function useSubjectsFor(form) {
  const { subjects, classes } = useStore();
  const { grades } = useGrades();
  return useMemo(() => {
    if (!form) return { offered: [], others: [] };
    const level = SUBJECT_LEVEL[grades.find((g) => g.code === form)?.level];
    const offered = subjectsForForm(subjects, form, classes);
    const offeredCodes = new Set(offered.map((s) => s.code));
    return { offered, others: subjects.filter((s) => s.active && s.level === level && !offeredCodes.has(s.code)) };
  }, [form, subjects, classes, grades]);
}

// Teras / Sains / Sastera headings, only when the list really has more than one stream
function byStream(list) {
  const groups = STREAM_ORDER.map((stream) => [stream, list.filter((s) => (s.stream || 'TERAS') === stream)]).filter(([, items]) => items.length);
  return groups.length > 1 ? groups.map(([stream, items]) => [STREAM_LABEL[stream] ?? stream, items]) : [['', list]];
}

function Chips({ items, selected, onToggle, tone }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => {
        const on = selected.includes(s.code);
        return (
          <button
            type="button"
            key={s.code}
            onClick={() => onToggle(s.code)}
            aria-pressed={on}
            className={cx(
              'rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors',
              on ? 'border-brand-700 bg-brand-700 text-white' : tone === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

// Subjects shown for the chosen tingkatan only, so staff pick from what is really on offer
export function SubjectPicker({ form, value, onToggle }) {
  const { subjects } = useStore();
  const { offered, others } = useSubjectsFor(form);
  const shown = new Set([...offered, ...others].map((s) => s.code));
  // chosen earlier for another tingkatan: kept, but pointed out so the mismatch is seen and can be undone
  const mismatched = value.filter((code) => !shown.has(code)).map((code) => subjects.find((s) => s.code === code) ?? { code, name: code });

  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-gray-700">
        Subjek diminati{form && <span className="font-normal text-gray-500"> · {formLabel(form)}</span>}
      </legend>
      {!form ? (
        <p className="rounded-md border border-dashed border-gray-300 px-3 py-3 text-[13px] text-gray-500">
          Pilih tingkatan dahulu. Hanya subjek untuk tingkatan itu akan dipaparkan.
        </p>
      ) : (
        <div className="space-y-3">
          {offered.length === 0 && others.length === 0 && (
            <p className="text-[13px] text-gray-500">Tiada subjek untuk tingkatan ini. Subjek ditambah dalam Tetapan.</p>
          )}
          {offered.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">Kelas dibuka untuk {formLabel(form)}</p>
              {byStream(offered).map(([heading, items]) => (
                <div key={heading || 'all'}>
                  {heading && <p className="mb-1 text-xs text-gray-400">{heading}</p>}
                  <Chips items={items} selected={value} onToggle={onToggle} />
                </div>
              ))}
            </div>
          )}
          {others.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">{offered.length ? 'Subjek lain pada peringkat ini (kelas belum dibuka)' : 'Subjek pada peringkat ini (kelas belum dibuka)'}</p>
              {byStream(others).map(([heading, items]) => (
                <div key={heading || 'all'}>
                  {heading && <p className="mb-1 text-xs text-gray-400">{heading}</p>}
                  <Chips items={items} selected={value} onToggle={onToggle} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {mismatched.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-amber-800">Dipilih untuk tingkatan lain: klik untuk buang</p>
          <Chips items={mismatched} selected={value} onToggle={onToggle} tone="warn" />
        </div>
      )}
    </fieldset>
  );
}

// The prospect's details. Only the phone number and the source are required: the rest is filled in as
// the follow-up goes on, and "Belum lengkap" on the card says what is still missing.
export default function LeadFields({ value, onChange, sources, campaigns, schools }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const toggleSubject = (code) => set({
    interested_subjects: value.interested_subjects.includes(code)
      ? value.interested_subjects.filter((c) => c !== code)
      : [...value.interested_subjects, code],
  });
  // a campaign saved before the list existed is still shown, so editing never silently drops it
  const campaignOptions = campaigns.includes(value.campaign) || !value.campaign ? campaigns : [value.campaign, ...campaigns];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="No. telefon" type="tel" required value={value.phone} onChange={(e) => set({ phone: e.target.value })} hint="Cukup dengan nombor telefon dan sumber untuk menyimpan." />
        <Select label="Sumber" required value={value.lead_source} onChange={(e) => set({ lead_source: e.target.value })}>
          <option value="">Pilih sumber</option>
          {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Input label="Nama pelajar" value={value.student_name} onChange={(e) => set({ student_name: e.target.value })} />
        <Input label="Nama ibu bapa / penjaga" value={value.parent_name} onChange={(e) => set({ parent_name: e.target.value })} />
        <Select label="Tingkatan / darjah" value={value.form_level} onChange={(e) => set({ form_level: e.target.value })}>
          <option value="">Belum diketahui</option>
          {FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </Select>
        <SchoolPicker value={value.school_name} onChange={(school_name) => set({ school_name })} schools={schools} />
        <Input label="E-mel" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} />
        <Select label="Kempen" value={value.campaign} onChange={(e) => set({ campaign: e.target.value })} hint="Senarai kempen diurus dalam Data induk.">
          <option value="">Tiada kempen</option>
          {campaignOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <SubjectPicker form={value.form_level} value={value.interested_subjects} onToggle={toggleSubject} />
      <Textarea label="Catatan" rows={2} value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
    </>
  );
}
