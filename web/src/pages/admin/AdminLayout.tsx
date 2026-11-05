import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import BrandMastHead from "../../components/BrandMastHead.tsx";
import AccountMenu from "../../components/ui/AccountMenu.tsx";
import Spinner from "../../components/ui/Spinner.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { useFocusTrap } from "../../hooks/useFocusTrap.ts";
import { type Organization, getMyOrganization } from "../../lib/admin.ts";

/** Thin maroon bar under the top bar, animated while a route transition runs. */
function NavProgress() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-[57px] z-10 h-0.5 overflow-hidden bg-theme-cream"
    >
      <div className="admin-nav-progress h-full w-full origin-left bg-theme-maroon" />
    </div>
  );
}

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: "dashboard", end: true },
  { to: "/admin/members", label: "Members", icon: "group", end: false },
  { to: "/admin/audit-log", label: "Audit log", icon: "history", end: false },
  {
    to: "/admin/organization",
    label: "Organization",
    icon: "apartment",
    end: false,
  },
] as const;

/** Top bar label per path (also covers unknown sub-routes). */
function titleForPath(pathname: string): string {
  if (pathname.startsWith("/admin/members")) return "Members";
  if (pathname.startsWith("/admin/audit")) return "Audit log";
  if (pathname.startsWith("/admin/organization")) return "Organization";
  if (pathname.startsWith("/admin/profile")) return "Profile";
  if (pathname.startsWith("/admin/")) return "Page not found";
  return "Overview";
}

/**
 * Administrator console chrome: fixed maroon sidebar (≥ md / 768px, same
 * first-class bedside-tablet breakpoint as the clinical shell), slim top bar
 * with the current page and the user menu, off-canvas drawer below it.
 * Navigation scrolls to top and moves focus to <main>; page routes add their
 * own Suspense/error boundary in App.
 */
