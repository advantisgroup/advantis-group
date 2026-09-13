"use client";

import { useEffect, useState, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useIsManager } from "@/components/providers/current-user";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { notificationVisual } from "@/lib/notification-kinds";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

/**
 * The subset of notification types a user is allowed to silence, in display
 * order. Icons/tints come from the shared registry so this list and the
 * notification feed can't drift apart. `access_request` is deliberately
 * absent — managers must not mute access requests.
 */
export const MUTABLE_TYPES: { type: string; icon: LucideIcon; tint: string }[] = [
  "chat-message",
  "chat-mention",
  "absence_request",
  "absence_decision",
  "announcement",
  "upload_request",
  "upload_decision",
].map((type) => ({ type, ...notificationVisual(type) }));

const SECTIONS = [
  { key: "chat", types: ["chat-message", "chat-mention"] },
  { key: "absence", types: ["absence_request", "absence_decision"] },
  { key: "uploads", types: ["upload_request", "upload_decision"] },
  { key: "announcement", types: ["announcement"] },
] as const;

export function Switch({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors refreshed:h-[22px] refreshed:w-[38px] refreshed:border",
        checked
          ? "bg-primary refreshed:border-ok refreshed:bg-ok"
          : "bg-muted refreshed:border-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-background shadow transition-all refreshed:size-4 refreshed:bg-card",
          checked ? "left-[1.375rem] refreshed:left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

/**
 * Per-type notification mutes + the browser-notification opt-in. Shared
 * between the notifications tab and the settings page so preferences live in
 * both places without divergence.
 */
export function NotificationPreferences({ deliveryExtra }: { deliveryExtra?: ReactNode }) {
  const t = useTranslations("Notifications");
  const isManager = useIsManager();
  const prefs = useQuery(api.notifications.getPreferences);
  const setPreferences = useMutation(api.notifications.setPreferences);
  const setDailyDigest = useMutation(api.notifications.setDailyDigest);
  const userPrefs = useQuery(api.userPreferences.getMine);
  const setUserPrefs = useMutation(api.userPreferences.setMine);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    // The Notification global doesn't exist during SSR; this can only be
    // read post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(typeof Notification !== "undefined" ? Notification.permission : null);
  }, []);

  const muted = prefs?.mutedTypes ?? [];

  function toggleType(type: string) {
    const next = muted.includes(type) ? muted.filter((m) => m !== type) : [...muted, type];
    void setPreferences({ mutedTypes: next });
  }

  const browserEnabled = (userPrefs?.browserPushEnabled ?? false) && permission === "granted";

  async function toggleBrowser() {
    if (browserEnabled) {
      await setUserPrefs({ browserPushEnabled: false });
      return;
    }
    if (typeof Notification === "undefined") {
      toast.error(t("browserUnsupported"));
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") {
      toast.error(t("browserDenied"));
      return;
    }
    await setUserPrefs({ browserPushEnabled: true });
  }

  return (
    <div className="space-y-8">
      <SettingsSection title={t("sectionDelivery")} description={t("sectionDeliveryHint")}>
        <SettingsRow
          title={t("browserTitle")}
          description={t("browserHint")}
          control={
            <Switch
              checked={browserEnabled}
              onToggle={() => void toggleBrowser()}
              label={t("browserTitle")}
            />
          }
        >
          {permission === "denied" && (
            <p className="mt-2 text-xs text-warn">{t("browserDeniedHint")}</p>
          )}
        </SettingsRow>
        <SettingsRow
          title={t("digestTitle")}
          description={t("digestHint")}
          control={
            <Switch
              checked={prefs?.dailyDigest ?? false}
              onToggle={() => void setDailyDigest({ enabled: !(prefs?.dailyDigest ?? false) })}
              label={t("digestTitle")}
            />
          }
        />
        {deliveryExtra}
        {isManager && (
          <SettingsRow
            title={t("accessRequestsTitle")}
            description={t("accessRequestsHint")}
            control={
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" />
                {t("alwaysOn")}
              </span>
            }
          />
        )}
      </SettingsSection>

      {SECTIONS.map((section) => (
        <SettingsSection
          key={section.key}
          title={t(`cat_${section.key}`)}
          description={t(`section_${section.key}Hint`)}
        >
          {section.types.map((type) => (
            <SettingsRow
              key={type}
              title={t(`type_${type}`)}
              description={t(`desc_${type}`)}
              control={
                <Switch
                  checked={!muted.includes(type)}
                  onToggle={() => toggleType(type)}
                  label={t(`type_${type}`)}
                />
              }
            />
          ))}
        </SettingsSection>
      ))}
    </div>
  );
}
