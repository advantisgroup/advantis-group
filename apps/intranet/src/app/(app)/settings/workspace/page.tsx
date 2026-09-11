"use client";

import { useTranslations } from "next-intl";

import { DesignPreviewSettings } from "@/components/design/DesignPreviewSettings";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { AppPreferencesCard } from "@/components/settings/AppPreferencesCard";
import { ConnectionsCard } from "@/components/settings/ConnectionsCard";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useDesignPreview } from "@/lib/design-preview";

export default function SettingsWorkspacePage() {
  const t = useTranslations("Settings");
  const refreshed = useDesignPreview() === "refreshed";

  return (
    <>
      <DesignPreviewSettings />
      {refreshed ? (
        <SettingsSection title={t("preferences")}>
          <SettingsRow
            title={`${t("language")} & ${t("theme")}`}
            control={
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background p-1">
                <SettingsMenu />
              </div>
            }
          />
        </SettingsSection>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <p className="font-semibold tracking-tight">{t("preferences")}</p>
              <p className="text-sm text-muted-foreground">
                {t("language")} &amp; {t("theme")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background p-1">
              <SettingsMenu />
            </div>
          </CardContent>
        </Card>
      )}
      <AppPreferencesCard refreshed={refreshed} />
      <ConnectionsCard refreshed={refreshed} />
    </>
  );
}
