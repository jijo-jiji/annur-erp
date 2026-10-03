import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CalendarClock,
  GraduationCap,
  Receipt,
  FileText,
  Settings,
  QrCode,
  ClipboardCheck,
  Award,
  BarChart3,
  Filter,
  BookOpen,
  UserCheck,
  Wallet,
  Briefcase,
  Database,
} from 'lucide-react';
import { can } from './permissions';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard, perm: 'dashboard' },
  { id: 'reports', label: 'Laporan', icon: BarChart3, perm: 'reports.view' },
  { id: 'leads', label: 'Pertanyaan & prospek', icon: Filter, perm: 'leads.view', group: 'Pendaftaran' },
  { id: 'students', label: 'Pelajar', icon: Users, perm: 'students.view', group: 'Pendaftaran' },
  { id: 'parent-qr', label: 'Pendaftaran QR', icon: QrCode, perm: 'qr.view', group: 'Pendaftaran' },
  { id: 'timetable', label: 'Jadual kelas', icon: CalendarDays, perm: 'timetable.view', group: 'Akademik' },
  { id: 'attendance', label: 'Kedatangan pelajar', icon: ClipboardCheck, perm: 'attendance.take', group: 'Akademik' },
  { id: 'results', label: 'Keputusan ujian', icon: Award, perm: 'results.view', group: 'Akademik' },
  { id: 'reschedules', label: 'Batal & ganti kelas', icon: CalendarClock, perm: 'reschedules.view', group: 'Akademik' },
  { id: 'handouts', label: 'Nota & modul', icon: BookOpen, perm: 'handouts.view', group: 'Akademik' },
  { id: 'teachers', label: 'Guru & elaun', icon: GraduationCap, perm: 'teachers.view', group: 'Guru', labelWithout: ['teachers.pay', 'Guru'] },
  { id: 'teacher-attendance', label: 'Kehadiran guru', icon: UserCheck, perm: 'teachers.attendance', group: 'Guru' },
  { id: 'payroll', label: 'Gaji guru', icon: Wallet, perm: 'payroll.view', group: 'Guru' },
  { id: 'billing', label: 'Yuran & resit', icon: Receipt, perm: 'billing.view', group: 'Kewangan' },
  { id: 'vouchers', label: 'Baucar bayaran', icon: FileText, perm: 'vouchers.view', group: 'Kewangan' },
  { id: 'staff', label: 'Staf: kehadiran & cuti', icon: Briefcase, perm: 'staff.view', group: 'Pentadbiran' },
  { id: 'master-data', label: 'Data induk', icon: Database, perm: 'masterdata.view', group: 'Pentadbiran' },
  { id: 'settings', label: 'Tetapan', icon: Settings, perm: 'settings.view', group: 'Pentadbiran' },
];

export function navItemsFor(role) {
  return NAV_ITEMS.filter((n) => can(role, n.perm)).map((n) =>
    n.labelWithout && !can(role, n.labelWithout[0]) ? { ...n, label: n.labelWithout[1] } : n,
  );
}

export function navigate(route) {
  window.location.hash = `/${route}`;
}

// Full URL for a public page (registration link shared by QR or WhatsApp)
export function publicUrl(route) {
  return `${window.location.origin}${window.location.pathname}#/${route}`;
}
