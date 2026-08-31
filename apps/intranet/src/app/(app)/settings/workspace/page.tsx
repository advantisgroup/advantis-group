"use client";

import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { AppPreferencesCard } from "@/components/settings/AppPreferencesCard";
import { ConnectionsCard } from "@/components/settings/ConnectionsCard";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsWorkspacePage() {
  const t = useTranslations("Settings");

  return (
    <>
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
      <AppPreferencesCard />
      <ConnectionsCard />
    </>
  );
}
