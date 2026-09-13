"use client";

import { useTranslations } from "next-intl";

import { AppPreferencesCard } from "@/components/settings/AppPreferencesCard";
import { ConnectionsCard } from "@/components/settings/ConnectionsCard";
import { AppearancePicker, LanguagePicker } from "@/components/settings/PreferencePickers";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";

export default function SettingsWorkspacePage() {
  const t = useTranslations("Settings");

  return (
    <>
      {/* Both chosen right here rather than behind the header's preferences
          menu: this is the page someone opens specifically to change them. */}
      <SettingsSection title={t("preferences")}>
        <SettingsRow title={t("language")} control={<LanguagePicker />} />
        <div className="px-4 py-4">
          <p className="text-[13.5px] font-medium">{t("appearance")}</p>
          <div className="mt-3.5 max-w-md">
            <AppearancePicker />
          </div>
        </div>
      </SettingsSection>
      <AppPreferencesCard />
      <ConnectionsCard />
    </>
  );
}
