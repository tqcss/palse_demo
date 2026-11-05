import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import MsIcon from "../MsIcon.tsx";
import Avatar from "./Avatar.tsx";

interface AccountMenuItem {
  id: string;
  label: string;
  icon: string;
  /** Route to navigate to; undefined = action button (sign out). */
  to?: string;
  action?: "signOut";
}

/**
 * Top-right account chip + dropdown, shared by the clinician topbar and the
 * admin console top bar: avatar/photo trigger, name + role line, identity
 * header inside the menu, then role-scoped items ending with sign-out.
 * Focus moves into the open menu with ↑/↓ (items are roving-focusable) and
 * click-outside/Esc-ready Chip-and-popover behavior matches elsewhere.
 */
export default function AccountMenu({
  fullName,
  email,
  badgeLabel,
  firstName,
  lastName,
  avatarUrl,
  items,
  onSignOut,
}: {
  fullName: string;
  email: string | null;
  /** Role line under the name in the trigger (e.g. "Administrator"). */
  badgeLabel: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  items: ReadonlyArray<AccountMenuItem>;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const navigate = useNavigate();

  // Click-outside closes.
  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (
        rootRef.current != null &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [open]);

  function closeAndRefocus() {
    setOpen(false);
    // Return focus to the trigger button (first <button> inside the root).
    rootRef.current?.querySelector("button")?.focus();
  }

  function activate(item: AccountMenuItem) {
    setOpen(false);
    if (item.to != null) {
      void navigate(item.to);
      return;
    }
    if (item.action === "signOut") onSignOut();
  }

  function moveFocus(from: number, delta: number) {
    const next = (from + delta + items.length) % items.length;
    itemRefs.current[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (!open ? setOpen(true) : closeAndRefocus())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              window.setTimeout(() => itemRefs.current[0]?.focus(), 0);
            }
          }
        }}
        className="flex items-center gap-2.5 rounded-control px-1.5 py-1 transition-colors hover:bg-theme-light-gray"
      >
        <Avatar first={firstName} last={lastName} src={avatarUrl} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold text-theme-ink">
            {fullName}
          </span>
          <span className="block text-[11px] text-theme-gray">{badgeLabel}</span>
        </span>
        <MsIcon
          name={open ? "arrow_drop_up" : "arrow_drop_down"}
          className="text-theme-gray"
          optical={18}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 z-40 mt-2 flex w-60 flex-col rounded-card border border-theme-line bg-white p-1.5 shadow-card"
        >
          <div className="flex items-center gap-2.5 px-3 py-2">
            <Avatar first={firstName} last={lastName} size="sm" src={avatarUrl} />
            <span className="flex min-w-0 flex-col">
              <span className="block truncate text-sm font-semibold text-theme-ink">
                {fullName}
              </span>
              <span className="block truncate text-xs text-theme-gray">
                {email ?? "—"}
              </span>
            </span>
          </div>
          <div className="my-1 border-t border-theme-line" />
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                closeAndRefocus();
                activate(item);
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
              className="flex items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm font-medium text-theme-ink-soft transition-colors hover:bg-theme-light-gray"
            >
              <MsIcon name={item.icon} className="text-[17px]" optical={18} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
