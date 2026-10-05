"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";

import { STATE_COLOR } from "@/components/charts/theme";
import { ProviderBadge, type Provider } from "@/components/branding/ProviderMark";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StateName } from "@/lib/activity/activity";
import { useI18n } from "@/lib/activity/i18n";

function stamp(ms: number, lang: string): string {
  return new Date(ms).toLocaleString(lang, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Settings → "Discarded data": the org-wide feed of signals the state engine
 * refused to write to timelines (e.g. "working" evidence outside business
 * hours — overnight integration polls, PCs waking for updates). Deliberately
 * tucked away behind Settings rather than a prominent tab: it is an audit
 * surface, not a daily view. Seeing everyone's rejections in one list makes
 * systemic patterns obvious (every PC "active" at 02:00 = a bug, not work).
 */
export function DiscardedPanel() {
  const { t, lang } = useI18n();
  const rows = useQuery(api.activity.state.discardedRecent, {});

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
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/20 text-signal">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">{t("settings.discarded.heading")}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">{t("settings.discarded.sub")}</p>
        <div className="rounded-md border border-border-soft bg-muted/40 p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("timeline.discarded.explain")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-0 sm:pt-0">
        {rows === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("settings.discarded.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-soft text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{t("timeline.discarded.col.time")}</th>
                  <th className="py-2 pr-4 font-medium">{t("settings.discarded.col.person")}</th>
                  <th className="py-2 pr-4 font-medium">{t("timeline.discarded.col.state")}</th>
                  <th className="py-2 pr-4 font-medium">{t("timeline.discarded.col.source")}</th>
                  <th className="py-2 font-medium">{t("timeline.discarded.col.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.employeeId}-${r.at}-${r.state}`}
                    className="border-b border-border-soft last:border-0"
                  >
                    <td className="py-2 pr-4 font-mono text-[12px] tabular-nums text-muted-foreground">
                      {stamp(r.at, lang)}
                    </td>
                    <td className="py-2 pr-4 font-medium text-fg">
                      {r.personName ?? r.employeeId}
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
                        {t(`empstate.${r.state}`)}
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
