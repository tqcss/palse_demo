import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Traps Tab focus inside `containerRef` while `active`. Does not move focus
 * on activation — the caller focuses its own initial element, so dialogs (and
 * drawers) can open on their first input or heading.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  options: { onEscape?: (event: KeyboardEvent) => void } = {},
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (container == null) return;

    function handledKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        options.onEscape?.(event);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        container!.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const activeElement = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (activeElement == null || !container!.contains(activeElement))) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", handledKeydown);
    return () => container.removeEventListener("keydown", handledKeydown);
  }, [active, containerRef, options]);
}

/** Remembers the focused element and restores it on cleanup (dialogs). */
export function useRestoreFocus(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [active]);
}