export default function AdminLayout() {
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const label = useMemo(
    () => titleForPath(location.pathname),
    [location.pathname],
  );

  /* ------------------------------ route effect ----------------------------- */
  const [progressing, setProgressing] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    // Keyboard focus lands on the <main> landmark (outlined only for focus,
    // which the browser already treats correctly with :focus-visible).
    mainRef.current?.focus({ preventScroll: true });
    // Thin maroon progress bar for the first frames of every transition
    // (covers lazy-page chunks too — the skeleton takes over if it's longer).
    setProgressing(true);
    const timer = window.setTimeout(() => setProgressing(false), 450);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.key]);

  /* -------------------------------- org name ------------------------------- */
  const orgId = profile?.org_id ?? null;
  const [organization, setOrganization] = useState<Organization | null>(null);
  useEffect(() => {
    if (orgId == null) return;
    let current = orgId;
    void getMyOrganization(orgId)
      .then((org) => {
        if (current !== orgId) return;
        setOrganization(org);
      })
      .catch(() => {
        /* header badge shows a fallback name */
      });
  }, [orgId]);

  const fullName = useMemo(
    () =>
      [profile?.first_name, profile?.last_name]
        .filter((v) => v?.trim())
        .join(" ") ||
      profile?.email ||
      "Administrator",
    [profile?.first_name, profile?.last_name, profile?.email],
  );

  /* --------------------------------- logout -------------------------------- */
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate("/admin/signin?signedOut=1", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }, [navigate, signOut, signingOut]);

  /* ------------------------------ mobile drawer ---------------------------- */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  useFocusTrap(drawerRef, drawerOpen, {
    onEscape: (event) => {
      event.preventDefault();
      setDrawerOpen(false);
      hamburgerRef.current?.focus();
    },
  });
  // Auto-close on every navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.key]);

  if (session == null) {
    // RequireAdmin renders the redirect to the sign-in on the next pass; keep
    // the tree empty meanwhile so no console content flickers on expiry.
    return null;
  }

  return (
    <div className="flex min-h-screen bg-theme-light-gray">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-theme-maroon focus:shadow-card"
      >
        Skip to content
      </a>

      {/* Fixed sidebar (desktop) — the spacer div reserves the layout width. */}
      <div className="hidden w-64 shrink-0 md:block" aria-hidden="true" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto bg-theme-maroon px-4 py-6 md:flex bg-[url('/images/signup-bg-red.png')]">
        <SidebarContent
          organization={organization}
          onSignOut={() => void handleSignOut()}
          signingOut={signingOut}
          withClose={false}
        />
      </aside>

      {/* Off-canvas drawer (mobile < md) with backdrop. */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-theme-ink/50 backdrop-blur-[2px] md:hidden"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Console menu"
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[86vw] flex-col overflow-y-auto bg-theme-maroon px-4 py-6 shadow-card transition-transform duration-200 md:hidden ${drawerOpen
          ? "visible flex translate-x-0"
          : "invisible -translate-x-full"
          }`}
      >
        <SidebarContent
          organization={organization}
          onSignOut={() => void handleSignOut()}
          signingOut={signingOut}
          withClose={true}
          onClose={() => {
            setDrawerOpen(false);
            hamburgerRef.current?.focus();
          }}
        />
      </div>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AdminTopBar
          label={label}
          fullName={fullName}
          email={profile?.email ?? ""}
          firstName={profile?.first_name ?? null}
          lastName={profile?.last_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          onOpenMenu={() => setDrawerOpen(true)}
          onSignOut={() => void handleSignOut()}
          hamburgerRef={hamburgerRef}
        />

        {progressing ? <NavProgress /> : null}

        <main
          ref={mainRef}
          id="admin-content"
          tabIndex={-1}
          className="min-w-0 flex-1 outline-none"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/* --------------------------------- sidebar --------------------------------- */

function SidebarContent({
  organization,
  onSignOut,
  signingOut,
  withClose,
  onClose,
}: {
  organization: Organization | null;
  onSignOut: () => void;
  signingOut: boolean;
  withClose: boolean;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between px-3 pb-5 pt-2">
        <div className="min-w-0">
          <BrandMastHead compact />
          {/* Organization badge under the logo */}
          <span className="mt-4 inline-flex max-w-full items-center gap-1.5 rounded-full border border-theme-white/25 bg-theme-white/10 px-3 py-1 text-xs font-semibold text-theme-white">
            <MsIcon
              name="apartment"
              className="shrink-0 text-[14px]"
              optical={14}
            />
            <span className="truncate">
              {organization?.name ?? "Your organization"}
            </span>
          </span>
        </div>
        {withClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close console menu"
            className="-mr-1 rounded-md p-1.5 text-theme-white/70 transition-colors hover:bg-theme-white/10 hover:text-theme-white"
          >
            <MsIcon name="close" className="text-[20px]" optical={20} />
          </button>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1.5" aria-label="Admin console">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-control px-3.5 py-2.5 text-sm font-medium",
                "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-theme-white",
                isActive
                  ? "bg-theme-white/15 text-theme-white"
                  : "text-theme-white/70 hover:bg-theme-white/10 hover:text-theme-white",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <MsIcon
                  name={item.icon}
                  fill={isActive ? 1 : 0}
                  className="shrink-0 text-[20px]"
                  optical={20}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-theme-white/15 pt-4">
        <NavLink
          to="/dashboard"
          className="flex items-center gap-3 rounded-control px-3.5 py-2.5 text-sm font-medium text-theme-white/70 transition-colors duration-150 hover:bg-theme-white/10 hover:text-theme-white focus-visible:outline-2 focus-visible:outline-theme-white"
        >
          <MsIcon
            name="medical_services"
            className="shrink-0 text-[20px]"
            optical={20}
          />
          Clinical app
        </NavLink>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex items-center gap-3 rounded-control px-3.5 py-2.5 text-sm font-medium text-theme-white/70 transition-colors duration-150 hover:bg-theme-white/10 hover:text-theme-white focus-visible:outline-2 focus-visible:outline-theme-white disabled:opacity-60"
        >
          <MsIcon name="logout" className="shrink-0 text-[20px]" optical={20} />
          {signingOut ? (
            <>
              <Spinner inverted className="h-4 w-4" />
              Logging out…
            </>
          ) : (
            "Log out"
          )}
        </button>
      </div>
    </>
  );
}

/* --------------------------------- top bar --------------------------------- */

function AdminTopBar({
  label,
  fullName,
  email,
  firstName,
  lastName,
  avatarUrl,
  onOpenMenu,
  onSignOut,
  hamburgerRef,
}: {
  label: string;
  fullName: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  onOpenMenu: () => void;
  onSignOut: () => void;
  hamburgerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-theme-line bg-theme-white px-4 py-3 md:px-8 bg-[url('/images/signup-bg-white.png')] bg-top-right">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            ref={hamburgerRef}
            type="button"
            onClick={onOpenMenu}
            aria-label="Open console menu"
            aria-expanded="false"
            className="rounded-control border border-theme-line bg-white p-2 text-theme-ink transition-colors hover:bg-theme-light-gray md:hidden"
          >
            <MsIcon name="menu" className="text-[20px]" optical={20} />
          </button>
          <h2 className="truncate text-sm font-bold text-theme-ink md:text-base">
            {label}
          </h2>
        </div>
        <AccountMenu
          fullName={fullName}
          email={email}
          badgeLabel="Administrator"
          firstName={firstName}
          lastName={lastName}
          avatarUrl={avatarUrl}
          items={[
            { id: "profile", label: "Profile", icon: "person", to: "/admin/profile" },
            {
              id: "clinical",
              label: "Clinical app",
              icon: "medical_services",
              to: "/dashboard",
            },
            { id: "logout", label: "Log out", icon: "logout", action: "signOut" },
          ]}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  );
}
