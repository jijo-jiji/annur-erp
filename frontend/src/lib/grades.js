import { useEffect, useState } from 'react';
import { request } from '../api/client';

// Grade (form) list from master data 1_form: code, label, level, next grade, description.
// Fetched once and shared; the fallback is only used until the list arrives or if it cannot load.
const FALLBACK = [
  { code: 'S5', label: 'Darjah 5', level: 'PRIMARY', next: 'S6', description: '' },
  { code: 'S6', label: 'Darjah 6', level: 'PRIMARY', next: 'F1', description: '' },
  { code: 'F1', label: 'Tingkatan 1', level: 'LOWER', next: 'F2', description: '' },
  { code: 'F2', label: 'Tingkatan 2', level: 'LOWER', next: 'F3', description: '' },
  { code: 'F3', label: 'Tingkatan 3', level: 'LOWER', next: 'F4', description: '' },
  { code: 'F4', label: 'Tingkatan 4', level: 'UPPER', next: 'F5', description: '' },
  { code: 'F5', label: 'Tingkatan 5', level: 'UPPER', next: '', description: '' },
];
export const LEVEL_LABELS = { PRIMARY: 'Sekolah Rendah', LOWER: 'Menengah Rendah', UPPER: 'Menengah Atas' };

let cache = null;
let pending = null;
const listeners = new Set();

function load(force = false) {
  if (pending && !force) return pending;
  pending = request('/business-config/grades/')
    .then((rows) => {
      cache = Array.isArray(rows) && rows.length ? rows : null;
      listeners.forEach((fn) => fn(cache));
    })
    .catch(() => { pending = null; });
  return pending;
}

// Call after the grade list is changed in master data
export const refreshGrades = () => load(true);

export function useGrades() {
  const [rows, setRows] = useState(cache);
  useEffect(() => {
    listeners.add(setRows);
    load();
    return () => { listeners.delete(setRows); };
  }, []);
  const list = rows || FALLBACK;
  const byCode = Object.fromEntries(list.map((g) => [g.code, g]));
  return {
    grades: list, // lowest first
    // Drop-downs list the highest grade first, as before (most students are Tingkatan 5)
    forms: [...list].reverse().map((g) => ({ value: g.code, label: g.label, next: g.next, level: g.level })),
    formLabel: (code) => byCode[code]?.label || code || '-',
    isForm: (code) => Boolean(byCode[code]),
  };
}
