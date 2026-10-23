import { useState } from 'react';
import { Input, Select } from './ui';

const OTHER = '__other__';

// A school is chosen from the centre's list (Data induk), with "Lain-lain" to type one that is not listed.
// The value is the school's name, so older records and the reports keep reading the same way.
export default function SchoolPicker({ value, onChange, schools, label = 'Sekolah', required = false }) {
  const listed = schools.some((s) => s.label === value);
  const [typing, setTyping] = useState(false);
  const showText = typing || (Boolean(value) && !listed);

  return (
    <div className="space-y-3">
      <Select
        label={label}
        required={required}
        value={showText ? OTHER : value || ''}
        onChange={(e) => {
          if (e.target.value === OTHER) { setTyping(true); onChange(''); } else { setTyping(false); onChange(e.target.value); }
        }}
      >
        <option value="">{required ? 'Pilih sekolah' : 'Belum diketahui'}</option>
        {schools.map((s) => <option key={s.value} value={s.label}>{s.label}</option>)}
        <option value={OTHER}>Lain-lain (taip nama)</option>
      </Select>
      {showText && (
        <Input
          label="Nama sekolah"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          hint="Cadangkan sekolah baharu di Data induk supaya ia muncul dalam senarai."
        />
      )}
    </div>
  );
}
