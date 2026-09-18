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

const AREAS = ["performance", "applicant_vault"] as const;

/** Phase 7 of docs/future-features/21_auth-consolidation.md's per-area
 * "always step up here" vs. "trust this device for 14 days" preference,
 * one row per linked area. Separate from the org-wide MFA toggle above —
 * that one governs signing into the intranet itself; these govern re-entry
 * into a password-less linked area once already signed in. */
function AreaPreferenceRow({ area }: { area: (typeof AREAS)[number] }) {
  const t = useTranslations("Settings");
  const pref = useQuery(api.stepUp.areaPreference, { area });
  const setPref = useMutation(api.stepUp.setAreaPreference);
  const [saving, setSaving] = useState(false);

  async function toggle(checked: boolean) {
    setSaving(true);
    try {
      await setPref({ area, mode: checked ? "always_step_up" : "trust_device" });
    } catch {
      toast.error(t("securityPreferenceError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsRow
      title={t(area === "performance" ? "securityAreaPerformance" : "securityAreaApplicantVault")}
      description={t("securityAreaAlwaysStepUpHint")}
      control={
        <Switch
          checked={pref?.mode === "always_step_up"}
          disabled={pref === undefined || saving}
          onCheckedChange={(value) => void toggle(value)}
          aria-label={t(
            area === "performance" ? "securityAreaPerformance" : "securityAreaApplicantVault",
          )}
        />
      }
    />
  );
}

export function SecurityPreferencesCard() {
  const t = useTranslations("Settings");
  const preference = useQuery(api.stepUp.securityPreference);
  const setPreference = useMutation(api.stepUp.setSecurityPreference);
  // Shared with the posture header and the passkey card — this used to run
  // its own `/passkeys` request purely to decide whether to show the warning
  // below, and could contradict the list rendered a few hundred pixels up.
  const { passkeys } = useSecurityState();
  const [saving, setSaving] = useState(false);
  const [savingDeviceTracking, setSavingDeviceTracking] = useState(false);

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

  async function toggleDeviceTracking(checked: boolean) {
    setSavingDeviceTracking(true);
    try {
      // The switch reads "remember my devices", so unchecked means opting out.
      await setPreference({ deviceTrackingOptOut: !checked });
    } catch {
      toast.error(t("securityPreferenceError"));
    } finally {
      setSavingDeviceTracking(false);
    }
  }

  const checked = preference?.alwaysRequireMfaAtSignIn === true;
  const deviceTrackingOn = preference?.deviceTrackingOptOut !== true;
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
        <SettingsRow
          title={t("securityDeviceTracking")}
          description={t("securityDeviceTrackingHint")}
          control={
            <Switch
              checked={deviceTrackingOn}
              disabled={preference === undefined || savingDeviceTracking}
              onCheckedChange={(value) => void toggleDeviceTracking(value)}
              aria-label={t("securityDeviceTracking")}
            />
          }
        />
      </SettingsSection>
      <SettingsSection title={t("securityAreaTitle")} description={t("securityAreaHint")}>
        {AREAS.map((area) => (
          <AreaPreferenceRow key={area} area={area} />
        ))}
      </SettingsSection>
    </div>
  );
}
