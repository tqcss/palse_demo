/** Initials avatar (maroon circle, white letters) — member rows, user chip. */
export function initialsOf(first: string | null | undefined, last: string | null | undefined): string {
  const a = first?.trim()?.[0] ?? "";
  const b = last?.trim()?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}

/** Avatar with optional image (falls back to the maroon initials disc). */
export default function Avatar({
  first,
  last,
  src,
  size = "md",
  className,
}: {
  first?: string | null;
  last?: string | null;
  /** Public URL of an uploaded profile photo; initials are the fallback. */
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  }[size];

  const hasImage = src != null && src.trim() !== "";

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-theme-maroon font-bold text-theme-white ${sizeClasses} ${className ?? ""}`}
    >
      {hasImage ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        initialsOf(first, last)
      )}
    </span>
  );
}
