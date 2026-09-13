"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { Switch } from "@/components/ui/switch";

import { useSecurityState } from "./security-state";

export function SecurityPreferencesCard() {
  const t = useTranslations("Settings");
  const preference = useQuery(api.stepUp.securityPreference);
  const setPreference = useMutation(api.stepUp.setSecurityPreference);
  // Shared with the posture header and the passkey card — this used to run
  // its own `/passkeys` request purely to decide whether to show the warning
  // below, and could contradict the list rendered a few hundred pixels up.
  const { passkeys } = useSecurityState();
  const [saving, setSaving] = useState(false);

  async function toggle(checked: boolean) {
    setSaving(true);
    try {
      await setPreference({ alwaysRequireMfaAtSignIn: checked });
      toast.success(checked ? t("securityAlwaysMfaEnabled") : t("securityAlwaysMfaDisabled"));
    } catch {
      toast.error(t("securityPreferenceError"));
    } finally {
      setSaving(false);
    }
  }

  const checked = preference?.alwaysRequireMfaAtSignIn === true;
  const hasPasskey = (passkeys?.length ?? 0) > 0;

  const toggleControl = (
    <Switch
      checked={checked}
      disabled={preference === undefined || saving}
      onCheckedChange={(value) => void toggle(value)}
      aria-label={t("securityAlwaysMfa")}
    />
  );

  return (
    <div id="security-preferences" data-hash-anchor>
      <SettingsSection title={t("securitySignIn")}>
        <SettingsRow
          title={t("securityAlwaysMfa")}
          description={t("securityAlwaysMfaHint")}
          control={toggleControl}
        >
          {checked && hasPasskey && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-foreground">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" />
              {t("securityAlwaysMfaPasskeyWarning")}
            </p>
          )}
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
