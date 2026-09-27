"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/notifications/NotificationPreferences";
import { useCurrentUser } from "@/components/providers/current-user";
import { SettingsRow } from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";

/**
 * The Monday "what you missed" email. On for employees and off for external
 * members until they change it, the same default the server uses
 * (digest/weekly.ts `wantsDigest`).
 */
export function WeeklyDigestToggle() {
  const t = useTranslations("Notifications");
  const user = useCurrentUser();
  const prefs = useQuery(api.people.preferences.getMine);
  const setPrefs = useMutation(api.people.preferences.setMine);
  const handleError = useErrorHandler();
  if (prefs === undefined) return null;
  const enabled = prefs?.weeklyDigest ?? !user.external;

  async function toggle() {
    try {
      await setPrefs({ weeklyDigest: !enabled });
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <SettingsRow
      title={t("weeklyDigestTitle")}
      description={t("weeklyDigestHint")}
      control={
        <Switch checked={enabled} onToggle={() => void toggle()} label={t("weeklyDigestTitle")} />
      }
    />
  );
}
