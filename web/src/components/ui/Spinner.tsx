/** Shared accessible spinner (methods: className sizes, tone via borders). */
export default function Spinner({
  className = "h-4 w-4",
  inverted = false,
}: {
  className?: string;
  /** True on maroon surfaces: white ring instead of ink. */
  inverted?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-block animate-spin rounded-full border-2",
        inverted ? "border-theme-white/40 border-t-theme-white" : "border-theme-maroon/30 border-t-theme-maroon",
        className,
      ].join(" ")}
    />
  );
}
