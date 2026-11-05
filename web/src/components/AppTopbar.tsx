import { Link, useLocation } from "react-router-dom";
import { useRef } from "react";
import type { ComponentType } from "react";

import { useAuth } from "../context/useAuth.ts";
import AccountMenu from "./ui/AccountMenu.tsx";

/** Strip for small screens (< md): horizontal nav icons. */
export function AppMobileNav() {
  // Page names match the sidebar (Dashboard, Patients, Monitoring, Reports) —
  // one vocabulary per destination across the whole shell.
  const links = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/patients", label: "Patients" },
    { to: "/monitor", label: "Monitoring" },
    { to: "/reports", label: "Reports" },
  ];

  const location = useLocation();

  return (
    <nav
      aria-label="Primary"
      className="flex items-stretch gap-1 border-b border-theme-line bg-theme-white px-4 py-2 md:hidden"
    >
      {links.map((link) => {
        const active = location.pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition-colors",
              active
                ? "bg-theme-maroon text-theme-white"
                : "text-theme-gray hover:bg-theme-light-gray hover:text-theme-ink",
            ].join(" ")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

const TOPBAR_LABELS: Array<{
  match: (path: string) => boolean;
  label: string;
}> = [
    { match: (p) => p.startsWith("/dashboard"), label: "Dashboard" },
    { match: (p) => p.startsWith("/patients"), label: "Patients" },
    { match: (p) => p.startsWith("/monitor"), label: "Monitoring" },
    { match: (p) => p.startsWith("/reports"), label: "Reports" },
  ];

function titleForPath(path: string): string {
  return (
    TOPBAR_LABELS.find((entry) => entry.match(path))?.label ??
    "Clinical Console"
  );
}

/** Top app bar: page context + identity, linking to the profile page. */
const Topbar: ComponentType = function Topbar() {
  const { profile, user, session, signOut } = useAuth();
  const location = useLocation();

  const firstName =
    profile?.first_name ??
    (user?.user_metadata?.first_name as string | undefined) ??
    "";
  const lastName =
    profile?.last_name ??
    (user?.user_metadata?.last_name as string | undefined) ??
    "";
  const display =
    `${firstName} ${lastName}`.trim() || session?.user.email || "Clinician";

  // Same account-menu items vocabulary as the admin console: profile, then
  // role-scoped navigation, then sign-out.
  const menuItems = [
    { id: "profile", label: "Profile", icon: "person", to: "/profile" },
    { id: "logout", label: "Log out", icon: "logout", action: "signOut" as const },
  ];

  const signingOutRef = useRef(false);

  function handleSignOut() {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    void signOut()
      .catch(() => undefined)
      .finally(() => {
        window.location.href = "/signin";
        signingOutRef.current = false;
      });
  }

  return (
    <header className="sticky top-0 z-31 border-b border-theme-line bg-theme-white bg-[url('/images/signup-bg-white.png')] bg-top-right px-4 py-3 md:px-8">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <Link
            to="/dashboard"
            className="text-sm font-semibold text-theme-ink"
          >
            {titleForPath(location.pathname)}
          </Link>
        </div>

        <AccountMenu
          fullName={display}
          email={profile?.email ?? user?.email ?? null}
          badgeLabel={
            profile?.role === "admin" ? "Administrator" : "Clinical team"
          }
          firstName={firstName || null}
          lastName={lastName || null}
          avatarUrl={profile?.avatar_url ?? null}
          items={menuItems}
          onSignOut={handleSignOut}
        />
      </div>
    </header>
  );
};

export default Topbar;
