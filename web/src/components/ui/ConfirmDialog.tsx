import { useEffect, useRef } from "react";

import MsIcon from "../MsIcon.tsx";
import Spinner from "./Spinner.tsx";
import { useFocusTrap, useRestoreFocus } from "../../hooks/useFocusTrap.ts";

/**
 * Destructive/sensitive-action confirm dialog, built on the shared Modal
 * behavior (focus trap, Esc/backdrop close, focus restore). Use for every
 * destructive action; copy must describe the consequence in plain language.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  onClose,
  onConfirm,
}: {
  title: string;
  /** Consequence copy — plain language, no hedging. */
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Only destructive (default) is danger-toned; "neutral" for sensitive but non-destructive. */
  tone?: "danger" | "neutral";
  /** Disables the confirm button and shows a spinner (in-flight). */
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useFocusTrap(dialogRef, true, { onEscape: onClose });
  useRestoreFocus(true);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-theme-ink/40 p-4 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-sm rounded-card border border-theme-line bg-white p-6 shadow-card"
      >
        <div className="flex items-start gap-3">
          {tone === "danger" ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-bg">
              <MsIcon name="delete" className="text-[20px] text-danger-fg" optical={20} />
            </span>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-theme-cream">
              <MsIcon name="help" className="text-[20px] text-theme-maroon" optical={20} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-base font-bold text-theme-ink">
              {title}
            </h2>
            <div className="mt-1.5 text-sm text-theme-ink-soft">{body}</div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 rounded-md p-1 transition-colors hover:bg-theme-light-gray"
          >
            <MsIcon name="close" className="text-[20px]" optical={20} />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-control border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
            className={[
              "flex items-center gap-2 rounded-control px-4 py-2 text-sm font-semibold transition-colors",
              tone === "danger"
                ? "bg-danger-fg text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-risk-high-fg"
                : "bg-theme-maroon text-theme-white hover:bg-theme-maroon-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
              "disabled:cursor-not-allowed disabled:opacity-60",
            ].join(" ")}
          >
            {pending ? <Spinner className="h-4 w-4" inverted /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
