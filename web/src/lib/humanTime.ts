/**
 * Human-readable timestamps for the admin console. Relative time for "when"
 * ("3 days ago"), absolute unambiguous locale formats for tables and tooltips
 * ("2 Nov 2026, 11:59 PM") — 2026-11-02T23:59 local time intended, so the
 * never-ambiguous "2 Nov 2026" day-first style is used for dates.
 */

export function fullTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function fullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** "just now" / "4 min ago" / "3 days ago" / "6 weeks ago" / full date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((Date.now() - then) / 1000);
  const suffix = seconds >= 0 ? "ago" : "from now";
  const abs = Math.abs(seconds);

  if (abs < 60) return "just now";
  const minutes = Math.floor(abs / 60);
  if (minutes < 60) return `${minutes} min ${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ${suffix}`;
  const days = Math.floor(hours / 24);
  if (days < 45) return `${days} day${days === 1 ? "" : "s"} ${suffix}`;
  const months = Math.floor(days / 30);
  if (months < 14) return `${months} month${months === 1 ? "" : "s"} ${suffix}`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ${suffix}`;
}
