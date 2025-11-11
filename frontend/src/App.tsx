import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { CentralAuthProvider } from './contexts/CentralAuthContext';
import { OrgAuthProvider } from './contexts/OrgAuthContext';
import { CentralAuthGuard } from './components/guards/CentralAuthGuard';
import { OrgAuthGuard } from './components/guards/OrgAuthGuard';
import { RoleGuard } from './components/guards/RoleGuard';
import { CentralAdminLayout } from './components/layouts/CentralAdminLayout';
import { OrgLayout } from './components/layouts/OrgLayout';

// Lazy load page components
const AdminLogin = lazy(() => import('./pages/admin/Login').then(m => ({ default: m.AdminLogin })));
const AdminRegister = lazy(() => import('./pages/admin/Register').then(m => ({ default: m.AdminRegister })));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard').then(m => ({ default: m.AdminDashboard })));
const AdminOrganizations = lazy(() => import('./pages/admin/Organizations').then(m => ({ default: m.AdminOrganizations })));

const OrgLogin = lazy(() => import('./pages/org/Login').then(m => ({ default: m.OrgLogin })));
const OrgRegister = lazy(() => import('./pages/org/Register').then(m => ({ default: m.OrgRegister })));
const OrgDashboard = lazy(() => import('./pages/org/Dashboard').then(m => ({ default: m.OrgDashboard })));
const OrgAdminDashboard = lazy(() => import('./pages/org/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const OrgDoctors = lazy(() => import('./pages/org/Doctors').then(m => ({ default: m.OrgDoctors })));
const OrgPatients = lazy(() => import('./pages/org/Patients').then(m => ({ default: m.OrgPatients })));
const OrgAppointments = lazy(() => import('./pages/org/Appointments').then(m => ({ default: m.OrgAppointments })));
const OrgBookAppointment = lazy(() => import('./pages/org/BookAppointment').then(m => ({ default: m.OrgBookAppointment })));
const OrgMyAppointments = lazy(() => import('./pages/org/MyAppointments').then(m => ({ default: m.OrgMyAppointments })));
const OrgProfile = lazy(() => import('./pages/org/Profile').then(m => ({ default: m.OrgProfile })));

// Loading fallback
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" />
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <CentralAuthProvider>
        <OrgAuthProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Root redirect */}
              <Route path="/" element={<Navigate to="/admin/login" replace />} />

              {/* Central Admin routes */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/register" element={<AdminRegister />} />
              <Route element={<CentralAuthGuard />}>
                <Route element={<CentralAdminLayout />}>
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/organizations" element={<AdminOrganizations />} />
                </Route>
              </Route>

              {/* Organization routes */}
              <Route path="/:orgName/login" element={<OrgLogin />} />
              <Route path="/:orgName/register" element={<OrgRegister />} />
              <Route element={<OrgAuthGuard />}>
                <Route path="/:orgName" element={<OrgLayout />}>
                  <Route path="dashboard" element={<OrgDashboard />} />
                  <Route path="admin/dashboard" element={<RoleGuard allowedRoles={['admin']}><OrgAdminDashboard /></RoleGuard>} />
                  <Route path="doctor/dashboard" element={<RoleGuard allowedRoles={['doctor']}><OrgAppointments /></RoleGuard>} />
                  <Route path="doctors" element={<OrgDoctors />} />
                  <Route path="patients" element={<OrgPatients />} />
                  <Route path="appointments" element={<OrgAppointments />} />
                  <Route path="patient/appointments/book" element={<OrgBookAppointment />} />
                  <Route path="patient/appointments" element={<OrgMyAppointments />} />
                  <Route path="patient/profile" element={<OrgProfile />} />
                  {/* Redirect old profile path to new path */}
                  <Route path="profile" element={<Navigate to="patient/profile" replace />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </OrgAuthProvider>
      </CentralAuthProvider>
    </BrowserRouter>
  );
}

export default App;
