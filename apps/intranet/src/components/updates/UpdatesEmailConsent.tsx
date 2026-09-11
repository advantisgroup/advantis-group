"use client";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/notifications/NotificationPreferences";
import { useCurrentUser } from "@/components/providers/current-user";
import { SettingsRow } from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";

/**
 * Consent toggle for "Updates" broadcast emails — externals only. Internal
 * employees are always eligible and have nothing to opt into/out of here
 * (see `updatesEmailConsent` on the `users` table + `users.setUpdatesEmailConsent`).
 */
export function UpdatesEmailConsent() {
  const t = useTranslations("Updates");
  const user = useCurrentUser();
  const setConsent = useMutation(api.users.setUpdatesEmailConsent);
  const handleError = useErrorHandler();

  if (!user.external) return null;

  async function toggle() {
    try {
      await setConsent({ consent: !user.updatesEmailConsent });
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <SettingsRow
      title={t("emailConsentTitle")}
      description={t("emailConsentHint")}
      control={
        <Switch
          checked={user.updatesEmailConsent}
          onToggle={() => void toggle()}
          label={t("emailConsentTitle")}
        />
      }
    />
  );
}
