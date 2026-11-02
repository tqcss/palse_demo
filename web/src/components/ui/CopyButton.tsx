import { useEffect, useRef, useState } from "react";

import MsIcon from "../MsIcon.tsx";
import { useToast } from "./toast.tsx";

/**
 * Copy-to-clipboard button: check + "Copied" for 2s, optional toast, then
 * switches back. Used for passwords, IDs and the invite code.
 */
export default function CopyButton({
  value,
  label = "Copy",
  tone = "plain",
  className,
}: {
  value: string;
  label?: string;
  /** plain = text link; button = bordered secondary; small = compact. */
  tone?: "plain" | "button" | "small";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const toast = useToast();
  const toastOnCopy = label !== "Copy";

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard permissions vary by context (http vs https); tell the user.
      toast.push("error", "Copying is blocked by the browser. Select the value manually.");
      return;
    }
    setCopied(true);
    if (toastOnCopy) toast.push("success", `${label} copied to clipboard.`);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  const baseClasses =
    "inline-flex shrink-0 items-center gap-1.5 rounded-control text-xs font-semibold transition-colors";
  const toneClasses = {
    plain: "text-theme-maroon underline-offset-4 hover:underline",
    button: "border border-theme-line px-3.5 py-2 text-theme-ink hover:bg-theme-light-gray",
    small: "border border-theme-line px-2.5 py-1.5 text-theme-ink hover:bg-theme-light-gray",
  }[tone];

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? `Copied: ${label}` : `Copy ${label}`}
      className={`${baseClasses}${copied ? " text-risk-low-fg" : ""} ${toneClasses} ${className ?? ""}`}
    >
      <MsIcon name={copied ? "check" : "content_copy"} className="text-[15px]" optical={16} />
      {copied ? "Copied" : label}
    </button>
  );
}
