import type { ReactNode } from "react";

import MsIcon from "./MsIcon.tsx";

/** Icon-based empty state (or illustrated: icon inside a large cream circle). */
export default function EmptyState({
  icon,
  title,
  body,
  action,
  illustrated = false,
  className,
}: {
  icon: string;
  title: string;
  body?: ReactNode;
  /** CTA row (buttons/links). */
  action?: ReactNode;
  illustrated?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-10 text-center ${className ?? ""}`}
    >
      <div
        className={`flex items-center justify-center rounded-full bg-theme-cream text-theme-maroon ${
          illustrated ? "h-20 w-20" : "h-12 w-12"
        }`}
      >
        <MsIcon name={icon} className={illustrated ? "text-[36px]" : "text-[22px]"} optical={24} />
      </div>
      <h3 className="text-base font-bold text-theme-ink">{title}</h3>
      {body != null ? (
        <p className="max-w-md text-sm text-theme-gray">{body}</p>
      ) : null}
      {action != null ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
