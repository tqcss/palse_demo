import { Link, Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useState } from "react";

import BrandMastHead from "./BrandMastHead.tsx";
import PrimaryButton from "./PrimaryButton.tsx";
import MsIcon from "./MsIcon.tsx";
import { useAuth } from "../context/useAuth";

/** Full-page spinner shown until the initial auth state resolves. */
export function AuthSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-theme-maroon">
      <BrandMastHead />
      <span
        aria-label="Loading"
        className="h-5 w-5 animate-spin rounded-full border-2 border-theme-white/40 border-t-theme-white"
      />
    </div>
  );
}

/**
 * Maroon full-page guard placeholder with an icon, message and optional
 * actions — used for "awaiting approval" accounts and profile load failures.
 */
export function BlockedScreen({
  icon,
  title,
  message,
  children,
}: {
  icon: string;
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const { signOut } = useAuth();

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      window.location.href = "/signin";
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-theme-maroon px-6 text-center">
      <BrandMastHead />
      <div className="mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-theme-white/10">
        <MsIcon name={icon} className="text-[28px] text-theme-white" optical={28} />
      </div>
      <div className="max-w-md">
        <h1 className="text-xl font-bold text-theme-white">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-theme-white/70">{message}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="rounded-lg border border-theme-white/30 px-4 py-2 text-sm font-semibold text-theme-white transition-colors hover:bg-theme-white/10 focus-visible:outline-2 focus-visible:outline-theme-white/60 disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

/**
 * Restricts children to a working authenticated session, forces the
 * temporary-password replacement before anything else, and bounces guests to
 * /signin.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, profileLoading, profile } = useAuth();
  const location = useLocation();

  if (loading || profileLoading) return <AuthSplash />;
  if (session == null) {
    return <Navigate replace state={{ from: location }} to="/signin" />;
  }
  // The account gate applies everywhere, not just /admin.
  if (profile != null) {
    if (profile.status === "pending") return <AwaitingApproval />;
    if (profile.status === "disabled") {
      return (
        <BlockedScreen
          icon="block"
          title="Account disabled"
          message="Your account has been disabled by your organization's administrator. Contact them if you believe this is a mistake."
        />
      );
    }
  }
  if (profile?.must_set_password === true) {
    return <Navigate replace to="/change-temp-password" />;
  }
  return children;
}

/**
 * Restricts children to approved administrators of an organization:
 * clinicians are routed to the clinical app, pending admins see the approval
 * screen, admins without an organization are routed to onboarding.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading, profileLoading, profile } = useAuth();
  const location = useLocation();

  if (loading || profileLoading) return <AuthSplash />;
  if (session == null) {
    return <Navigate replace state={{ from: location }} to="/admin/signin" />;
  }
  if (profile == null) {
    return (
      <BlockedScreen
        icon="error"
        title="Account data unavailable"
        message="We couldn't load your account profile. This can happen on a stale session — try again or contact a superadmin."
      />
    );
  }
  if (profile.role !== "admin") {
    return <NoAccess />;
  }
  if (profile.status === "pending") {
    return <AwaitingApproval />;
  }
  if (profile.status === "disabled") {
    return (
      <BlockedScreen
        icon="block"
        title="Account disabled"
        message="Your administrator access has been revoked. Contact a superadmin if you believe this is a mistake."
      />
    );
  }
  if (profile.org_id == null) {
    return <Navigate replace to="/admin/onboarding" />;
  }
  return children;
}

/** Onboarding route: only administrators who don't have an organization yet. */
export function RequireAdminNoOrg({ children }: { children: ReactNode }) {
  const { session, loading, profileLoading, profile } = useAuth();

  if (loading || profileLoading) return <AuthSplash />;
  if (session == null) return <Navigate replace to="/admin/signin" />;
  if (profile == null) {
    return (
      <BlockedScreen
        icon="error"
        title="Account data unavailable"
        message="We couldn't load your account profile. Try again or contact a superadmin."
      />
    );
  }
  if (profile.role !== "admin") return <Navigate replace to="/dashboard" />;
  if (profile.status === "pending") return <AwaitingApproval />;
  if (profile.status === "disabled") {
    return (
      <BlockedScreen
        icon="block"
        title="Account disabled"
        message="Your administrator access has been revoked. Contact a superadmin if you believe this is a mistake."
      />
    );
  }
  if (profile.org_id != null) return <Navigate replace to="/admin" />;
  return children;
}

/** Admin status: pending after signup until a superadmin confirms the account. */
export function AwaitingApproval() {
  const { refetchProfile, profile } = useAuth();
  const [rechecking, setRechecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function handleRecheck() {
    if (rechecking) return;
    setRechecking(true);
    setCheckError(null);
    try {
      const fresh = profile == null ? null : await refetchProfile();
      if (fresh != null && fresh.status === "active") {
        window.location.reload(); // re-render the app through the new status
      } else if (fresh != null) {
        setCheckError(null);
      } else {
        setCheckError("Could not re-check the status. Try again.");
      }
    } catch {
      setCheckError("Could not re-check the status. Try again.");
    } finally {
      setRechecking(false);
    }
  }

  return (
    <BlockedScreen
      icon="mark_email_read"
      title="Confirmed — now awaiting approval"
      message="Your email is verified and the superadmins have been asked to confirm this administrator account. This usually takes little time; once confirmed, you'll set up or join your hospital's organization. You can re-check below."
    >
      <PrimaryButton pending={rechecking} onClick={() => void handleRecheck()} type="button">
        Re-check approval status
      </PrimaryButton>
      {/* No extra sign-out button here: BlockedScreen already renders one. */}
      {checkError ? (
        <p className="w-full text-xs text-risk-moderate-fg">{checkError}</p>
      ) : null}
    </BlockedScreen>
  );
}

/**
 * Friendly "no access" screen for a signed-in non-admin who opens /admin/*.
 * Offers the way back to the clinical app instead of a silent redirect.
 */
export function NoAccess() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-theme-maroon px-6 py-16 text-center">
      <BrandMastHead />
      <div className="mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-theme-white/10">
        <MsIcon name="lock" className="text-[28px] text-theme-white" optical={28} />
      </div>
      <div className="max-w-md">
        <h1 className="text-xl font-bold text-theme-white">You don&apos;t have access</h1>
        <p className="mt-2 text-sm leading-relaxed text-theme-white/70">
          The administration console is only available to approved
          administrators of an organization. Your account is a clinician
          account — continue in the clinical app.
        </p>
      </div>
      <Link
        to="/dashboard"
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-theme-white px-4 py-2.5 text-sm font-semibold text-theme-maroon transition-colors hover:bg-theme-white/90 focus-visible:outline-2 focus-visible:outline-theme-white"
      >
        <MsIcon name="medical_services" className="text-[18px]" optical={20} />
        Open the clinical app
      </Link>
    </div>
  );
}

/** Restricts children to guests; sends already-signed-in users to their home. */
export function GuestOnly({ children, home = "/dashboard" }: { children: ReactNode; home?: string }) {
  const { session, loading, profile, profileLoading } = useAuth();

  if (loading || profileLoading) return <AuthSplash />;
  if (session != null) {
    // Pending admins surface the approval screen wherever they land.
    if (profile?.role === "admin" && profile.status === "pending") {
      return <AwaitingApproval />;
    }
    const target = profile?.role === "admin" && profile.status === "active" ? "/admin" : home;
    return <Navigate replace to={target} />;
  }
  return children;
}
