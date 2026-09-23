"use client";

import { useState } from "react";

import { Power, PowerOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { useFeatureFlags } from "@/components/feature-flags/FeatureGate";
import { type Flag, FlagDialog, type FlagDialogMode } from "@/components/feature-flags/FlagDialogs";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { MetricRow, Panel, PanelSkeleton } from "./primitives";

/**
 * Every kill switch at a glance, flippable in place. Flipping one runs the
 * same confirm steps as /admin/feature-flags; the page is still where the
 * full story (messages, dates) lives. Admin only, like `setFlag`.
 */
export function FeatureFlagsPanel() {
  const t = useTranslations("FeatureFlags");
  const flags = useFeatureFlags();
  const [open, setOpen] = useState<{ flag: Flag; mode: FlagDialogMode } | null>(null);

  const off = flags?.filter((flag) => !flag.enabled).length ?? 0;

  return (
    <Panel
      icon={<PowerOff />}
      title={t("title")}
      description={
        flags === undefined
          ? undefined
          : off === 0
            ? t("summaryAllOn")
            : t("summaryOff", { count: off, total: flags.length })
      }
      bodyClassName="p-3"
      action={
        <Button asChild variant="outline" size="xs">
          <Link href="/admin/feature-flags">{t("panel.manage")}</Link>
        </Button>
      }
    >
      {flags === undefined ? (
        <PanelSkeleton rows={4} />
      ) : (
        <div className="space-y-0.5">
          {flags.map((flag) => (
            <MetricRow
              key={flag.key}
              icon={flag.enabled ? Power : PowerOff}
              label={flag.label}
              sublabel={
                flag.enabled
                  ? t("on")
                  : flag.hasUpdate
                    ? `${t("off")} · ${t("updatePosted")}`
                    : `${t("off")} · ${t("noUpdate")}`
              }
              tone={flag.enabled ? "neutral" : "warn"}
              trailing={
                <div className="flex shrink-0 items-center gap-2">
                  {!flag.enabled && !flag.hasUpdate && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setOpen({ flag, mode: "post" })}
                    >
                      {t("postUpdateAction")}
                    </Button>
                  )}
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={() =>
                      setOpen({ flag, mode: flag.enabled ? "disable" : "enable" })
                    }
                    aria-label={t("toggleLabel", { label: flag.label })}
                  />
                </div>
              }
            />
          ))}
        </div>
      )}

      {open && <FlagDialog flag={open.flag} mode={open.mode} onClose={() => setOpen(null)} />}
    </Panel>
  );
}
