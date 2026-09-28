"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { aiErrorKey } from "@/components/ai/AiRunCard";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PersonLink } from "@/components/profile/PersonLink";
import { useIsManager } from "@/components/providers/current-user";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

/** Saves when the field is left or Enter is pressed — no save button. */
function DailyLimit() {
  const t = useTranslations("Ai");
  const settings = useQuery(api.aiRuns.settings);
  const save = useMutation(api.aiRuns.setDailyRunLimit);
  const handleError = useErrorHandler();
  const [draft, setDraft] = useState<string | null>(null);

  if (!settings) return <Skeleton className="h-20 rounded-xl" />;
  const value = draft ?? String(settings.dailyRunLimit);

  function commit() {
    if (draft === null) return;
    const next = Number(draft);
    setDraft(null);
    if (!Number.isFinite(next) || next === settings!.dailyRunLimit) return;
    save({ dailyRunLimit: next })
      .then(() => toast.success(t("admin.limitSaved")))
      .catch(handleError);
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card px-4 py-3.5">
      <div className="min-w-0 max-w-lg">
        <h2 className="text-sm font-semibold tracking-tight">{t("admin.limitTitle")}</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {t("admin.limitHint")}
        </p>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={settings.maxDailyRunLimit}
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-9 w-24 text-right tabular-nums"
        />
        {t("admin.limitUnit")}
      </label>
    </section>
  );
}

function WebSearchSetting() {
  const t = useTranslations("Ai");
  const settings = useQuery(api.aiRuns.settings);
  const save = useMutation(api.aiRuns.setWebSearch);
  const handleError = useErrorHandler();

  if (!settings) return <Skeleton className="h-20 rounded-xl" />;

  return (
    <section className="flex items-center justify-between gap-6 rounded-xl border border-border/70 bg-card px-4 py-3.5">
      <div className="min-w-0 max-w-lg">
        <h2 className="text-sm font-semibold tracking-tight">{t("admin.webTitle")}</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {t("admin.webHint")}
        </p>
      </div>
      <Switch
        checked={settings.webSearch}
        aria-label={t("admin.webTitle")}
        onCheckedChange={(enabled) =>
          save({ enabled })
            .then(() => toast.success(t(enabled ? "admin.webOn" : "admin.webOff")))
            .catch(handleError)
        }
      />
    </section>
  );
}

/**
 * What AI has been doing lately, for the people answerable for it: how much
 * ran, what failed and why, what it cost in tokens, and what people said
 * about the answers. No content — outputs stay encrypted end to end, and
 * this page never asks for them.
 */
export default function AiActivityPage() {
  const t = useTranslations("Ai");
  const locale = useLocale();
  const isManager = useIsManager();
  const stats = useQuery(api.aiRuns.stats, isManager ? {} : "skip");
  const feedback = useQuery(api.aiRuns.feedbackList, isManager ? {} : "skip");

  if (!isManager) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeaderBar
        title={t("admin.title")}
        description={t("admin.description")}
        icon={<Sparkles />}
      />

      <div className="space-y-3">
        <DailyLimit />
        <WebSearchSetting />
      </div>

      {stats === undefined ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <div className="space-y-2">
          <KpiStrip className="lg:grid-cols-3">
            <Kpi featured label={t("admin.runs")} value={stats.total} />
            <Kpi
              label={t("admin.failures")}
              value={stats.failed}
              tone={stats.failed > 0 ? "warn" : "neutral"}
            />
            <Kpi label={t("admin.tokens")} value={stats.tokens.toLocaleString(locale)} />
          </KpiStrip>
          {stats.capped && (
            <p className="text-xs text-muted-foreground">
              {t("admin.capped", { count: stats.total })}
            </p>
          )}
        </div>
      )}

      {stats && stats.byKind.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-tight">{t("admin.byKind")}</h2>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("admin.columnFeature")}</TableHead>
                  <TableHead className="w-24 text-right">{t("admin.columnRuns")}</TableHead>
                  <TableHead className="w-28 text-right">{t("admin.columnFailed")}</TableHead>
                  <TableHead className="w-32 text-right">{t("admin.columnTokens")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byKind.map((row) => (
                  <TableRow key={row.kind} className="hover:bg-transparent">
                    <TableCell className="font-medium">{t(`kind.${row.kind}`)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={row.failed > 0 ? "text-warn" : "text-muted-foreground"}>
                        {row.failed}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.tokens.toLocaleString(locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">{t("admin.byError")}</h2>
        {stats && stats.byError.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noFailures")}</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {(stats?.byError ?? []).map((row) => (
              <li key={row.code} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm">{t(aiErrorKey(row.code))}</span>
                  <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
                </span>
                <span className="shrink-0 tabular-nums">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">{t("admin.feedback")}</h2>
        {feedback === undefined ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : feedback.length === 0 ? (
          <EmptyState icon={<Sparkles />} title={t("admin.noFeedback")} />
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {feedback.map((row) => {
              const Icon = row.rating === "up" ? ThumbsUp : ThumbsDown;
              return (
                <li key={row._id} className="flex gap-3 px-4 py-3.5">
                  <Icon
                    aria-label={t(row.rating === "up" ? "admin.ratingUp" : "admin.ratingDown")}
                    className={`mt-0.5 size-4 shrink-0 ${
                      row.rating === "up" ? "text-ok" : "text-destructive"
                    }`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p
                      className={
                        row.note
                          ? "whitespace-pre-wrap break-words text-sm"
                          : "text-sm italic text-muted-foreground"
                      }
                    >
                      {row.note ?? t("admin.noNote")}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <PersonLink userId={row.userId}>{row.userName}</PersonLink>
                      <span aria-hidden>·</span>
                      <span>{t(`kind.${row.kind}`)}</span>
                      <span aria-hidden>·</span>
                      <span>{formatDateTime(row.createdAt, locale)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
