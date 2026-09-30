import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginView from './components/LoginView';
import DashboardView from './components/DashboardView';
import StudentRegistrationView from './components/StudentRegistrationView';
import TimetableView from './components/TimetableView';
import RescheduleLogView from './components/RescheduleLogView';
import TeachersView from './components/TeachersView';
import BillingView from './components/BillingView';
import PaymentVoucherView from './components/PaymentVoucherView';
import ManagementConfigView from './components/ManagementConfigView';
import ParentQRView from './components/ParentQRView';
import LeadFunnelView from './components/LeadFunnelView';
import TeacherAttendanceView from './components/TeacherAttendanceView';
import TeacherPayrollView from './components/TeacherPayrollView';
import StaffHRView from './components/StaffHRView';
import HandoutRepositoryView from './components/HandoutRepositoryView';
import DynamicMasterDataView from './components/DynamicMasterDataView';
import ReportsSuiteView from './components/ReportsSuiteView';
import StudentAttendanceView from './components/StudentAttendanceView';
import { AppProvider, useApp } from './context/AppContext';

function MainAppContent() {
  const { user, currentRole, authChecked, login, logout, activeTab, setActiveTab } = useApp();

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-500">
        Memuatkan sesi…
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={login} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header user={user} onLogout={logout} />

      <div className="flex flex-1">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentRole={currentRole} />

        <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-5">
          <div className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
            currentRole === 'ADMIN'
              ? 'bg-purple-50/80 border-purple-200 text-purple-900'
              : currentRole === 'SUPERVISOR'
              ? 'bg-blue-50/80 border-blue-200 text-blue-900'
              : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
          }`}>
            <div className="flex items-center gap-2.5">
              <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider ${
                currentRole === 'ADMIN'
                  ? 'bg-purple-200 text-purple-900'
                  : currentRole === 'SUPERVISOR'
                  ? 'bg-blue-200 text-blue-900'
                  : 'bg-indigo-200 text-indigo-900'
              }`}>
                {currentRole === 'ADMIN' ? 'KAUNTER (ADMIN)' : currentRole === 'SUPERVISOR' ? 'OPERASI (SUPERVISOR)' : 'PENGARAH (MANAGEMENT)'}
              </span>
              <span className="font-semibold text-[11px]">
                {currentRole === 'ADMIN' && 'Operasi Kaunter: Pendaftaran, Kutipan Yuran • Had Baucar < RM500 • Kadar Guru Dirahsiakan'}
                {currentRole === 'SUPERVISOR' && 'Pengurusan Kualiti: Kawalan Jadual & Kapasiti, Kelulusan Cuti Staf (MC/EL/AL), Kelulusan Baucar RM500 - RM3,000'}
                {currentRole === 'MANAGEMENT' && 'Kuasa Eksekutif: Laporan Jualan, Hab Konfigurasi No-Code, Kelulusan Baucar > RM3,000 & Payroll Guru'}
              </span>
            </div>
            <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-lg border border-slate-200/80 shadow-2xs">
              {user.full_name}
            </span>
          </div>

          {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} currentRole={currentRole} />}
          {activeTab === 'leads' && <LeadFunnelView onConvertToStudent={() => setActiveTab('students')} currentRole={currentRole} />}
          {activeTab === 'students' && <StudentRegistrationView currentRole={currentRole} />}
          {activeTab === 'attendance' && <StudentAttendanceView />}
          {activeTab === 'timetable' && <TimetableView currentRole={currentRole} />}
          {activeTab === 'reschedules' && <RescheduleLogView currentRole={currentRole} />}
          {activeTab === 'handouts' && <HandoutRepositoryView currentRole={currentRole} />}
          {activeTab === 'teachers' && <TeachersView currentRole={currentRole} />}
          {activeTab === 'teacher_attendance' && <TeacherAttendanceView currentRole={currentRole} />}
          {activeTab === 'teacher_payroll' && currentRole !== 'ADMIN' && <TeacherPayrollView currentRole={currentRole} />}
          {activeTab === 'staff_hr' && <StaffHRView currentRole={currentRole} />}
          {activeTab === 'billing' && <BillingView currentRole={currentRole} />}
          {activeTab === 'expenses' && <PaymentVoucherView currentRole={currentRole} />}
          {activeTab === 'dynamic_master_data' && <DynamicMasterDataView currentRole={currentRole} />}
          {activeTab === 'reports_suite' && <ReportsSuiteView currentRole={currentRole} />}
          {activeTab === 'management_config' && <ManagementConfigView currentRole={currentRole} />}
          {activeTab === 'parent_qr' && <ParentQRView />}
        </main>
      </div>
    </div>
  );
}

// Parents open the registration form from the counter QR code without logging in
const isPublicRegistration = () => window.location.hash.startsWith('#/daftar');

export default function App() {
  const [publicRegistration, setPublicRegistration] = useState(isPublicRegistration);

  useEffect(() => {
    const onHashChange = () => setPublicRegistration(isPublicRegistration());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (publicRegistration) {
    return <ParentQRView publicMode />;
  }
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}