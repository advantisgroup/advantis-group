"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  KeyRound,
  Loader2,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { MOTION } from "@/components/activity/motion/motion-tokens";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsSection } from "@/components/ui/settings-rows";
import { useDesignPreview } from "@/lib/design-preview";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  source: "passkey" | "totp" | "step_up";
  event: string;
  detail?: string;
  at: number;
};

const COLLAPSED = 5;

/** A failed check is the one thing on this list someone might need to act on,
 * so it's the only thing that gets a colour. */
function isFailure(entry: Entry): boolean {
  return entry.event === "failed";
}

function isNotable(entry: Entry): boolean {
  return (
    entry.event === "new_device_detected" ||
    entry.event === "recovery_used" ||
    entry.event === "removed"
  );
}

function iconFor(entry: Entry): LucideIcon {
  if (entry.event === "new_device_detected") return MonitorSmartphone;
  if (isFailure(entry)) return ShieldAlert;
  if (entry.source === "passkey") return KeyRound;
  if (entry.source === "totp") return Smartphone;
  return ShieldCheck;
}

/**
 * The account's own security history. `passkeyAuditLog`, `totpAuditLog` and
 * `stepUpAuditLog` have been recording this since each feature shipped and
 * nothing ever showed it to the person it's about — which is the half of
 * "we noticed a new device" that actually lets them do something about it.
 */
export function SecurityActivityCard() {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const prefersReducedMotion = useReducedMotion();
  const refreshed = useDesignPreview() === "refreshed";
  const [expanded, setExpanded] = useState(false);
  const entries = useQuery(api.stepUp.securityActivity, { limit: 20 }) as Entry[] | undefined;

  function label(entry: Entry): string {
    if (entry.source === "step_up" && entry.event === "verified" && entry.detail) {
      // `detail` is the bare method name for a verification.
      const method = entry.detail;
      return t("activity.stepUpVerifiedWith", { method: t(`activity.method.${method}`) });
    }
    return t(`activity.${entry.source}.${entry.event}`);
  }

  const toggleMore = entries && entries.length > COLLAPSED && (
    <Button
      variant="ghost"
      size="sm"
      className="w-full"
      onClick={() => setExpanded((open) => !open)}
    >
      {expanded
        ? t("activity.showLess")
        : t("activity.showMore", { count: entries.length - COLLAPSED })}
    </Button>
  );

  if (refreshed) {
    return (
      <div id="security-activity" data-hash-anchor>
        <SettingsSection title={t("activity.title")} description={t("activity.hint")}>
          {entries === undefined ? (
            <div className="flex justify-center px-4 py-5 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">{t("activity.empty")}</p>
          ) : (
            <>
              {entries.slice(0, expanded ? undefined : COLLAPSED).map((entry) => {
                const Icon = iconFor(entry);
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        isFailure(entry)
                          ? "text-destructive"
                          : isNotable(entry)
                            ? "text-warn"
                            : "text-muted-foreground",
                      )}
                    />
                    <p className="min-w-0 flex-1 text-sm text-pretty">{label(entry)}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format.relativeTime(new Date(entry.at))}
                    </span>
                  </div>
                );
              })}
              {toggleMore && <div className="px-2 py-1.5">{toggleMore}</div>}
            </>
          )}
        </SettingsSection>
      </div>
    );
  }

  return (
    <Card id="security-activity" data-hash-anchor>
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-semibold tracking-tight">{t("activity.title")}</p>
          <p className="text-sm text-muted-foreground">{t("activity.hint")}</p>
        </div>

        {entries === undefined ? (
          <div className="flex justify-center py-3 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
            {t("activity.empty")}
          </p>
        ) : (
          <>
            <ol className="relative space-y-0">
              {/* One continuous rule behind the markers, rather than a border
                  per row — a per-row border leaves a visible seam at every
                  join once the rows have different heights. */}
              <span
                aria-hidden
                className="absolute bottom-4 left-[0.9375rem] top-4 w-px bg-border/70"
              />
              <AnimatePresence initial={false}>
                {entries.slice(0, expanded ? undefined : COLLAPSED).map((entry, index) => {
                  const Icon = iconFor(entry);
                  const failure = isFailure(entry);
                  return (
                    <motion.li
                      key={entry.id}
                      initial={
                        prefersReducedMotion || index < COLLAPSED ? false : { opacity: 0, y: -4 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: MOTION.fast, ease: MOTION.ease }}
                      className="relative flex items-start gap-3 overflow-hidden py-2"
                    >
                      <span
                        className={cn(
                          "relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border bg-card",
                          failure
                            ? "border-destructive/40 text-destructive"
                            : isNotable(entry)
                              ? "border-warning/40 text-warning"
                              : "border-border/70 text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-pretty">{label(entry)}</p>
                        <p className="text-xs text-muted-foreground">
                          {format.relativeTime(new Date(entry.at))}
                        </p>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>

            {toggleMore}
          </>
        )}
      </CardContent>
    </Card>
  );
}
