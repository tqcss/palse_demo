import { Link, useLocation } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import PageHeader from "../../components/ui/PageHeader.tsx";
import Panel from "../../components/Panel.tsx";
import EmptyState from "../../components/ui/EmptyState.tsx";
import { useAdminPageTitle } from "../../hooks/useAdminPageTitle.ts";

/**
 * Branded catch-all inside the console shell (the sidebar stays visible).
 * Shows the exact path that failed and the way back to the Overview.
 */
export default function AdminNotFound() {
  useAdminPageTitle("Page not found");
  const location = useLocation();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="404 · Page not found"
        title="This page doesn't exist"
        subtitle={`Nothing is served at ${location.pathname}. The link may be outdated or mistyped.`}
      />
      <Panel>
        <EmptyState
          illustrated
          icon="wrong_location"
          title="No console page at this address"
          body="Navigate back to the Overview, or use the sidebar. If you followed a link from a colleague, ask them to re-share the page."
          action={
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 rounded-control bg-theme-maroon px-4 py-2 text-sm font-semibold text-theme-white transition-colors hover:bg-theme-maroon-hover"
            >
              <MsIcon name="dashboard" className="text-[18px]" optical={20} />
              Back to Overview
            </Link>
          }
        />
      </Panel>
    </div>
  );
}
