import { NavLink, Outlet } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import BrandMastHead from "../../components/BrandMastHead.tsx";
import { useAuth } from "../../context/useAuth.ts";

const TABS = [
  { to: "/admin/members", label: "Members", icon: "manage_accounts" },
  { to: "/admin/audit", label: "Audit log", icon: "history" },
  { to: "/admin/org", label: "Organization", icon: "domain" },
];

/**
 * Administrator console chrome: maroon header with the organization context
 * and tab strip, page content below. Rendered by RequireAdmin routes.
 */
export default function AdminLayout() {
  const { profile } = useAuth();

  const fullName =
    [profile?.first_name, profile?.last_name].filter((v) => v?.trim()).join(" ") ||
    profile?.email ||
    "Administrator";

  return (
    <div className="flex min-h-screen flex-col bg-theme-light-gray">
      <header className="bg-theme-maroon px-4 py-4 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <BrandMastHead compact />
            <div className="text-right">
              <div className="text-sm font-semibold text-theme-white">{fullName}</div>
              <div className="text-xs text-theme-white/70">Administrator · {profile?.email}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
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
