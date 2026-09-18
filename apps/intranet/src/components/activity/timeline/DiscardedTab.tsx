"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";

import { STATE_COLOR } from "@/components/activity/charts/theme";
import { ProviderBadge, type Provider } from "@/components/branding/ProviderMark";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StateName } from "@/lib/activity/activity";
import { hhmm } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";

const DAY_MS = 86_400_000;

/**
 * "Discarded" tab: signals the state engine refused to write to the timeline
 * for the selected day — e.g. "working" evidence arriving outside business
 * hours (overnight integration polls, a PC waking at 3 AM for updates). Shown
 * separately so managers can audit what was rejected and why, instead of the
 * bad data either corrupting the day or vanishing without a trace.
 */
export function DiscardedTab({
  employeeId,
  day,
  today,
}: {
  employeeId: string | null;
  /** Selected day (YYYY-MM-DD), shared with the rest of the timeline. */
  day: string;
  today: string;
}) {
  const { t, lang } = useI18n();

  // Local midnight → next midnight for the selected day.
  const dayStart = useMemo(() => new Date(`${day}T00:00:00`).getTime(), [day]);
  const rows = useQuery(
    api.activity.state.discardedHistory,
    employeeId
      ? {
          employeeId,
          since: dayStart,
          until: day === today ? undefined : dayStart + DAY_MS,
        }
      : "skip",
  );

  const reasonLabel = (reason: string) => {
    const key = `timeline.discarded.reason.${reason}`;
    const label = t(key);
    return label === key ? reason : label;
  };
  const sourceLabel = (source: string | null) =>
    source === "genesys" || source === "clockodo" ? (
      <ProviderBadge provider={source as Provider} />
    ) : source ? (
      t(`timeline.discarded.source.${source}`)
    ) : (
      "—"
    );

  return (
    <Card className="animate-fade-up">
      <CardHeader className="gap-3">
        <div>
          <CardTitle className="text-base">{t("timeline.discarded.heading")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("timeline.discarded.sub")}</p>
        </div>
        <div className="flex items-start gap-2.5 rounded-md border border-border-soft bg-muted/40 p-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("timeline.discarded.explain")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-0 sm:pt-0">
        {!employeeId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("timeline.hourly.unlinked")}
          </p>
        ) : rows === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("timeline.discarded.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-soft text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{t("timeline.discarded.col.time")}</th>
                  <th className="py-2 pr-4 font-medium">{t("timeline.discarded.col.state")}</th>
                  <th className="py-2 pr-4 font-medium">{t("timeline.discarded.col.source")}</th>
                  <th className="py-2 font-medium">{t("timeline.discarded.col.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.at}-${r.state}`}
                    className="border-b border-border-soft last:border-0"
                  >
                    <td className="py-2 pr-4 font-mono text-[12px] tabular-nums text-muted-foreground">
                      {hhmm(r.at, lang)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: STATE_COLOR[r.state as StateName],
                          }}
                        />
                        <span className="font-medium text-fg">{t(`empstate.${r.state}`)}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{sourceLabel(r.source)}</td>
                    <td className="py-2 text-muted-foreground">{reasonLabel(r.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
