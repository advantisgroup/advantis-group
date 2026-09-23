"use client";

import { useState } from "react";

import { PowerOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useFeatureFlags } from "@/components/feature-flags/FeatureGate";
import { type Flag, FlagDialog, type FlagDialogMode } from "@/components/feature-flags/FlagDialogs";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Whole-feature kill switches, one line each: what it controls, whether it's
 * on, and — when it's off — what people are being told and whether an update
 * went out. The switch never flips on its own; it opens the confirm step.
 */
function FlagRow({ flag }: { flag: Flag }) {
  const t = useTranslations("FeatureFlags");
  const locale = useLocale();
  const [dialog, setDialog] = useState<FlagDialogMode | null>(null);
  const descriptionKey = `descriptions.${flag.key}` as const;

  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="text-sm font-medium">{flag.label}</p>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", flag.enabled ? "bg-ok" : "bg-warn")}
            />
            {flag.enabled ? t("on") : t("off")}
          </span>
        </div>
        {t.has(descriptionKey) && (
          <p className="mt-1 text-sm text-muted-foreground">{t(descriptionKey)}</p>
        )}

        {!flag.enabled && flag.reason && (
          <p className="mt-3 border-l-2 border-warn/40 pl-3 text-sm text-foreground/80">
            {flag.reason}
          </p>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          {flag.enabled
            ? flag.updatedAt && t("lastChanged", { date: formatDateTime(flag.updatedAt, locale) })
            : flag.updatedAt && t("turnedOff", { date: formatDateTime(flag.updatedAt, locale) })}
          {!flag.enabled && (
            <>
              {" · "}
              {flag.hasUpdate ? (
                t("updatePosted")
              ) : (
                <>
                  {t("noUpdate")}
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setDialog("post")}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {t("postUpdateAction")}
                  </button>
                </>
              )}
            </>
          )}
        </p>
      </div>

      <Switch
        checked={flag.enabled}
        onCheckedChange={() => setDialog(flag.enabled ? "disable" : "enable")}
        aria-label={t("toggleLabel", { label: flag.label })}
        className="mt-0.5"
      />

      {dialog && <FlagDialog flag={flag} mode={dialog} onClose={() => setDialog(null)} />}
    </li>
  );
}

export default function FeatureFlagsPage() {
  const t = useTranslations("FeatureFlags");
  const isAdmin = useIsAdmin();
  const flags = useFeatureFlags();

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  const off = flags?.filter((flag) => !flag.enabled) ?? [];
  const silent = off.filter((flag) => !flag.hasUpdate).length;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeaderBar title={t("title")} description={t("subtitle")} icon={<PowerOff />} />

      {flags === undefined ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden
              className={cn("size-2 rounded-full", off.length ? "bg-warn" : "bg-ok")}
            />
            {off.length === 0
              ? t("summaryAllOn")
              : t("summaryOff", { count: off.length, total: flags.length })}
            {silent > 0 && ` · ${t("summaryNoUpdate", { count: silent })}`}
          </p>

          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {flags.map((flag) => (
              <FlagRow key={flag.key} flag={flag} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
