"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "@/lib/activity/i18n";
import { cn } from "@/lib/utils";

/**
 * Copy-to-clipboard button with success feedback: on a successful copy it swaps
 * the clipboard icon for a green check for ~1.5s, then reverts. Used anywhere an
 * id/email is worth grabbing (roster, device registry, timeline) so the boss can
 * paste into Genesys/Clockodo without hand-typing. `shrink-0` by default so it
 * never pushes neighbouring content around in a crowded row.
 */
export function CopyButton({
  value,
  label,
  className,
  size = "sm",
}: {
  value: string;
  /** Accessible label, e.g. "Copy employee ID". Falls back to a generic one. */
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can reject (insecure context / permissions) — stay silent;
      // the icon simply doesn't flip, so nothing misleads the user.
    }
  }

  const box = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t("common.copied") : (label ?? t("common.copy"))}
      title={copied ? t("common.copied") : (label ?? t("common.copy"))}
      className={cn(
        "grid shrink-0 place-items-center rounded-md transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60",
        copied
          ? "text-ok"
          : "text-muted-foreground hover:bg-panel-2 hover:text-fg",
        box,
        className
      )}
    >
      {copied ? (
        <Check className={cn(icon, "animate-scale-in")} />
      ) : (
        <Copy className={icon} />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? t("common.copied") : ""}
      </span>
    </button>
  );
}
