/** Compact pagination row: "Page X of Y" + Prev/Next (disabled at bounds). */
export default function Pagination({
  page,
  pageCount,
  onChange,
  className,
}: {
  /** 1-based page. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  const disabled = pageCount <= 1;

  return (
    <div
      className={`flex items-center justify-between gap-3 border-t border-theme-line pt-4 ${className ?? ""}`}
    >
      <p className="text-xs text-theme-gray">Page {page} of {pageCount}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-control border border-theme-line px-3 py-1.5 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={disabled || page >= pageCount}
          onClick={() => onChange(page + 1)}
          className="rounded-control border border-theme-line px-3 py-1.5 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
