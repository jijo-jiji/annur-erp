import React, { useState } from 'react';
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
import StudentPortalView from './components/StudentPortalView';
import ParentQRView from './components/ParentQRView';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentRole, setCurrentRole] = useState('ADMIN'); // 'ADMIN', 'SUPERVISOR', 'MANAGEMENT', 'STUDENT_PARENT'
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleLogin = (role) => {
    setCurrentRole(role);
    setIsLoggedIn(true);
    if (role === 'STUDENT_PARENT') {
      setActiveTab('student_portal');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header
        currentRole={currentRole}
        setRole={(role) => {
          setCurrentRole(role);
          if (role === 'STUDENT_PARENT') {
            setActiveTab('student_portal');
          } else if (activeTab === 'student_portal') {
            setActiveTab('dashboard');
          }
        }}
        onLogout={handleLogout}
      />

      <div className="flex flex-1">
        {currentRole !== 'STUDENT_PARENT' && (
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentRole={currentRole} />
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full">
          {currentRole === 'STUDENT_PARENT' ? (
            <StudentPortalView />
          ) : (
            <>
              {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
              {activeTab === 'students' && <StudentRegistrationView />}
              {activeTab === 'timetable' && <TimetableView />}
              {activeTab === 'reschedules' && <RescheduleLogView />}
              {activeTab === 'teachers' && <TeachersView />}
              {activeTab === 'billing' && <BillingView />}
              {activeTab === 'expenses' && <PaymentVoucherView currentRole={currentRole} />}
              {activeTab === 'management_config' && <ManagementConfigView />}
              {activeTab === 'parent_qr' && <ParentQRView />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}