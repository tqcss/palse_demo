import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Page-level error boundary: catches render/loading errors and shows a
 * friendly panel with a Retry button (remount + refetch).
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode; onRetry?: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[palse] page error boundary", error, info.componentStack);
  }

  render() {
    if (this.state.error == null) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-theme-line bg-white p-10 py-14 text-center shadow-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-risk-high-bg">
          <span aria-hidden="true" className="ms text-[28px] text-risk-high-fg">
            cloud_off
          </span>
        </div>
        <h2 className="text-lg font-bold text-theme-ink">
          This page hit an unexpected error
        </h2>
        <p className="max-w-md text-sm text-theme-gray">
          The console kept your data safe — try again. If it keeps happening,
          note the time and contact a superadmin.
        </p>
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null });
            this.props.onRetry?.();
          }}
          className="mt-2 rounded-control bg-theme-maroon px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-theme-maroon-hover"
        >
          Retry
        </button>
      </div>
    );
  }
}
