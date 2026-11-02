import { useEffect, useRef, useState } from "react";

import MsIcon from "../MsIcon.tsx";
import { useFocusTrap, useRestoreFocus } from "../../hooks/useFocusTrap.ts";

export interface KebabAction {
  id: string;
  label: string;
  icon?: string;
  /** Destructive items render in the high-risk tints. */
  destructive?: boolean;
  disabled?: boolean;
  /** Native title tooltip explaining why the item is disabled. */
  disabledReason?: string;
  onSelect: () => void;
}

/**
 * "…" action menu (role="menu"): ArrowUp/ArrowDown cycling, Escape closes and
 * returns focus to the trigger, click-outside closes.
 */
export default function KebabMenu({
  label = "Actions",
  items,
  busy = false,
}: {
  label?: string;
  items: KebabAction[];
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useFocusTrap(rootRef, open, {
    onEscape: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
  });
  useRestoreFocus(open);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (rootRef.current != null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [open]);

  function moveFocus(from: number, delta: number) {
    const count = items.length;
    let next = from;
    for (let step = 0; step < count; step += 1) {
      next = (next + delta + count) % count;
      const item = items[next];
      if (item != null && !item.disabled) break;
    }
    itemRefs.current[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
          }
        }}
        className="rounded-control border border-theme-line bg-white px-1.5 py-1 text-theme-ink-soft transition-colors hover:bg-theme-light-gray disabled:opacity-50"
      >
        <MsIcon name="more_vert" className="text-[18px]" optical={18} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-30 mt-1.5 flex w-56 flex-col rounded-card border border-theme-line bg-white p-1.5 shadow-card"
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled || busy}
              title={item.disabled === true ? (item.disabledReason ?? "Not available") : undefined}
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                item.onSelect();
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveFocus(index, 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveFocus(index, -1);
                }
              }}
              className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                item.destructive
                  ? "text-risk-high-fg hover:bg-risk-high-bg disabled:hover:bg-transparent"
                  : "text-theme-ink-soft hover:bg-theme-light-gray"
              }`}
            >
              {item.icon != null ? (
                <MsIcon name={item.icon} className="text-[17px]" optical={18} />
              ) : (
                <span className="w-[17px]" />
              )}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
