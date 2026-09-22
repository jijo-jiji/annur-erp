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
  Home,
  ClipboardCheck,
  Award,
  BarChart3,
} from 'lucide-react';
import { can } from './permissions';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard, perm: 'dashboard' },
  { id: 'teacher', label: 'Ringkasan', icon: LayoutDashboard, perm: 'teacher.home' },
  { id: 'reports', label: 'Laporan', icon: BarChart3, perm: 'reports.view' },
  { id: 'students', label: 'Pelajar', icon: Users, perm: 'students.view', group: 'Akademik' },
  { id: 'timetable', label: 'Jadual kelas', icon: CalendarDays, perm: 'timetable.view', group: 'Akademik' },
  { id: 'attendance', label: 'Kedatangan', icon: ClipboardCheck, perm: 'attendance.take', group: 'Akademik' },
  { id: 'results', label: 'Keputusan ujian', icon: Award, perm: 'results.view', group: 'Akademik' },
  { id: 'reschedules', label: 'Batal & ganti kelas', icon: CalendarClock, perm: 'reschedules.view', group: 'Akademik' },
  { id: 'teachers', label: 'Guru & elaun', icon: GraduationCap, perm: 'teachers.view', group: 'Akademik', labelWithout: ['teachers.pay', 'Guru'] },
  { id: 'billing', label: 'Yuran & resit', icon: Receipt, perm: 'billing.view', group: 'Kewangan' },
  { id: 'vouchers', label: 'Baucar bayaran', icon: FileText, perm: 'vouchers.view', group: 'Kewangan' },
  { id: 'parent-qr', label: 'Pendaftaran QR', icon: QrCode, perm: 'qr.view', group: 'Pentadbiran' },
  { id: 'settings', label: 'Tetapan', icon: Settings, perm: 'settings.view', group: 'Pentadbiran' },
  { id: 'portal', label: 'Portal pelajar', icon: Home, perm: 'portal.view' },
];

export function navItemsFor(role) {
  return NAV_ITEMS.filter((n) => can(role, n.perm)).map((n) =>
    n.labelWithout && !can(role, n.labelWithout[0]) ? { ...n, label: n.labelWithout[1] } : n,
  );
}

export function navigate(route) {
  window.location.hash = `/${route}`;
}

// Full URL for a public page (payment / registration links shared by WhatsApp)
export function publicUrl(route) {
  return `${window.location.origin}${window.location.pathname}#/${route}`;
}
