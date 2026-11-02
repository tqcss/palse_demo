import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import MsIcon from "../MsIcon.tsx";

/**
 * Minimal toast system: success/error/info, aria-live region, auto-dismiss.
 * `useToast().push(...)` from anywhere under <ToastProvider>.
 */

export interface ToastData {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
}

interface ToastContextValue {
  push: (tone: ToastData["tone"], message: string, timeoutMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const NEXT_ID = { current: 0 };

const TONE_STYLES: Record<ToastData["tone"], { icon: string; classes: string }> = {
  success: {
    icon: "check_circle",
    classes: "border-risk-low-fg/30 bg-risk-low-bg text-risk-low-fg",
  },
  error: {
    icon: "error",
    classes: "border-risk-high-fg/30 bg-risk-high-bg text-risk-high-fg",
  },
  info: {
    icon: "info",
    classes: "border-theme-line bg-white text-theme-ink shadow-card",
  },
};

function ToastItem({ toast, onClose }: { toast: ToastData; onClose: () => void }) {
  useEffect(() => {
    // Timers are set per toast and cleaned up with it.
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const tone = TONE_STYLES[toast.tone];

  return (
    <div
      role="status"
      className={`flex w-full items-start gap-3 rounded-control border px-4 py-3 text-sm shadow-card ${tone.classes}`}
    >
      <MsIcon name={tone.icon} className="shrink-0 text-[20px]" optical={20} />
      <p className="min-w-0 flex-1 font-medium">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onClose}
        className="-m-1 shrink-0 rounded-md p-1 transition-colors hover:bg-theme-ink/5"
      >
        <MsIcon name="close" className="text-[16px]" optical={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const timers = useRef(new Map<number, number>());

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer != null) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastData["tone"], message: string, timeoutMs = 4200) => {
      NEXT_ID.current += 1;
      const id = NEXT_ID.current;
      setToasts((current) => [...current.slice(-4), { id, tone, message }]);
      const timer = window.setTimeout(() => remove(id), timeoutMs);
      timers.current.set(id, timer);
    },
    [remove],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) window.clearTimeout(timer);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto w-full max-w-sm">
            <ToastItem toast={toast} onClose={() => remove(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context == null) {
    // Renders everywhere the app is mounted, but failing soft keeps pages
    // working if a page is ever rendered outside the provider.
    return { push: (tone, message) => { console.log(`[toast ${tone}] ${message}`); } };
  }
  return context;
}
