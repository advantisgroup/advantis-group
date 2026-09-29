"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import {
  NOTIFICATION_SECTIONS,
  Switch,
  useBrowserPush,
} from "@/components/notifications/NotificationPreferences";
import { SettingsRow } from "@/components/ui/settings-rows";

import { StepGroup, StepIntro } from "./step-parts";

/**
 * The same settings as Settings → Notifications, one switch per category
 * instead of per type — a first-day choice is "do I want chat pings", not
 * "mentions but not messages". The fine-grained version stays in Settings.
 */
export function NotificationsStep() {
  const t = useTranslations("Onboarding");
  const tn = useTranslations("Notifications");
  const prefs = useQuery(api.notifications.notifications.getPreferences);
  const setPreferences = useMutation(api.notifications.notifications.setPreferences);
  const setDeliveryOption = useMutation(api.notifications.notifications.setDeliveryOption);
  const browser = useBrowserPush();

  const muted = prefs?.mutedTypes ?? [];

  function toggleSection(types: readonly string[]) {
    const on = types.every((type) => !muted.includes(type));
    const next = on
      ? [...muted, ...types.filter((type) => !muted.includes(type))]
      : muted.filter((type) => !types.includes(type));
    void setPreferences({ mutedTypes: next });
  }

  const list = "divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70";

  return (
    <>
      <StepIntro title={t("notificationsTitle")} hint={t("notificationsHint")} />
      <div className="space-y-7">
        <StepGroup label={tn("sectionDelivery")}>
          <div className={list}>
            <SettingsRow
              title={tn("browserTitle")}
              description={tn("browserHint")}
              control={
                <Switch
                  checked={browser.enabled}
                  onToggle={() => void browser.toggle()}
                  label={tn("browserTitle")}
                />
              }
            >
              {browser.denied && (
                <p className="mt-2 text-xs text-warn">{tn("browserDeniedHint")}</p>
              )}
            </SettingsRow>
            <SettingsRow
              title={tn("digestTitle")}
              description={tn("digestHint")}
              control={
                <Switch
                  checked={prefs?.dailyDigest ?? false}
                  onToggle={() =>
                    void setDeliveryOption({
                      option: "dailyDigest",
                      enabled: !(prefs?.dailyDigest ?? false),
                    })
                  }
                  label={tn("digestTitle")}
                />
              }
            />
          </div>
        </StepGroup>

        <StepGroup label={t("notificationsAbout")}>
          <div className={list}>
            {NOTIFICATION_SECTIONS.map((section) => (
              <SettingsRow
                key={section.key}
                title={tn(`cat_${section.key}`)}
                description={tn(`section_${section.key}Hint`)}
                control={
                  <Switch
                    checked={section.types.every((type) => !muted.includes(type))}
                    onToggle={() => toggleSection(section.types)}
                    label={tn(`cat_${section.key}`)}
                  />
                }
              />
            ))}
          </div>
        </StepGroup>
      </div>
    </>
  );
}
