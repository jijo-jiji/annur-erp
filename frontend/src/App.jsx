import { useEffect, useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { StoreProvider } from './store';
import { ToastProvider, useToast } from './components/ui';
import Sidebar from './components/Sidebar';
import LoginView from './components/LoginView';
import { ChangePasswordModal, ForcedPasswordChange } from './components/ChangePassword';
import CommandPalette from './components/CommandPalette';
import StudentRegistrationView from './components/StudentRegistrationView';
import StudentProfileView from './components/StudentProfileView';
import BillingView from './components/BillingView';
import TimetableView from './components/TimetableView';
import AttendanceView from './components/AttendanceView';
import ResultsView from './components/ResultsView';
import RescheduleLogView from './components/RescheduleLogView';
import TeachersView from './components/TeachersView';
import PaymentVoucherView from './components/PaymentVoucherView';
import DashboardView from './components/DashboardView';
import ReportsView from './components/ReportsView';
import ManagementConfigView from './components/ManagementConfigView';
import ParentQRView, { ParentRegistrationForm } from './components/ParentQRView';
import LeadFunnelView from './components/LeadFunnelView';
import HandoutRepositoryView from './components/HandoutRepositoryView';
import TeacherAttendanceView from './components/TeacherAttendanceView';
import TeacherPayrollView from './components/TeacherPayrollView';
import StaffHRView from './components/StaffHRView';
import MasterDataView from './components/MasterDataView';
import { NAV_ITEMS, navigate, navItemsFor } from './lib/nav';
import { can } from './lib/permissions';

// "#/students/AN-2026-001?x=1" -> { base: 'students', param: 'AN-2026-001' }
function readRoute() {
  const [path] = window.location.hash.replace(/^#\/?/, '').split('?');
  const [base = '', ...rest] = path.split('/');
  return { base, param: rest.join('/') || null };
}

const VIEWS = {
  dashboard: DashboardView,
  reports: ReportsView,
  leads: LeadFunnelView,
  students: StudentRegistrationView,
  'parent-qr': ParentQRView,
  timetable: TimetableView,
  attendance: AttendanceView,
  results: ResultsView,
  reschedules: RescheduleLogView,
  handouts: HandoutRepositoryView,
  teachers: TeachersView,
  'teacher-attendance': TeacherAttendanceView,
  payroll: TeacherPayrollView,
  billing: BillingView,
  vouchers: PaymentVoucherView,
  staff: StaffHRView,
  'master-data': MasterDataView,
  settings: ManagementConfigView,
};

function Shell() {
  const { user, currentRole: role, authChecked, login, logout, changePassword } = useApp();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [route, setRoute] = useState(readRoute);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      setMenuOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Ctrl/Cmd + K opens search anywhere
  useEffect(() => {
    if (!can(role, 'search')) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [role]);

  // Public page: parents arrive from the QR code, no login needed
  if (route.base === 'daftar') {
    return (
      <div className="min-h-dvh bg-gray-50 px-4 py-6 sm:py-10">
        <ParentRegistrationForm />
      </div>
    );
  }

  if (!authChecked) return <div className="grid min-h-dvh place-items-center text-sm text-gray-500">Memuatkan…</div>;
  if (!user) return <LoginView onLogin={login} />;
  if (user.must_change_password) return <ForcedPasswordChange user={user} onChange={changePassword} onLogout={() => { logout(); navigate(''); }} />;

  const allowed = navItemsFor(role).filter((n) => VIEWS[n.id]).map((n) => n.id);
  const current = allowed.includes(route.base) ? route.base : allowed[0];
  const View = current === 'students' && route.param ? StudentProfileView : VIEWS[current];
  const title = NAV_ITEMS.find((n) => n.id === current)?.label;

  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar
        current={current}
        role={role}
        user={user}
        items={navItemsFor(role).filter((n) => VIEWS[n.id])}
        onSearch={can(role, 'search') ? () => setSearchOpen(true) : null}
        onChangePassword={() => setPasswordOpen(true)}
        onLogout={() => {
          logout();
          navigate('');
        }}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} className="-ml-1.5 rounded-md p-1.5 text-gray-600 hover:bg-gray-100" aria-label="Buka menu">
          <Menu className="size-5" />
        </button>
        <span className="flex-1 text-[15px] font-semibold text-gray-900">{title}</span>
        {can(role, 'search') && (
          <button type="button" onClick={() => setSearchOpen(true)} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100" aria-label="Cari">
            <Search className="size-5" />
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <View
          key={`${current}/${route.param ?? ''}`}
          role={role}
          param={route.param}
        />
      </main>

      {searchOpen && <CommandPalette role={role} onClose={() => setSearchOpen(false)} />}
      {passwordOpen && <ChangePasswordModal onChange={changePassword} onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}

// The data layer reports through the shell's toast system
function Providers({ children }) {
  const notify = useToast();
  return (
    <AppProvider notify={notify}>
      <StoreProvider>{children}</StoreProvider>
    </AppProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Providers>
        <Shell />
      </Providers>
    </ToastProvider>
  );
}
