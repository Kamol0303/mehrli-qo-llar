import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { goBack } from './lib/goBack';
import AppDialogHost from './components/AppDialogHost';
import OnboardingFlow from './pages/OnboardingFlow';
import YandexHomePage from './pages/YandexHomePage';
import SuperAdminLogin from './pages/SuperAdminLogin';
import ProfilePage from './pages/ProfilePage';
import MyProfilePage from './pages/MyProfilePage';
import ChatPage from './pages/ChatPage';
import OrdersHistoryPage from './pages/drawer/OrdersHistoryPage';
import TrustedContactsPage from './pages/drawer/TrustedContactsPage';
import SafetyPage from './pages/drawer/SafetyPage';
import PaymentMethodsPage from './pages/drawer/PaymentMethodsPage';
import WorkerEarningsPage from './pages/drawer/WorkerEarningsPage';
import OrgSubscriptionPage from './pages/drawer/OrgSubscriptionPage';
import AdminDashboard from './pages/admin/Dashboard';
import AdminContracts from './pages/admin/Contracts';
import AdminApplications from './pages/admin/Applications';
import AdminDisputes from './pages/admin/Disputes';
import SuperAdminDashboard from './pages/super-admin/Dashboard';
import SuperAdminOrdersPage from './pages/super-admin/OrdersPage';
import SuperAdminWorkersPage from './pages/super-admin/WorkersPage';
import SuperAdminEmployersPage from './pages/super-admin/EmployersPage';
import SuperAdminSosPage from './pages/super-admin/SosPage';
import SuperAdminTariffsPage from './pages/super-admin/TariffsPage';
import SuperAdminMatchingPage from './pages/super-admin/MatchingPage';
import SuperAdminOrganizationsPage from './pages/super-admin/OrganizationsPage';
import SuperAdminAnalytics from './pages/super-admin/Analytics';
import SuperAdminSystem from './pages/super-admin/System';
import SuperAdminSettingsPage from './pages/super-admin/SettingsPage';
import SuperAdminLogsPage from './pages/super-admin/LogsPage';
import SuperAdminContractsPage from './pages/super-admin/ContractsPage';
import SuperAdminAdminUsers from './pages/super-admin/AdminUsers';
import SystemLogs from './pages/admin/SystemLogs';
import SystemSettings from './pages/admin/SystemSettings';
import UsersManagement from './pages/admin/UsersManagement';
import JobsManagement from './pages/admin/JobsManagement';
import VerificationManagement from './pages/admin/VerificationManagement';
import ContractPage from './pages/ContractPage';
import VerificationPage from './pages/VerificationPage';
import NotificationsPage from './pages/NotificationsPage';
import ForbiddenPage from './pages/ForbiddenPage';
import RateWorkerPage from './pages/RateWorkerPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { ThemeProvider } from './context/ThemeContext';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { useIsMobileUi } from './hooks/useIsMobileUi';
import { useAuth } from './hooks/useAuth';
import { useSiteGate } from './components/PlatformPresence';
import { closedSection } from './lib/platformGate';
import MobileShell from './mobile/shell/MobileShell';
import DesktopShell from './mobile/shell/DesktopShell';
import ChatMobile from './mobile/screens/ChatMobile';
import ProfileMobile from './mobile/screens/ProfileMobile';
import NotificationsMobile from './mobile/screens/NotificationsMobile';

function ContractsRedirect() {
  const { contractId } = useParams<{ contractId: string }>();
  return <Navigate to={`/contracts/${contractId}`} replace />;
}

function SplashScreen() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#102833] text-white px-6">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white p-2 shadow-2xl ring-4 ring-[#c6a15b]/60">
        <img
          src="/assets/brand/logo.png"
          alt="Mehrli qo'llar"
          className="h-full w-full object-contain"
        />
      </div>
      <h1 className="mt-5 text-2xl font-black tracking-tight text-white">Mehrli qo&apos;llar</h1>
      <p className="mt-1.5 text-xs font-medium text-[#c6a15b]">{t('onboarding.splash_subtitle')}</p>
    </div>
  );
}

