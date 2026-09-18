"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useConfirm } from "@/components/ui/dialog";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { Switch } from "@/components/ui/switch";

import { useSecurityState } from "./security-state";

type Area = "performance" | "applicant_vault";

const AREA_TITLE_KEY = {
  performance: "securityAreaPerformance",
  applicant_vault: "securityAreaApplicantVault",
} as const;

function useAreaPreference(area: Area) {
  const pref = useQuery(api.stepUp.areaPreference, { area });
  const setPref = useMutation(api.stepUp.setAreaPreference);
  return { pref, setPref };
}

function AreaPreferenceRow({
  area,
  pref,
  setPref,
}: {
  area: Area;
} & ReturnType<typeof useAreaPreference>) {
  const t = useTranslations("Settings");
  const [saving, setSaving] = useState(false);

  async function toggle(checked: boolean) {
    setSaving(true);
    try {
      await setPref({
        area,
        mode: checked ? "always_step_up" : "trust_device",
      });
    } catch {
      toast.error(t("securityPreferenceError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsRow
      title={t(AREA_TITLE_KEY[area])}
      description={t("securityAreaAlwaysStepUpHint")}
      control={
        <Switch
          checked={pref?.mode === "always_step_up"}
          disabled={pref === undefined || saving}
          onCheckedChange={(value) => void toggle(value)}
          aria-label={t(AREA_TITLE_KEY[area])}
        />
      }
    />
  );
}

export function SecurityPreferencesCard() {
  const t = useTranslations("Settings");
  const preference = useQuery(api.stepUp.securityPreference);
  const setPreference = useMutation(api.stepUp.setSecurityPreference);
  const confirm = useConfirm();
  const { passkeys } = useSecurityState();
  const performance = useAreaPreference("performance");
  const vault = useAreaPreference("applicant_vault");
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
    if (!checked) {
      const ok = await confirm({
        title: t("securityDeviceTrackingOffTitle"),
        description: t("securityDeviceTrackingOffBody"),
        confirmLabel: t("securityDeviceTrackingOffConfirm"),
        cancelLabel: t("cancel"),
      });
      if (!ok) return;
    }
    setSavingDeviceTracking(true);
    try {
      // The switch reads "remember my devices", so off means opting out.
      await setPreference({ deviceTrackingOptOut: !checked });
    } catch {
      toast.error(t("securityPreferenceError"));
    } finally {
      setSavingDeviceTracking(false);
    }
  }

  const checked = preference?.alwaysRequireMfaAtSignIn === true;
  const hasPasskey = (passkeys?.length ?? 0) > 0;
  const areas = [
    { area: "performance" as const, ...performance },
    { area: "applicant_vault" as const, ...vault },
  ].filter((entry) => entry.pref?.applies);

  return (
    <div id="security-preferences" data-hash-anchor className="space-y-4 refreshed:space-y-10">
      <SettingsSection title={t("securitySignIn")}>
        <SettingsRow
          title={t("securityAlwaysMfa")}
          description={
            checked && hasPasskey
              ? t("securityAlwaysMfaPasskeyWarning")
              : t("securityAlwaysMfaHint")
          }
          control={
            <Switch
              checked={checked}
              disabled={preference === undefined || saving}
              onCheckedChange={(value) => void toggle(value)}
              aria-label={t("securityAlwaysMfa")}
            />
          }
        />
        <SettingsRow
          title={t("securityDeviceTracking")}
          description={t("securityDeviceTrackingHint")}
          control={
            <Switch
              checked={preference?.deviceTrackingOptOut !== true}
              disabled={preference === undefined || savingDeviceTracking}
              onCheckedChange={(value) => void toggleDeviceTracking(value)}
              aria-label={t("securityDeviceTracking")}
            />
          }
        />
      </SettingsSection>
      {areas.length > 0 && (
        <SettingsSection title={t("securityAreaTitle")} description={t("securityAreaHint")}>
          {areas.map((entry) => (
            <AreaPreferenceRow key={entry.area} {...entry} />
          ))}
        </SettingsSection>
      )}
    </div>
  );
}
