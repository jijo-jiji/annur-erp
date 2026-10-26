// Two-way reports (Phase H): the kinds of a teacher's report about a student, and the follow-up status shared with
// complaints about teachers. Same codes as the server (students.StudentReport, teachers.TeacherComplaint).
export const REPORT_CATEGORIES = [
  { value: 'ACADEMIC', label: 'Akademik' },
  { value: 'BEHAVIOUR', label: 'Disiplin / tingkah laku' },
  { value: 'ATTENDANCE', label: 'Kehadiran' },
  { value: 'HOMEWORK', label: 'Kerja rumah' },
  { value: 'OTHER', label: 'Lain-lain' },
];
export const REPORT_STATUS = { OPEN: { label: 'Baru', tone: 'amber' }, IN_PROGRESS: { label: 'Dalam tindakan', tone: 'blue' }, RESOLVED: { label: 'Selesai', tone: 'green' } };
// Who a complaint about a teacher came from
export const COMPLAINANTS = [
  { value: 'PARENT', label: 'Ibu bapa' },
  { value: 'STUDENT', label: 'Pelajar' },
  { value: 'STAFF', label: 'Staf' },
  { value: 'OTHER', label: 'Lain-lain' },
];
