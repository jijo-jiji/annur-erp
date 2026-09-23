// Demo configuration for client presentations. The student population, invoices,
// attendance and exam marks are generated from this in ./generate.js so every
// screen shows consistent figures. Replace with API calls once the backend is live.

export const CENTRE = {
  name: 'Pusat Tuisyen An Nur',
  branch: 'Telipot',
  address: 'Tingkat 1 & 2, PT 105, Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan',
  phone: '013-983 8085',
  whatsapp: '60139838085',
  bank: 'Maybank 5640 0012 3456',
};

// The demo is frozen on this date so that due dates, arrears and "today's
// classes" line up with the generated history (Jan – Mar 2026).
export const DEMO_TODAY = '2026-03-13'; // Friday
export const CURRENT_MONTH = DEMO_TODAY.slice(0, 7);
export const HISTORY_MONTHS = ['2026-01', '2026-02', '2026-03'];

// Parent account in the demo is linked to this family (Razali bin Mahmud)
export const DEMO_PARENT_PHONE = '012-987 6541';
// Teacher account in the demo
export const DEMO_TEACHER = 'Z';

export const DAYS = ['JUMAAT', 'SABTU', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS'];

export const FORMS = [
  { id: 'F5', label: 'Tingkatan 5' },
  { id: 'F4', label: 'Tingkatan 4' },
  { id: 'F3', label: 'Tingkatan 3' },
  { id: 'F2', label: 'Tingkatan 2' },
  { id: 'F1', label: 'Tingkatan 1' },
  { id: 'S6', label: 'Darjah 6' },
  { id: 'S5', label: 'Darjah 5' },
];

export const SUBJECTS = [
  { code: 'FZ', name: 'Fizik', level: 'UPPER_SEC', stream: 'SAINS', active: true },
  { code: 'KIM', name: 'Kimia', level: 'UPPER_SEC', stream: 'SAINS', active: true },
  { code: 'BIO', name: 'Biologi', level: 'UPPER_SEC', stream: 'SAINS', active: true },
  { code: 'ADDMT', name: 'Matematik Tambahan', level: 'UPPER_SEC', stream: 'SAINS', active: true },
  { code: 'ACC', name: 'Prinsip Perakaunan', level: 'UPPER_SEC', stream: 'SASTERA', active: true },
  { code: 'BI', name: 'Bahasa Inggeris', level: 'SECONDARY', stream: 'TERAS', active: true },
  { code: 'BM', name: 'Bahasa Melayu', level: 'SECONDARY', stream: 'TERAS', active: true },
  { code: 'MATH', name: 'Matematik', level: 'SECONDARY', stream: 'TERAS', active: true },
  { code: 'SAINS', name: 'Sains', level: 'SECONDARY', stream: 'TERAS', active: true },
  { code: 'SEJ', name: 'Sejarah', level: 'SECONDARY', stream: 'TERAS', active: true },
  { code: 'GEO', name: 'Geografi', level: 'LOWER_SEC', stream: 'TERAS', active: true },
  { code: 'BM_R', name: 'Bahasa Melayu', level: 'PRIMARY', stream: 'TERAS', active: true },
  { code: 'BI_R', name: 'Bahasa Inggeris', level: 'PRIMARY', stream: 'TERAS', active: true },
  { code: 'MATH_R', name: 'Matematik', level: 'PRIMARY', stream: 'TERAS', active: true },
  { code: 'SAINS_R', name: 'Sains', level: 'PRIMARY', stream: 'TERAS', active: true },
];

export const TEACHERS = [
  { code: 'NAK', name: 'Nik Ahmad Khan', type: 'PERMANENT', subjects: 'Fizik (T4, T5)', phone: '019-911 0001', rate: 65, since: 2014 },
  { code: 'AZ', name: 'Azahari', type: 'PERMANENT', subjects: 'Sains (T1–T3)', phone: '019-911 0002', rate: 60, since: 2015 },
  { code: 'D', name: 'Diana', type: 'PERMANENT', subjects: 'Biologi (T5)', phone: '019-911 0003', rate: 60, since: 2016 },
  { code: 'F', name: 'Fadzlul', type: 'PERMANENT', subjects: 'Matematik (T1–T3)', phone: '019-911 0004', rate: 60, since: 2018 },
  { code: 'G', name: 'Ghazani', type: 'PERMANENT', subjects: 'Bahasa Melayu (T2, T4, T5)', phone: '019-911 0005', rate: 60, since: 2014 },
  { code: 'HK', name: 'Hakimi', type: 'PERMANENT', subjects: 'Matematik (T4, T5)', phone: '019-911 0006', rate: 60, since: 2017 },
  { code: 'K', name: 'Kamal', type: 'PERMANENT', subjects: 'Bahasa Melayu (T1, T3, D6)', phone: '019-911 0007', rate: 60, since: 2016 },
  { code: 'SAF', name: 'Safran', type: 'PERMANENT', subjects: 'Matematik (T3, T4)', phone: '019-911 0008', rate: 60, since: 2016 },
  { code: 'SF', name: 'Saiful', type: 'PERMANENT', subjects: 'Kimia (T4, T5)', phone: '019-911 0009', rate: 65, since: 2015 },
  { code: 'Z', name: 'Zakir', type: 'PERMANENT', subjects: 'Bahasa Inggeris (T2–T5)', phone: '019-911 0010', rate: 60, since: 2015 },
  { code: 'AZM', name: 'Zamri', type: 'PERMANENT', subjects: 'Matematik Tambahan (T4, T5)', phone: '019-911 0011', rate: 65, since: 2014 },
  { code: 'HS', name: 'Hasmini', type: 'PERMANENT', subjects: 'Sains (D5, D6)', phone: '019-911 0012', rate: 55, since: 2019 },
  { code: 'AM', name: 'Amin', type: 'PERMANENT', subjects: 'Biologi & Sains (T4, T5)', phone: '019-911 0013', rate: 60, since: 2018 },
  { code: 'A', name: 'Anis Sabreena', type: 'PERMANENT', subjects: 'Bahasa Inggeris (T1, D6)', phone: '019-911 0014', rate: 55, since: 2020 },
  { code: 'FQ', name: 'Faqihah', type: 'PERMANENT', subjects: 'Matematik (D5, D6)', phone: '019-911 0015', rate: 55, since: 2021 },
  { code: 'M', name: 'Maheran', type: 'PERMANENT', subjects: 'Sejarah & Geografi (T2–T5)', phone: '019-911 0016', rate: 60, since: 2016 },
  { code: 'AT', name: 'Atiqah', type: 'PERMANENT', subjects: 'Prinsip Perakaunan (T4, T5)', phone: '019-911 0017', rate: 60, since: 2018 },
  { code: 'ROS', name: 'Roslan', type: 'REPLACEMENT', subjects: 'Sejarah & Bahasa Melayu', phone: '019-922 0001', rate: 55, since: 2022 },
  { code: 'JUL', name: 'Dr. Juliana', type: 'REPLACEMENT', subjects: 'Sains Menengah', phone: '019-922 0002', rate: 55, since: 2021 },
  { code: 'ELY', name: 'Elyas', type: 'REPLACEMENT', subjects: 'Kimia & Sains', phone: '019-922 0003', rate: 55, since: 2022 },
  { code: 'BAH', name: 'Bahirah', type: 'REPLACEMENT', subjects: 'Bahasa Inggeris (T4, T5)', phone: '019-922 0004', rate: 55, since: 2023 },
  { code: 'SUL', name: 'Sulia', type: 'REPLACEMENT', subjects: 'Sejarah (T2–T5)', phone: '019-922 0005', rate: 55, since: 2020 },
  { code: 'BAL', name: 'Balkhis', type: 'REPLACEMENT', subjects: 'Kimia, Biologi, Fizik (T4, T5)', phone: '019-922 0006', rate: 55, since: 2021 },
];

export const ROOMS = ['Al-Farabi', 'Ibnu Sina', 'Al-Khawarizmi', 'Ibnu Khaldun', 'Al-Biruni', 'Ibnu Rushd', 'Ibnu Battuta', 'Al-Idrisi'];

// [day, start, end, subject, form, section, teacher, target enrolment]
// Targets drive the generated student population; ADDMT T4/T5 (A) are deliberately
// over capacity to show the capacity warning.
export const CLASS_ROWS = [
  ['JUMAAT', '09:00', '10:30', 'FZ', 'F4', 'A', 'NAK', 16],
  ['JUMAAT', '09:00', '10:30', 'MATH', 'F3', 'A', 'F', 18],
  ['JUMAAT', '09:00', '10:30', 'SEJ', 'F3', 'B', 'M', 14],
  ['JUMAAT', '09:00', '10:30', 'BI', 'F2', 'A', 'Z', 15],
  ['JUMAAT', '09:00', '10:30', 'BM_R', 'S6', 'A', 'K', 15],
  ['JUMAAT', '10:40', '12:10', 'BI', 'F4', 'A', 'Z', 19],
  ['JUMAAT', '10:40', '12:10', 'SEJ', 'F3', 'A', 'M', 20],
  ['JUMAAT', '10:40', '12:10', 'BM', 'F3', 'B', 'K', 15],
  ['JUMAAT', '10:40', '12:10', 'MATH', 'F2', 'A', 'F', 17],
  ['JUMAAT', '10:40', '12:10', 'BI_R', 'S6', 'A', 'A', 15],
  ['JUMAAT', '15:00', '16:30', 'ADDMT', 'F5', 'A', 'AZM', 21],
  ['JUMAAT', '15:00', '16:30', 'BI', 'F5', 'B', 'Z', 18],
  ['JUMAAT', '15:00', '16:30', 'SEJ', 'F5', 'C', 'M', 16],
  ['JUMAAT', '15:00', '16:30', 'ACC', 'F4', 'A', 'AT', 15],
  ['JUMAAT', '15:00', '16:30', 'BIO', 'F4', 'A', 'AM', 17],
  ['JUMAAT', '16:45', '18:15', 'SEJ', 'F5', 'B', 'M', 19],
  ['JUMAAT', '16:45', '18:15', 'ACC', 'F5', 'A', 'AT', 14],
  ['JUMAAT', '16:45', '18:15', 'SAINS', 'F5', 'C', 'AM', 15],
  ['JUMAAT', '16:45', '18:15', 'FZ', 'F5', 'A', 'NAK', 20],
  ['JUMAAT', '16:45', '18:15', 'ADDMT', 'F4', 'A', 'AZM', 22],
  ['SABTU', '09:00', '10:30', 'MATH_R', 'S6', 'A', 'FQ', 15],
  ['SABTU', '09:00', '10:30', 'BI', 'F4', 'B', 'Z', 17],
  ['SABTU', '09:00', '10:30', 'KIM', 'F4', 'A', 'SF', 16],
  ['SABTU', '09:00', '10:30', 'SAINS', 'F3', 'A', 'AZ', 19],
  ['SABTU', '09:00', '10:30', 'MATH', 'F3', 'B', 'SAF', 14],
  ['SABTU', '09:00', '10:30', 'BM', 'F1', 'A', 'K', 12],
  ['SABTU', '09:00', '10:30', 'SAINS_R', 'S5', 'A', 'HS', 10],
  ['SABTU', '10:45', '12:15', 'SAINS_R', 'S6', 'A', 'HS', 15],
  ['SABTU', '10:45', '12:15', 'SAINS', 'F2', 'A', 'AZ', 16],
  ['SABTU', '10:45', '12:15', 'BI', 'F3', 'A', 'Z', 16],
  ['SABTU', '10:45', '12:15', 'BM', 'F3', 'A', 'K', 17],
  ['SABTU', '10:45', '12:15', 'MATH_R', 'S5', 'A', 'FQ', 10],
  ['SABTU', '14:15', '15:45', 'KIM', 'F5', 'A', 'SF', 19],
  ['SABTU', '14:15', '15:45', 'MATH', 'F4', 'B', 'SAF', 15],
  ['SABTU', '14:15', '15:45', 'GEO', 'F3', 'A', 'M', 12],
  ['SABTU', '14:15', '15:45', 'BM', 'F2', 'A', 'G', 14],
  ['SABTU', '14:15', '15:45', 'BI', 'F1', 'A', 'A', 12],
  ['SABTU', '16:00', '17:30', 'ADDMT', 'F5', 'B', 'AZM', 15],
  ['SABTU', '16:00', '17:30', 'FZ', 'F5', 'B', 'NAK', 14],
  ['SABTU', '16:00', '17:30', 'SEJ', 'F2', 'A', 'M', 13],
  ['SABTU', '16:00', '17:30', 'MATH', 'F1', 'A', 'F', 12],
  ['SABTU', '16:00', '17:30', 'SAINS', 'F1', 'A', 'AZ', 12],
  ['ISNIN', '20:30', '22:00', 'BIO', 'F5', 'B', 'D', 17],
  ['ISNIN', '20:30', '22:00', 'SAINS', 'F5', 'B', 'AM', 12],
  ['ISNIN', '20:30', '22:00', 'MATH', 'F4', 'A', 'HK', 20],
  ['SELASA', '20:30', '22:00', 'BI', 'F5', 'A', 'Z', 19],
  ['SELASA', '20:30', '22:00', 'BM', 'F4', 'A', 'G', 18],
  ['RABU', '20:30', '22:00', 'MATH', 'F5', 'A', 'HK', 20],
  ['RABU', '20:30', '22:00', 'BM', 'F5', 'A', 'G', 17],
  ['RABU', '20:30', '22:00', 'KIM', 'F5', 'B', 'SF', 15],
  ['KHAMIS', '20:30', '22:00', 'BIO', 'F5', 'A', 'D', 18],
  ['KHAMIS', '20:30', '22:00', 'MATH', 'F5', 'B', 'HK', 19],
  ['KHAMIS', '20:30', '22:00', 'BM', 'F5', 'B', 'G', 16],
  ['KHAMIS', '20:30', '22:00', 'SEJ', 'F4', 'A', 'M', 17],
];

export const PRICING_TIERS = [
  { id: 1, category: 'SECONDARY', count: 4, rate: 60 },
  { id: 2, category: 'SECONDARY', count: 5, rate: 55 },
  { id: 3, category: 'SECONDARY', count: 6, rate: 55 },
  { id: 4, category: 'SECONDARY', count: 7, rate: 50 },
  { id: 5, category: 'SECONDARY', count: 8, rate: 50 },
  { id: 6, category: 'DARJAH_5', count: 2, rate: 50 },
  { id: 7, category: 'DARJAH_6', count: 4, rate: 50 },
];

export const SETTINGS = {
  regFee: 30,
  sessionMinutes: 90,
  classCapacity: 20,
  dueDay: 7,
  unpaidMonthsLimit: 2,
  noticeWeeks: 2,
  permanentRate: 60,
  replacementRate: 55,
};

// Discount rules. SIBLING is applied automatically in the monthly invoice run to
// every child after the eldest in the same family; others are assigned per student.
export const DISCOUNTS = [
  { id: 'SIBLING', label: 'Diskaun adik-beradik', type: 'PERCENT', value: 10, auto: true },
  { id: 'ASNAF', label: 'Asnaf / anak yatim', type: 'PERCENT', value: 50, auto: false },
  { id: 'STAFF', label: 'Anak kakitangan', type: 'PERCENT', value: 30, auto: false },
];

export const EXAMS = [
  { id: 'U1', name: 'Ujian 1', date: '2026-01-24' },
  { id: 'U2', name: 'Ujian 2', date: '2026-02-21' },
  { id: 'U3', name: 'Ujian 3', date: '2026-03-21' },
];
