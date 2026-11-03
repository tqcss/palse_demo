import { useEffect } from "react";

/**
 * Admin console page titles, consistently "Page — Pal.se Admin"
 * ("Members — Pal.se Admin"), matching the clinical "Page — Pal.se" format.
 * Pass null to restore the default title.
 */
export function useAdminPageTitle(page: string | null, suffix = "Pal.se Admin") {
  useEffect(() => {
    const previous = "Pal.se";
    document.title = page == null ? previous : `${page} — ${suffix}`;
    return () => {
      document.title = previous;
    };
  }, [page, suffix]);
}
