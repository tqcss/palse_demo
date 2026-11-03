import type { ReactNode } from "react";

type NoticeTone = "info" | "success" | "warning" | "danger";

const TONES = {
  info: "border-info-fg/25 bg-info-bg text-info-fg",
  success: "border-success-fg/25 bg-success-bg text-success-fg",
  warning: "border-warning-fg/25 bg-warning-bg text-warning-fg",
  danger: "border-danger-fg/25 bg-danger-bg text-danger-fg",
} as const;

export default function Notice({
  tone,
  className,
  children,
}: {
  tone: NoticeTone;
  className?: string;
  children: NonNullable<ReactNode>;
}) {
  return (
    <div
      role="status"
      className={`rounded-control border px-4 py-3 text-sm ${TONES[tone]} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
