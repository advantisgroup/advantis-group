"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { DailyTrendChart } from "@/components/activity/charts/DailyTrendChart";
import { WeekSwitchesChart } from "@/components/activity/charts/WeekSwitchesChart";
import { Reveal } from "@/components/activity/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/activity/motion/Stagger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { weekStartOf } from "@/lib/activity/activity";
import { formatRelativeTime, todayLocalDay } from "@/lib/activity/fmt";
import { HighlightedSentence } from "@/lib/activity/highlightedText";
import { useI18n } from "@/lib/activity/i18n";
import { cn } from "@/lib/utils";

type Severity = "good" | "bad" | "neutral";
type WeekChoice = "thisWeek" | "lastWeek";

const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  good: CheckCircle2,
  bad: AlertTriangle,
  neutral: Info,
};
const SEVERITY_CLASS: Record<Severity, string> = {
  good: "text-ok",
  bad: "text-warn",
  neutral: "text-muted-foreground",
};

/** Shift a YYYY-MM-DD day by `n` days (UTC arithmetic), matching the Reports page. */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/**
 * Generated-on-request weekly pattern report: a plain-language read of one
 * employee's active/idle behaviour (switching frequency, inactivity streaks,
 * week-over-week deltas — see `packages/convex/convex/activity/lib/
 * patterns.ts`), with charts underneath. Reports persist per employee/week so
 * re-opening the tab shows the last generated one instantly; "Regenerate"
 * recomputes from the latest raw data.
 */
export function PatternReportTab({ employeeId }: { employeeId: string | null }) {
  const { t, lang } = useI18n();
  const today = todayLocalDay();
  const [week, setWeek] = useState<WeekChoice>("thisWeek");
  const weekStart = useMemo(() => {
    const thisWeekStart = weekStartOf(today);
    return week === "thisWeek" ? thisWeekStart : addDays(thisWeekStart, -7);
  }, [today, week]);

  const report = useQuery(
    api.activity.patternReports.get,
    employeeId ? { employeeId, weekStart } : "skip",
  );
  const generateReport = useMutation(api.activity.patternReports.generate);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (!employeeId) return;
    setGenerating(true);
    try {
      await generateReport({ employeeId, weekStart });
    } finally {
      setGenerating(false);
    }
  }

  const dailyChart = useMemo(
    () =>
      (report?.daily ?? []).map((d) => ({
        label: dayLabel(d.day),
        activeHours: +(d.activeSeconds / 3600).toFixed(2),
        idleHours: +(d.idleSeconds / 3600).toFixed(2),
      })),
    [report],
  );
  const switchesChart = useMemo(
    () =>
      (report?.daily ?? []).map((d) => ({
        label: dayLabel(d.day),
        quickFlips: d.quickFlips,
      })),
    [report],
  );

  if (!employeeId) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("timeline.hourly.unlinked")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="animate-fade-up">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t("pattern.heading")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("pattern.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={week} onValueChange={(v) => setWeek(v as WeekChoice)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thisWeek">{t("pattern.week.thisWeek")}</SelectItem>
                  <SelectItem value="lastWeek">{t("pattern.week.lastWeek")}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleGenerate} disabled={generating}>
                <RefreshCw className={cn("h-4 w-4", generating && "animate-spin")} />
                {report ? t("pattern.regenerate") : t("pattern.generate")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 sm:pt-0">
          <Reveal show={generating}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 animate-pulse text-signal" />
              {t("pattern.generating")}
            </div>
          </Reveal>

          {!generating && report === undefined && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-11/12" />
              <Skeleton className="h-10 w-4/5" />
            </div>
          )}

          {!generating && report === null && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("pattern.empty")}</p>
          )}

          {!generating && report && (
            <>
              <Stagger className="space-y-2.5">
                {report.findings.map((finding, i) => {
                  const Icon = SEVERITY_ICON[finding.severity];
                  return (
                    <StaggerItem key={finding.id} index={i}>
                      <div className="flex items-start gap-2.5 rounded-lg bg-panel-2 px-3.5 py-2.5">
                        <Icon
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            SEVERITY_CLASS[finding.severity],
                          )}
                        />
                        <HighlightedSentence
                          template={t(finding.key)}
                          values={finding.values}
                          lang={lang}
                          className="text-sm leading-relaxed text-fg"
                        />
                      </div>
                    </StaggerItem>
                  );
                })}
              </Stagger>
              <p className="text-xs text-muted-foreground">
                {t("pattern.lastGenerated", {
                  time: formatRelativeTime(report.generatedAt, lang),
                })}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {report && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle className="text-base">{t("pattern.chart.daily.heading")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 sm:pt-0">
              <DailyTrendChart
                data={dailyChart}
                activeLabel={t("common.active")}
                idleLabel={t("common.idle")}
              />
            </CardContent>
          </Card>
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle className="text-base">{t("pattern.chart.switches.heading")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("pattern.chart.switches.sub")}</p>
            </CardHeader>
            <CardContent className="pt-0 sm:pt-0">
              <WeekSwitchesChart
                data={switchesChart}
                seriesLabel={t("pattern.chart.switches.heading")}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
