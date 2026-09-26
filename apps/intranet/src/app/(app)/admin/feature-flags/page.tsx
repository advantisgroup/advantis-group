"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  Activity,
  ArrowUpRight,
  CircleCheck,
  Globe,
  type LucideIcon,
  MessagesSquare,
  Power,
  PowerOff,
  Sparkles,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useFeatureFlags } from "@/components/feature-flags/FeatureGate";
import { type Flag, FlagDialog, type FlagDialogMode } from "@/components/feature-flags/FlagDialogs";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const FEATURE_ICONS: Record<string, LucideIcon> = {
  activitytrack: Activity,
  chat: MessagesSquare,
  ai: Sparkles,
  marketingSubmissions: Globe,
};

type Details = FunctionReturnType<typeof api.org.featureFlags.details>[number];

/**
 * Whole-feature kill switches. Each card says what the feature is, whether
 * it's on, who last changed it, and — while it's off — what people are being
 * told and whether an update went out. The switch never flips on its own; it
 * opens the confirm step.
 */
function FlagCard({ flag, details }: { flag: Flag; details?: Details }) {
  const t = useTranslations("FeatureFlags");
  const locale = useLocale();
  const [dialog, setDialog] = useState<FlagDialogMode | null>(null);
  const Icon = FEATURE_ICONS[flag.key] ?? Power;
  const descriptionKey = `descriptions.${flag.key}` as const;
  const when = flag.updatedAt ? formatDateTime(flag.updatedAt, locale) : null;
  const by = details?.updatedByName;

  return (
    <li className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="flex items-start gap-4 px-5 py-4">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
            flag.enabled
              ? "bg-panel-2 text-foreground ring-border"
              : "bg-warn/12 text-warn ring-warn/25",
          )}
        >
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-[15px] font-semibold">{flag.label}</h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                flag.enabled ? "bg-ok/10 text-ok ring-ok/25" : "bg-warn/12 text-warn ring-warn/25",
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", flag.enabled ? "bg-ok" : "bg-warn")}
              />
              {flag.enabled ? t("on") : t("off")}
            </span>
          </div>
          {t.has(descriptionKey) && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t(descriptionKey)}
            </p>
          )}
          {flag.enabled && when && (
            <p className="mt-2 text-xs text-muted-foreground">
              {by ? t("lastChangedBy", { date: when, name: by }) : t("lastChanged", { date: when })}
            </p>
          )}
        </div>

        <Switch
          checked={flag.enabled}
          onCheckedChange={() => setDialog(flag.enabled ? "disable" : "enable")}
          aria-label={t("toggleLabel", { label: flag.label })}
          className="mt-1"
        />
      </div>

      {!flag.enabled && (
        <div className="space-y-3 border-t border-border/60 bg-muted/30 px-5 py-4 sm:pl-[4.75rem]">
          {flag.reason && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("toldLabel")}</p>
              <p className="mt-1 text-sm leading-relaxed">{flag.reason}</p>
            </div>
          )}

          {details && details.waiting > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("waiting", { count: details.waiting })}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            {when && (
              <span>
                {by ? t("turnedOffBy", { date: when, name: by }) : t("turnedOff", { date: when })}
              </span>
            )}
            <span className="flex items-center gap-2">
              {flag.hasUpdate ? (
                details?.updateId ? (
                  <Link
                    href={`/updates/${details.updateId}`}
                    className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {t("viewUpdate")}
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                ) : (
                  t("updatePosted")
                )
              ) : (
                <>
                  <span className="text-warn">{t("noUpdate")}</span>
                  <Button size="xs" variant="outline" onClick={() => setDialog("post")}>
                    {t("postUpdateAction")}
                  </Button>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {dialog && <FlagDialog flag={flag} mode={dialog} onClose={() => setDialog(null)} />}
    </li>
  );
}

export default function FeatureFlagsPage() {
  const t = useTranslations("FeatureFlags");
  const isAdmin = useIsAdmin();
  const flags = useFeatureFlags();
  const details = useQuery(api.org.featureFlags.details, isAdmin ? {} : "skip");

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  const off = flags?.filter((flag) => !flag.enabled) ?? [];
  const silent = off.filter((flag) => !flag.hasUpdate).length;

  return (
    <section className="mx-auto max-w-3xl space-y-6 pb-8">
      <PageHeaderBar title={t("title")} description={t("subtitle")} icon={<PowerOff />} />

      {flags === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="flex items-start gap-4 rounded-xl border border-border/70 bg-card px-5 py-4">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full",
                off.length ? "bg-warn/12 text-warn" : "bg-ok/12 text-ok",
              )}
            >
              {off.length ? <PowerOff className="size-5" /> : <CircleCheck className="size-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">
                {off.length === 0
                  ? t("summaryAllOn")
                  : t("summaryOff", { count: off.length, total: flags.length })}
                {silent > 0 && (
                  <span className="font-normal text-warn">
                    {" · "}
                    {t("summaryNoUpdate", { count: silent })}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t("statusHint")}
              </p>
            </div>
          </div>

          <ul className="space-y-3">
            {flags.map((flag) => (
              <FlagCard
                key={flag.key}
                flag={flag}
                details={details?.find((d) => d.key === flag.key)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
