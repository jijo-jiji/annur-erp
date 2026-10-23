// The columns a prospect CSV can have, and the headings people are likely to use for them (Malay or English).
// A file does not need every column: only a phone number per row, and a source in the file or chosen for the whole batch.
import { parseCsv } from './csv';

export const LEAD_COLUMNS = [
  { field: 'student_name', label: 'Nama pelajar', aliases: ['nama pelajar', 'nama murid', 'nama anak', 'student name', 'student', 'nama'] },
  { field: 'parent_name', label: 'Nama ibu bapa', aliases: ['nama ibu bapa', 'nama penjaga', 'ibu bapa', 'penjaga', 'parent name', 'parent', 'guardian'] },
  { field: 'phone', label: 'No. telefon', aliases: ['no telefon', 'no. telefon', 'telefon', 'no tel', 'no. tel', 'phone', 'phone number', 'whatsapp', 'no hp', 'no. hp', 'hp', 'mobile'] },
  { field: 'email', label: 'E-mel', aliases: ['e-mel', 'emel', 'email', 'e-mail'] },
  { field: 'form_level', label: 'Tingkatan', aliases: ['tingkatan', 'darjah', 'tingkatan / darjah', 'form', 'grade', 'level'] },
  { field: 'school_name', label: 'Sekolah', aliases: ['sekolah', 'school'] },
  { field: 'lead_source', label: 'Sumber', aliases: ['sumber', 'source', 'lead source'] },
  { field: 'campaign', label: 'Kempen', aliases: ['kempen', 'campaign'] },
  { field: 'subjects', label: 'Subjek', aliases: ['subjek', 'subjek diminati', 'subjects', 'subject'] },
  { field: 'enquiry_date', label: 'Tarikh pertanyaan', aliases: ['tarikh', 'tarikh pertanyaan', 'date', 'enquiry date'] },
  { field: 'notes', label: 'Catatan', aliases: ['catatan', 'nota', 'notes', 'remarks'] },
];

const plain = (text) => String(text ?? '').toLowerCase().replace(/[*_]/g, ' ').replace(/\s+/g, ' ').trim();

// Reads the file's text: which columns were recognised, which were not, and the rows as { field: value }
export function readLeadCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { error: 'Fail kosong atau tiada baris data selepas tajuk lajur.' };
  const [header, ...body] = table;
  const known = [];
  const ignored = [];
  const fieldAt = header.map((heading, i) => {
    const column = LEAD_COLUMNS.find((c) => c.aliases.includes(plain(heading)) || plain(c.label) === plain(heading));
    if (column && !known.some((k) => k.field === column.field)) { known.push(column); return column.field; }
    if (plain(heading)) ignored.push(heading.trim() || `Lajur ${i + 1}`);
    return null;
  });
  if (!known.some((c) => c.field === 'phone')) {
    return { error: 'Tiada lajur no. telefon. Tajuk yang diterima: No. telefon, Telefon, Phone, WhatsApp.', known, ignored };
  }
  const rows = body.map((cells) => Object.fromEntries(fieldAt.map((field, i) => [field, (cells[i] ?? '').trim()]).filter(([field]) => field)));
  return { known, ignored, rows };
}

// What people download to fill in: every column with two example rows
export const LEAD_TEMPLATE = {
  header: LEAD_COLUMNS.map((c) => c.label),
  rows: [
    ['Aina binti Ali', 'Puan Sarah', '012-345 6789', '', 'Tingkatan 5', 'SMK Telipot', 'TikTok Ads / Live', '', 'Fizik; Kimia', '', ''],
    ['', '', '019-888 1122', '', '', '', 'Facebook Ads & Page', '', '', '', 'Hanya nombor telefon pada borang iklan'],
  ],
};
