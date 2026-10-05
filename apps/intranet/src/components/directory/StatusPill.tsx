"use client";

import { Circle, Plane, Wifi } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { PersonStatus } from "./person-status";

/**
 * Availability as a single pill. It replaces the old cramped coloured line that
 * sat under the badge stack and wrapped unpredictably, and it always ships an
 * icon plus a label — status is never carried by colour alone.
 */
export function StatusPill({ status, className }: { status: PersonStatus; className?: string }) {
  const t = useTranslations("Directory");
  const locale = useLocale();

  const config = {
    out: {
      icon: Plane,
      label: t("outUntil", {
        date: status.kind === "out" ? formatIsoDate(status.until, locale) : "",
      }),
      tone: "bg-info/12 text-info ring-info/25",
    },
    online: { icon: Wifi, label: t("online"), tone: "bg-ok/12 text-ok ring-ok/25" },
    away: {
      icon: Circle,
      label: t("away"),
      tone: "bg-muted text-muted-foreground ring-border",
    },
  }[status.kind];

  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        config.tone,
        className,
      )}
    >
      <config.icon className="size-3 shrink-0" />
      <span className="truncate">{config.label}</span>
    </span>
  );
}
