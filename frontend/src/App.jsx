import { useEffect, useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { StoreProvider } from './store';
import { ToastProvider } from './components/ui';
import Sidebar from './components/Sidebar';
import LoginView from './components/LoginView';
import DashboardView from './components/DashboardView';
import StudentRegistrationView from './components/StudentRegistrationView';
import StudentProfileView from './components/StudentProfileView';
import TimetableView from './components/TimetableView';
import AttendanceView from './components/AttendanceView';
import ResultsView from './components/ResultsView';
import RescheduleLogView from './components/RescheduleLogView';
import TeachersView from './components/TeachersView';
import TeacherHomeView from './components/TeacherHomeView';
import BillingView from './components/BillingView';
import PaymentVoucherView from './components/PaymentVoucherView';
import ReportsView from './components/ReportsView';
import ManagementConfigView from './components/ManagementConfigView';
import ParentQRView, { ParentRegistrationForm } from './components/ParentQRView';
import StudentPortalView from './components/StudentPortalView';
import PaymentGatewayView from './components/PaymentGatewayView';
import CommandPalette from './components/CommandPalette';
import { NAV_ITEMS, navigate, navItemsFor } from './lib/nav';
import { can } from './lib/permissions';

const SESSION_KEY = 'annur-session';

// "#/students/AN-2026-001?x=1" -> { base: 'students', param: 'AN-2026-001' }
function readRoute() {
  const [path] = window.location.hash.replace(/^#\/?/, '').split('?');
  const [base = '', ...rest] = path.split('/');
  return { base, param: rest.join('/') || null };
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

const VIEWS = {
  dashboard: DashboardView,
  teacher: TeacherHomeView,
  reports: ReportsView,
  students: StudentRegistrationView,
  timetable: TimetableView,
  attendance: AttendanceView,
  results: ResultsView,
  reschedules: RescheduleLogView,
  teachers: TeachersView,
  billing: BillingView,
  vouchers: PaymentVoucherView,
  settings: ManagementConfigView,
  'parent-qr': ParentQRView,
  portal: StudentPortalView,
};

function Shell() {
  const [route, setRoute] = useState(readRoute);
  const [session, setSession] = useState(loadSession);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const role = session?.role;

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      setMenuOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }, [session]);

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

  // Public pages: no login needed (parents arrive from a QR code or a payment link)
  if (route.base === 'daftar') {
    return (
      <div className="min-h-dvh bg-gray-50 px-4 py-6 sm:py-10">
        <ParentRegistrationForm />
      </div>
    );
  }
  if (route.base === 'bayar') return <PaymentGatewayView invoiceNo={route.param} />;

  if (!session) {
    return (
      <LoginView
        onLogin={(r) => {
          setSession({ role: r });
          navigate(navItemsFor(r)[0].id);
        }}
      />
    );
  }

  const allowed = navItemsFor(role).map((n) => n.id);
  const current = allowed.includes(route.base) ? route.base : allowed[0];
  const View = current === 'students' && route.param ? StudentProfileView : VIEWS[current];
  const title = NAV_ITEMS.find((n) => n.id === current)?.label;

  const switchRole = (r) => {
    setSession({ role: r });
    const ok = navItemsFor(r).map((n) => n.id);
    if (!ok.includes(current)) navigate(ok[0]);
  };

  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar
        current={current}
        role={role}
        onRoleChange={switchRole}
        onSearch={can(role, 'search') ? () => setSearchOpen(true) : null}
        onLogout={() => {
          setSession(null);
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
        <View key={`${current}/${route.param ?? ''}`} role={role} param={route.param} />
      </main>

      {searchOpen && <CommandPalette role={role} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}
