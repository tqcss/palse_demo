/** Rounded pill badge: soft tinted background + dark foreground, icon-capable. */
export type BadgeTone = "neutral" | "maroon" | "success" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-theme-line bg-theme-light-gray text-theme-ink-soft",
  maroon: "border-theme-maroon/20 bg-theme-maroon-soft text-theme-maroon",
  success: "border-risk-low-fg/25 bg-risk-low-bg text-risk-low-fg",
  warning: "border-risk-moderate-fg/30 bg-risk-moderate-bg text-risk-moderate-fg",
  danger: "border-risk-high-fg/25 bg-risk-high-bg text-risk-high-fg",
  info: "border-info-fg/30 bg-info-bg text-info-fg",
};

export default function Badge({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** Material Symbol name (rendered through MsIcon, aria-hidden). */
  icon?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className ?? ""}`}
    >
      {icon != null ? (
        <span aria-hidden="true" className="ms text-[14px] leading-none">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
