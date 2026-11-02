import { useEffect, useRef, type ReactNode } from "react";

import MsIcon from "./MsIcon.tsx";
import { useFocusTrap, useRestoreFocus } from "../hooks/useFocusTrap.ts";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra copy rendered under the title (the dialog's question). */
  subtitle?: ReactNode;
  /** Draws the opening horizontal margin tighter for small confirms. */
  narrow?: boolean;
}

/**
 * Centered dialog with overlay: traps Tab focus, closes on Escape and
 * backdrop click, returns focus to the trigger on unmount.
 */
export default function Modal({ title, subtitle, onClose, children, narrow }: ModalProps) {
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
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-theme-ink/40 p-4 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`w-full ${narrow ? "max-w-sm" : "max-w-lg"} rounded-card border border-theme-line bg-white p-6 shadow-card md:p-7`}
      >
        <div className="mb-1.5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-theme-ink">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 transition-colors hover:bg-theme-light-gray"
          >
            <MsIcon name="close" className="text-[20px]" optical={20} />
          </button>
        </div>
        {subtitle != null ? (
          <p className="mb-5 text-sm text-theme-gray">{subtitle}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
