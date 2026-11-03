import { lazy, Suspense, useEffect } from "react";
import { Navigate, Routes, Route, useNavigate } from "react-router-dom";

import {
  AuthSplash,
  GuestOnly,
  RequireAdmin,
  RequireAdminNoOrg,
  RequireAuth,
} from "./components/AuthGuard.tsx";
import AppLayout from "./components/AppLayout.tsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.tsx";
import { AdminPageSkeleton } from "./components/ui/Skeleton.tsx";
import { useAuth } from "./context/useAuth";
import { isAdminProfile } from "./context/auth-context.ts";
import ChangeTempPassword from "./pages/ChangeTempPassword.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import EditPatientPage from "./pages/EditPatientPage.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import MonitorPage from "./pages/MonitorPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import PasswordResetRequest from "./pages/PasswordResetRequest.tsx";
import PatientsPage from "./pages/PatientsPage.tsx";
import ProfilePage from "./pages/ProfilePage.tsx";
import ProfileSecurityPage from "./pages/ProfileSecurityPage.tsx";
import ReportsPage from "./pages/ReportsPage.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Signin from "./pages/Signin.tsx";
import AdminSignin from "./pages/admin/AdminSignin.tsx";
import AdminRequestAccess from "./pages/admin/AdminRequestAccess.tsx";
import AdminOnboarding from "./pages/admin/AdminOnboarding.tsx";
import AdminLayout from "./pages/admin/AdminLayout.tsx";

/* Admin pages are code-split: the console loads its chunk on first visit. */
const AdminOverviewPage = lazy(() => import("./pages/admin/AdminOverviewPage.tsx"));
const AdminMembersPage = lazy(() => import("./pages/admin/AdminMembersPage.tsx"));
const AdminAuditPage = lazy(() => import("./pages/admin/AdminAuditPage.tsx"));
const AdminOrgPage = lazy(() => import("./pages/admin/AdminOrgPage.tsx"));
const AdminProfilePage = lazy(() => import("./pages/admin/AdminProfilePage.tsx"));
const AdminNotFound = lazy(() => import("./pages/admin/AdminNotFound.tsx"));

/** Admin lazy-page wrapper: skeleton fallback + retryable error boundary. */
function AdminSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Suspense>
  );
}

/**
 * Clinical page wrapper: a rendering crash must not blank the whole pane like
 * a broken admin page must not. Same retryable boundary the console uses.
 */
function ClinicalSection({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function App() {
  const { recovering, clearRecovery, idling, clearIdle } = useAuth();
  const navigate = useNavigate();

  // Password-recovery links land on the Site URL root; route into the reset
  // flow as soon as the recovery token is detected.
  useEffect(() => {
    if (recovering) {
      navigate("/reset-password", { replace: true });
      clearRecovery();
    }
  }, [recovering, clearRecovery, navigate]);

  return (
    <>
      {idling ? <IdleWarning onDismiss={clearIdle} /> : null}
      <Routes>
        {/* Clinical sign-in (clinicians use this; no public registration). */}
        <Route
          path="/signin"
          element={
            <GuestOnly>
              <Signin />
            </GuestOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestOnly>
              <ForgotPassword />
            </GuestOnly>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-request" element={<PasswordResetRequest />} />

        {/* Administrator segment: request -> confirmation -> org -> console. */}
        <Route
          path="/admin/signin"
          element={
            <GuestOnly home="/admin">
              <AdminSignin />
            </GuestOnly>
          }
        />
        <Route
          path="/admin/request"
          element={
            <GuestOnly home="/admin">
              <AdminRequestAccess />
            </GuestOnly>
          }
        />
        <Route
          path="/admin/onboarding"
          element={
            <RequireAdminNoOrg>
              <AdminOnboarding />
            </RequireAdminNoOrg>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminSection><AdminOverviewPage /></AdminSection>} />
          <Route path="members" element={<AdminSection><AdminMembersPage /></AdminSection>} />
          <Route path="audit-log" element={<AdminSection><AdminAuditPage /></AdminSection>} />
          <Route path="organization" element={<AdminSection><AdminOrgPage /></AdminSection>} />
          <Route path="profile" element={<AdminSection><AdminProfilePage /></AdminSection>} />
          {/* Route renames from the first revision — kept as redirects. */}
          <Route path="audit" element={<Navigate replace to="/admin/audit-log" />} />
          <Route path="org" element={<Navigate replace to="/admin/organization" />} />
          {/* Unknown console sub-routes: branded 404 inside the shell. */}
          <Route path="*" element={<AdminSection><AdminNotFound /></AdminSection>} />
        </Route>

        {/* First sign-in with an issued temporary password. */}
        <Route path="/change-temp-password" element={<ChangeTempPassword />} />

        {/* Clinical app (organization-scoped by RLS). */}
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<ClinicalSection><Dashboard /></ClinicalSection>} />
          <Route path="/patients" element={<ClinicalSection><PatientsPage /></ClinicalSection>} />
          <Route
            path="/patients/:id/edit"
            element={<ClinicalSection><EditPatientPage /></ClinicalSection>}
          />
          <Route path="/monitor" element={<ClinicalSection><MonitorPage /></ClinicalSection>} />
          <Route path="/reports" element={<ClinicalSection><ReportsPage /></ClinicalSection>} />
          <Route path="/profile" element={<ClinicalSection><ProfilePage /></ClinicalSection>} />
          <Route
            path="/profile/security"
            element={<ClinicalSection><ProfileSecurityPage /></ClinicalSection>}
          />
        </Route>

        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

/** Visible during the 60 s before the idle auto sign-out fires. */
function IdleWarning({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-full max-w-md items-center justify-between gap-4 rounded-lg border border-risk-moderate-fg/30 bg-risk-moderate-bg px-4 py-3 text-sm text-risk-moderate-fg shadow-lg"
    >
      <span>You&apos;ll be signed out shortly due to inactivity.</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-xs font-semibold underline-offset-4 hover:underline"
      >
        Stay signed in
      </button>
    </div>
  );
}

/** Signed-in users go to their console, everyone else to sign-in. */
function HomeRedirect() {
  const { session, profile, loading, profileLoading } = useAuth();

  if (loading || profileLoading) return <AuthSplash />;
  if (session == null) return <Navigate replace to="/signin" />;
  return <Navigate replace to={isAdminProfile(profile) ? "/admin" : "/dashboard"} />;
}

export default App;
