"use client";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/notifications/NotificationPreferences";
import { useCurrentUser } from "@/components/providers/current-user";
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
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Mail className="size-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{t("emailConsentTitle")}</span>
          <span className="block text-xs text-muted-foreground">{t("emailConsentHint")}</span>
        </span>
      </div>
      <Switch
        checked={user.updatesEmailConsent}
        onToggle={() => void toggle()}
        label={t("emailConsentTitle")}
      />
    </div>
  );
}
