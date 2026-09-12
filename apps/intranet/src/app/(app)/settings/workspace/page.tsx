"use client";

import { useTranslations } from "next-intl";

import { DesignPreviewSettings } from "@/components/design/DesignPreviewSettings";
import { AppPreferencesCard } from "@/components/settings/AppPreferencesCard";
import { ConnectionsCard } from "@/components/settings/ConnectionsCard";
import { AppearancePicker, LanguagePicker } from "@/components/settings/PreferencePickers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useDesignPreview } from "@/lib/design-preview";

export default function SettingsWorkspacePage() {
  const t = useTranslations("Settings");
  const refreshed = useDesignPreview() === "refreshed";

  return (
    <>
      <DesignPreviewSettings />
      {/* Both chosen right here rather than behind the header's preferences
          menu: this is the page someone opens specifically to change them. */}
      {refreshed ? (
        <SettingsSection title={t("preferences")}>
          <SettingsRow title={t("language")} control={<LanguagePicker />} />
          <div className="px-4 py-4">
            <p className="text-[13.5px] font-medium">{t("appearance")}</p>
            <div className="mt-3.5 max-w-md">
              <AppearancePicker />
            </div>
          </div>
        </SettingsSection>
      ) : (
        <Card>
          <CardContent className="space-y-5 p-5">
            <p className="font-semibold tracking-tight">{t("preferences")}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t("language")}</p>
              <LanguagePicker />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("appearance")}</p>
              <div className="mt-3 max-w-md">
                <AppearancePicker />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <AppPreferencesCard refreshed={refreshed} />
      <ConnectionsCard refreshed={refreshed} />
    </>
  );
}
