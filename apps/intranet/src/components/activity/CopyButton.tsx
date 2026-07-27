"use client";

import React, { useEffect, useRef, useState } from "react";

import { Check, Copy } from "lucide-react";

import { useI18n } from "@/lib/activity/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function CopyButton({
  value,
  label,
  className,
  size = "sm",
  children,
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    const promise = navigator.clipboard.writeText(value);

    toast.promise(promise, {
      loading: t("common.copy"),
      success: t("common.copied"),
      error: t("common.copyFailed"),
    });

    try {
      await promise;

      setCopied(true);

      if (timer.current) clearTimeout(timer.current);

      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      //
    }
  }

  const box = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  if (children) {
    const child = children as React.ReactElement<{
      onClick?: React.MouseEventHandler;
      "aria-label"?: string;
    }>;

    return React.cloneElement(child, {
      onClick: (event) => {
        child.props.onClick?.(event);
        copy();
      },
      "aria-label": copied ? t("common.copied") : (label ?? t("common.copy")),
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t("common.copied") : (label ?? t("common.copy"))}
      title={copied ? t("common.copied") : (label ?? t("common.copy"))}
      className={cn(
        "grid shrink-0 place-items-center rounded-md transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60",
        copied ? "text-ok" : "text-muted-foreground hover:bg-panel-2 hover:text-fg",
        box,
        className,
      )}
    >
      {copied ? <Check className={cn(icon, "animate-scale-in")} /> : <Copy className={icon} />}

      <span className="sr-only" aria-live="polite">
        {copied ? t("common.copied") : ""}
      </span>
    </button>
  );
}