function AppRoutes({ mobile }: { mobile: boolean }) {
  return (
    <Routes>
      <Route path="/" element={<YandexHomePage />} />
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="/auth" element={<OnboardingFlow />} />
      <Route path="/login" element={<Navigate to="/auth" replace />} />
      <Route path="/super-admin-login" element={<SuperAdminLogin />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      {/* Drawer & user routes */}
      <Route path="/orders-history" element={<ProtectedRoute><OrdersHistoryPage /></ProtectedRoute>} />
      <Route path="/trusted-contacts" element={<ProtectedRoute><TrustedContactsPage /></ProtectedRoute>} />
      <Route path="/safety" element={<ProtectedRoute><SafetyPage /></ProtectedRoute>} />
      <Route path="/payment-methods" element={<ProtectedRoute><PaymentMethodsPage /></ProtectedRoute>} />
      <Route
        path="/worker/earnings"
        element={
          <RoleProtectedRoute allowedRoles={['worker']}>
            <WorkerEarningsPage />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/organization/subscription"
        element={
          <RoleProtectedRoute allowedRoles={['employer']}>
            <OrgSubscriptionPage />
          </RoleProtectedRoute>
        }
      />

      <Route path="/worker/:userId" element={<ProfilePage />} />
      <Route path="/profile/:userId" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route
        path="/my-profile"
        element={<ProtectedRoute>{mobile ? <ProfileMobile /> : <MyProfilePage />}</ProtectedRoute>}
      />
      <Route
        path="/chat"
        element={<ProtectedRoute>{mobile ? <ChatMobile /> : <ChatPage />}</ProtectedRoute>}
      />
      <Route
        path="/notifications"
        element={<ProtectedRoute>{mobile ? <NotificationsMobile /> : <NotificationsPage />}</ProtectedRoute>}
      />
      <Route path="/rate/:applicationId" element={<ProtectedRoute><RateWorkerPage /></ProtectedRoute>} />
      <Route path="/contracts/:contractId" element={<ProtectedRoute><ContractPage /></ProtectedRoute>} />
      <Route path="/contracts/contracts/:contractId" element={<ContractsRedirect />} />
      <Route path="/verification" element={<ProtectedRoute><VerificationPage /></ProtectedRoute>} />

      {/* Redirect old worker/employer dashboard routes cleanly to fullscreen map / history */}
      <Route path="/worker/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/worker/nearby-jobs" element={<Navigate to="/" replace />} />
      <Route path="/worker/contracts" element={<Navigate to="/orders-history" replace />} />
      <Route path="/my-work" element={<Navigate to="/orders-history" replace />} />
      <Route path="/employer/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/employer/nearby-workers" element={<Navigate to="/" replace />} />
      <Route path="/employer/contracts" element={<Navigate to="/orders-history" replace />} />

      {/* Legacy admin routes (web-only enforced inside RoleProtectedRoute) */}
      <Route path="/admin/dashboard" element={<RoleProtectedRoute allowedRoles={['admin', 'super_admin']}><AdminDashboard /></RoleProtectedRoute>} />
      <Route path="/admin/users" element={<RoleProtectedRoute allowedRoles={['admin', 'super_admin']}><UsersManagement /></RoleProtectedRoute>} />
      <Route path="/admin/jobs" element={<RoleProtectedRoute allowedRoles={['admin', 'super_admin']}><JobsManagement /></RoleProtectedRoute>} />
      <Route path="/admin/contracts" element={<RoleProtectedRoute allowedRoles={['admin', 'super_admin']}><AdminContracts /></RoleProtectedRoute>} />
      <Route path="/admin/disputes" element={<RoleProtectedRoute allowedRoles={['admin', 'super_admin']}><AdminDisputes /></RoleProtectedRoute>} />
      <Route path="/admin/verification" element={<Navigate to="/super-admin/verification" replace />} />
      <Route path="/admin/logs" element={<RoleProtectedRoute allowedRoles={['super_admin', 'admin']}><SystemLogs /></RoleProtectedRoute>} />
      <Route path="/admin/settings" element={<RoleProtectedRoute allowedRoles={['super_admin', 'admin']}><SystemSettings /></RoleProtectedRoute>} />
      <Route path="/admin/contracts/:contractId" element={<RoleProtectedRoute allowedRoles={['super_admin', 'admin']}><ContractPage /></RoleProtectedRoute>} />

      {/* 13 Super Admin Web-only Sections */}
      <Route path="/super-admin/dashboard" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminDashboard /></RoleProtectedRoute>} />
      <Route path="/super-admin/live-map" element={<Navigate to="/super-admin/dashboard" replace />} />
      <Route path="/super-admin/orders" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminOrdersPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/workers" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminWorkersPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/employers" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminEmployersPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/verification" element={<RoleProtectedRoute allowedRoles={['super_admin']}><VerificationManagement /></RoleProtectedRoute>} />
      <Route path="/super-admin/contracts" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminContractsPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/contracts/:contractId" element={<RoleProtectedRoute allowedRoles={['super_admin']}><ContractPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/disputes" element={<RoleProtectedRoute allowedRoles={['super_admin']}><AdminDisputes /></RoleProtectedRoute>} />
      <Route path="/super-admin/sos" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminSosPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/tariffs" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminTariffsPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/matching" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminMatchingPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/organizations" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminOrganizationsPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/analytics" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminAnalytics /></RoleProtectedRoute>} />
      <Route path="/super-admin/logs" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminLogsPage /></RoleProtectedRoute>} />

      {/* Retained utility admin routes */}
      <Route path="/super-admin/users" element={<RoleProtectedRoute allowedRoles={['super_admin']}><UsersManagement /></RoleProtectedRoute>} />
      <Route path="/super-admin/jobs" element={<RoleProtectedRoute allowedRoles={['super_admin']}><JobsManagement /></RoleProtectedRoute>} />
      <Route path="/super-admin/settings" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminSettingsPage /></RoleProtectedRoute>} />
      <Route path="/super-admin/admins" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminAdminUsers /></RoleProtectedRoute>} />
      <Route path="/super-admin/system" element={<RoleProtectedRoute allowedRoles={['super_admin']}><SuperAdminSystem /></RoleProtectedRoute>} />
      <Route path="/super-admin/applications" element={<RoleProtectedRoute allowedRoles={['super_admin']}><AdminApplications /></RoleProtectedRoute>} />
      <Route
        path="/super-admin/messages"
        element={<RoleProtectedRoute allowedRoles={['super_admin']}>{mobile ? <ChatMobile /> : <ChatPage />}</RoleProtectedRoute>}
      />
      <Route
        path="/super-admin/notifications"
        element={<RoleProtectedRoute allowedRoles={['super_admin']}>{mobile ? <NotificationsMobile /> : <NotificationsPage />}</RoleProtectedRoute>}
      />
      <Route path="/super-admin/*" element={<Navigate to="/super-admin/dashboard" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function NativeBackHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const onBack = () => goBack(navigate);
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [navigate]);
  return null;
}

