import MsIcon from "../MsIcon.tsx";

/**
 * Per-card error state with a Retry button: one card failing must not break
 * the other cards or the intake workflow below the section.
 */
export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-control border border-dashed border-risk-high-fg/30 bg-risk-high-bg/50 px-4 py-6 text-center"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-risk-high-bg">
        <MsIcon name="error" className="text-[20px] text-risk-high-fg" optical={20} />
      </span>
      <p className="text-sm font-medium text-risk-high-fg">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-theme-line bg-white px-3 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
      >
        <MsIcon name="refresh" className="text-[16px]" optical={18} />
        Retry
      </button>
    </div>
  );
}

export default ErrorBlock;
