import { Link } from "react-router-dom";

import MsIcon from "./MsIcon.tsx";

/**
 * Back affordance for the chrome-less auth flows: arrow + destination label,
 * placed above the page heading. Auth screens have no sidebar or top bar, so
 * a user who took a wrong turn (clinical ↔ administrator portal) otherwise
 * depends on the browser's back button.
 */
export default function AuthBackLink({
  to,
  label,
  className = "mb-5",
}: {
  to: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Link
        to={to}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-theme-gray transition-colors hover:text-theme-ink"
      >
        <MsIcon name="arrow_back" className="text-[18px]" optical={20} />
        {label}
      </Link>
    </div>
  );
}
