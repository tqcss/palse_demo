import { relativeTime, fullTimestamp } from "../../lib/humanTime.ts";

/**
 * Relative time ("3 days ago") with the unambiguous absolute timestamp as a
 * native tooltip (title) — tables stay compact, details on hover.
 */
export default function RelativeTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  return (
    <time
      dateTime={iso}
      title={fullTimestamp(iso)}
      className={`whitespace-nowrap ${className ?? ""}`}
    >
      {relativeTime(iso)}
    </time>
  );
}
