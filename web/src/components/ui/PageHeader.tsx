/** Page header: eyebrow + title + subtitle left, primary actions right. */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
  titleId = "page-heading",
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  /** Action buttons on the right; wraps under the text on narrow screens. */
  actions?: React.ReactNode;
  className?: string;
  /** Heading id — route changes move keyboard focus here. */
  titleId?: string;
}) {
  return (
    <header
      className={`flex flex-wrap items-end justify-between gap-4 ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-theme-maroon">
          {eyebrow}
        </p>
        <h1 id={titleId} tabIndex={-1} className="text-2xl font-bold text-theme-ink outline-none">
          {title}
        </h1>
        {subtitle != null ? (
          <p className="max-w-2xl text-sm text-theme-gray">{subtitle}</p>
        ) : null}
      </div>
      {actions != null ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
