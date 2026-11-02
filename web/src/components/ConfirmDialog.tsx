import type { ReactNode } from "react";

import Modal from "./Modal.tsx";
import Spinner from "./ui/Spinner.tsx";

/**
 * Confirmation dialog: question in plain language + destructive-capable
 * confirm button. While `pending`, dismissing is blocked — the action is
 * already running and the result must not be double-triggered.
 */
export default function ConfirmDialog({
  title,
  question,
  confirmLabel = "Confirm",
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  question: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} subtitle={question} onClose={pending ? () => {} : onCancel} narrow>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-control border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-60"
        >
          Cancel
        </button>
        {pending ? (
          <button
            type="button"
            disabled
            aria-busy="true"
            className={`flex items-center gap-2 rounded-control bg-risk-high-fg px-4 py-2 text-sm font-semibold text-white opacity-80 ${destructive ? "" : "bg-theme-maroon"}`}
          >
            <Spinner inverted className="h-4 w-4" />
            Working…
          </button>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            className={`flex items-center gap-2 rounded-control px-4 py-2 text-sm font-semibold text-white transition-colors ${
              destructive
                ? "bg-risk-high-fg hover:bg-risk-high-fg/85"
                : "bg-theme-maroon hover:bg-theme-maroon-hover"
            }`}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}
