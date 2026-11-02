/** Initials avatar (maroon circle, white letters) — member rows, user chip. */
export function initialsOf(first: string | null | undefined, last: string | null | undefined): string {
  const a = first?.trim()?.[0] ?? "";
  const b = last?.trim()?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}

export default function Avatar({
  first,
  last,
  size = "md",
  className,
}: {
  first?: string | null;
  last?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  }[size];

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-theme-maroon font-bold text-theme-white ${sizeClasses} ${className ?? ""}`}
    >
      {initialsOf(first, last)}
    </span>
  );
}
