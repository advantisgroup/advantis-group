"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { useIsAdmin } from "@/components/providers/current-user";
import { useSalesCoachRoster } from "@/lib/sales-coach-ev-api";
import { cn } from "@/lib/utils";

import { AdminUserDetailDialog } from "./AdminUserDetailDialog";
import { scoreColorClass } from "./constants";
import { type RosterEntry } from "./types";

const WINDOWS = [7, 30, 90] as const;

export function AdminRoster() {
  const t = useTranslations("SalesCoachEv");
  const isAdmin = useIsAdmin();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const { roster } = useSalesCoachRoster(isAdmin, days);
  const [selected, setSelected] = useState<RosterEntry | null>(null);

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        {t("adminNotAuthorized")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{t("adminTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("adminSubtitle")}</p>
        </div>
        <div className="flex gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={cn(
                "rounded-full border border-border px-3 py-1 text-xs font-semibold transition-colors",
                days === w
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("adminWindowDays", { count: w })}
            </button>
          ))}
        </div>
      </div>

      {roster === undefined ? (
        <div className="p-10 text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : roster.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("adminEmpty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((entry) => (
            <Card
              key={entry.clerkUserId}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(entry)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(entry);
                }
              }}
              className="cursor-pointer transition-colors hover:bg-muted/40"
            >
              <CardContent className="pt-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-bold">{entry.userName}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("adminCallCount", { count: entry.callCount })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        "font-mono text-xl font-extrabold",
                        scoreColorClass(entry.avgScore),
                      )}
                    >
                      {entry.avgScore}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("adminAvgScore")}
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 text-[13px] text-foreground/80">
                  <div>
                    {t("adminAppointments")}:{" "}
                    <strong className="text-primary">{entry.appointments}</strong>
                  </div>
                  <div>
                    {t("adminRate")}:{" "}
                    <strong>
                      {entry.callCount
                        ? Math.round((entry.appointments / entry.callCount) * 100)
                        : 0}
                      %
                    </strong>
                  </div>
                  <div>
                    {t("adminTrend")}:{" "}
                    <strong className={entry.trend >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {entry.trend >= 0 ? "↑" : "↓"} {Math.abs(entry.trend)}
                    </strong>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      entry.avgScore >= 70
                        ? "bg-emerald-500"
                        : entry.avgScore >= 45
                          ? "bg-amber-500"
                          : "bg-red-500",
                    )}
                    style={{ width: `${entry.avgScore}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AdminUserDetailDialog
        entry={selected}
        days={days}
        open={selected !== null}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      />
    </div>
  );
}
