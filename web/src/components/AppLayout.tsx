import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

import AppSidebar from "./AppSidebar.tsx";
import Topbar, { AppMobileNav } from "./AppTopbar.tsx";

/**
 * Authenticated app chrome: maroon sidebar (desktop), mobile nav strip and
 * top bar, with page content in the center. Rendered by RequireAuth routes.
 *
 * Matches the admin console's navigation behavior: scroll-to-top and focus
 * moves to the content landmark on every route change so keyboard users park
 * on the next page instead of mid-document.
 */
export default function AppLayout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname, location.key]);

  return (
    <div className="flex min-h-screen bg-theme-light-gray">
      {/* Skip link escapes the maroon sidebar, same pattern as the console. */}
      <a
        href="#app-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-theme-maroon focus:shadow-card"
      >
        Skip to content
      </a>

      <AppSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <AppMobileNav />
        <main
          ref={mainRef}
          id="app-content"
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
