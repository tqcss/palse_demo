import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import BrandMastHead from "../../components/BrandMastHead.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { type Organization, getMyOrganization } from "../../lib/admin.ts";

const TABS = [
  { to: "/admin", label: "Overview", icon: "space_dashboard", exact: true },
  { to: "/admin/members", label: "Members", icon: "manage_accounts", exact: false },
  { to: "/admin/audit", label: "Audit log", icon: "history", exact: false },
  { to: "/admin/org", label: "Organization", icon: "domain", exact: false },
];

/**
 * Administrator console chrome: maroon header with the organization context,
 * tab strip and the session actions (clinical app, profile, sign-out), page
 * content below. Rendered by RequireAdmin routes.
 */
export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const orgId = profile?.org_id ?? null;

  useEffect(() => {
    if (orgId == null) return;
    let current = orgId;
    void getMyOrganization(orgId)
      .then((org) => {
        if (current !== orgId) return;
        setOrganization(org);
      })
      .catch(() => {
        /* header displays a fallback name below */
      });
  }, [orgId]);

  const fullName =
    [profile?.first_name, profile?.last_name].filter((v) => v?.trim()).join(" ") ||
    profile?.email ||
    "Administrator";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate("/admin/signin", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-theme-light-gray">
      <header className="bg-theme-maroon px-4 py-4 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col">
              <BrandMastHead compact />
              <p className="mt-1 truncate text-xs text-theme-white/70">
                {organization?.name ?? "Your organization"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NavLink
                to="/dashboard"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-theme-white/80 transition-colors hover:bg-theme-white/10 hover:text-theme-white"
              >
                <MsIcon name="health_and_safety" className="text-[17px]" optical={20} />
                Clinical app
              </NavLink>
              <NavLink
                to="/profile"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-theme-white/80 transition-colors hover:bg-theme-white/10 hover:text-theme-white"
              >
                <MsIcon name="person" className="text-[17px]" optical={20} />
                Profile
              </NavLink>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-theme-white/80 transition-colors hover:bg-theme-white/10 hover:text-theme-white disabled:opacity-60"
              >
                <MsIcon name="logout" className="text-[17px]" optical={20} />
                {signingOut ? "Signing out…" : "Log out"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1">
              {TABS.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.exact}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150",
                      "focus-visible:outline-2 focus-visible:outline-theme-white/60",
                      isActive
                        ? "bg-theme-white/15 text-theme-white"
                        : "text-theme-white/60 hover:bg-theme-white/5 hover:text-theme-white/90",
                    ].join(" ")
                  }
                >
                  <MsIcon name={tab.icon} className="text-[19px]" optical={20} />
                  {tab.label}
                </NavLink>
              ))}
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-theme-white">{fullName}</div>
              <div className="text-xs text-theme-white/70">Administrator · {profile?.email}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
