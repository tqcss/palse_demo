import { useEffect } from "react";

/**
 * Admin console page titles, consistently formatted "Page · PAL.SE Admin"
 * ("Members · PAL.SE Admin"). Pass null to restore the default title.
 */
export function useAdminPageTitle(page: string | null, suffix = "PAL.SE Admin") {
  useEffect(() => {
    const previous = "Pal.se";
    document.title = page == null ? previous : `${page} · ${suffix}`;
    return () => {
      document.title = previous;
    };
  }, [page, suffix]);
}