function AppShell() {
  const mobile = useIsMobileUi();
  const location = useLocation();
  const { loading } = useAuth();
  const gate = useSiteGate();
  const Shell = mobile ? MobileShell : DesktopShell;

  const isAutostart = new URLSearchParams(location.search).get('autostart') === '1';
  const isAdminPath =
    location.pathname.startsWith('/super-admin') || location.pathname.startsWith('/admin');

  const [showSplash, setShowSplash] = useState(() => {
    if (isAutostart || isAdminPath) return false;
    try {
      return sessionStorage.getItem('mq_splash_done') !== '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!showSplash) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem('mq_splash_done', '1');
      } catch {
        /* ignore */
      }
      setShowSplash(false);
    }, 1150);
    return () => window.clearTimeout(timer);
  }, [showSplash]);

  if (isAdminPath && Capacitor.isNativePlatform()) {
    return <ForbiddenPage />;
  }

  if (showSplash || (loading && gate.status === 'loading')) {
    return <SplashScreen />;
  }

  if (gate.status === 'loading') return <div className="min-h-screen bg-background" />;

  const panelOff =
    gate.status === 'ready' && closedSection(location.pathname, gate.state, gate.sections);
  const notice = gate.status === 'ready' ? gate.notice : '';

  return (
    <Shell>
      <div className="min-h-screen overflow-x-hidden bg-background text-foreground transition-colors duration-300">
        <NativeBackHandler />
        <AppDialogHost />
        {notice ? (
          <div className="mx-auto max-w-lg px-6 py-24 text-center">
            <p className="text-lg font-semibold">{notice}</p>
          </div>
        ) : panelOff ? (
          <div className="mx-auto max-w-lg px-6 py-24 text-center">
            <p className="text-lg font-semibold">Panel hozir yopiq.</p>
          </div>
        ) : (
          <AppRoutes mobile={mobile} />
        )}
        <OfflineBanner />
      </div>
    </Shell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <AuthProvider>
          <SubscriptionProvider>
            <ErrorBoundary>
              <AppShell />
            </ErrorBoundary>
          </SubscriptionProvider>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}
