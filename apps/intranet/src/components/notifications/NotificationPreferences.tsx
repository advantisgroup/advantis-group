"use client";

import { useEffect, useState, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useIsManager } from "@/components/providers/current-user";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { cn } from "@/lib/utils";

/**
 * The notification types a user is allowed to silence, grouped for display.
 * `access_request` is deliberately absent — managers must not mute access
 * requests.
 */
export const NOTIFICATION_SECTIONS = [
  { key: "chat", types: ["chat-message", "chat-mention"] },
  { key: "drafts", types: ["draft_shared", "draft_comment"] },
  { key: "absence", types: ["absence_request", "absence_decision"] },
  { key: "appointment", types: ["appointment"] },
  { key: "uploads", types: ["upload_request", "upload_decision"] },
  { key: "announcement", types: ["announcement"] },
] as const;

/** The browser-notification opt-in: asks for permission the first time it's
 * switched on, and remembers the choice on the account. */
export function useBrowserPush() {
  const t = useTranslations("Notifications");
  const userPrefs = useQuery(api.people.preferences.getMine);
  const setUserPrefs = useMutation(api.people.preferences.setMine);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    // The Notification global doesn't exist during SSR; this can only be
    // read post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(typeof Notification !== "undefined" ? Notification.permission : null);
  }, []);

  const enabled = (userPrefs?.browserPushEnabled ?? false) && permission === "granted";

  async function toggle() {
    if (enabled) {
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

  return { enabled, denied: permission === "denied", toggle };
}

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
        "relative shrink-0 rounded-full transition-colors h-[22px] w-[38px] border",
        checked ? "border-ok bg-ok" : "bg-muted border-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 rounded-full shadow transition-all size-4 bg-card",
          checked ? "left-[18px]" : "left-0.5",
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
  const prefs = useQuery(api.notifications.notifications.getPreferences);
  const setPreferences = useMutation(api.notifications.notifications.setPreferences);
  const setDeliveryOption = useMutation(api.notifications.notifications.setDeliveryOption);
  const browser = useBrowserPush();

  const muted = prefs?.mutedTypes ?? [];

  function toggleType(type: string) {
    const next = muted.includes(type) ? muted.filter((m) => m !== type) : [...muted, type];
    void setPreferences({ mutedTypes: next });
  }

  return (
    <div className="space-y-8">
      <SettingsSection title={t("sectionDelivery")} description={t("sectionDeliveryHint")}>
        <SettingsRow
          title={t("browserTitle")}
          description={t("browserHint")}
          control={
            <Switch
              checked={browser.enabled}
              onToggle={() => void browser.toggle()}
              label={t("browserTitle")}
            />
          }
        >
          {browser.denied && <p className="mt-2 text-xs text-warn">{t("browserDeniedHint")}</p>}
        </SettingsRow>
        <SettingsRow
          title={t("digestTitle")}
          description={t("digestHint")}
          control={
            <Switch
              checked={prefs?.dailyDigest ?? false}
              onToggle={() =>
                void setDeliveryOption({
                  option: "dailyDigest",
                  enabled: !(prefs?.dailyDigest ?? false),
                })
              }
              label={t("digestTitle")}
            />
          }
        />
        {isManager && (
          <SettingsRow
            title={t("weeklyReportTitle")}
            description={t("weeklyReportHint")}
            control={
              <Switch
                checked={prefs?.weeklyReport ?? false}
                onToggle={() =>
                  void setDeliveryOption({
                    option: "weeklyReport",
                    enabled: !(prefs?.weeklyReport ?? false),
                  })
                }
                label={t("weeklyReportTitle")}
              />
            }
          />
        )}
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

      {NOTIFICATION_SECTIONS.map((section) => (
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
