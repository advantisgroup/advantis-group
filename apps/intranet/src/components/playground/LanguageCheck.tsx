"use client";

import { Lightbulb, Plus } from "lucide-react";
import { NextIntlClientProvider, useTranslations } from "next-intl";

import { PhoneFrame } from "@/components/playground/PhoneFrame";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { Switch } from "@/components/ui/switch";
import de from "@/i18n/messages/de/Playground.json";
import en from "@/i18n/messages/en/Playground.json";

/** A few real components with real copy — German runs longer, so this is
 *  where a label that wraps or clips shows up first. */
function Sample() {
  const t = useTranslations("Playground");
  return (
    <div className="space-y-4 p-4">
      <CountTabs
        value="all"
        onChange={() => undefined}
        tabs={[
          { value: "all", label: t("components.filters.all"), count: 6 },
          { value: "open", label: t("components.filters.status.open"), count: 3 },
          { value: "waiting", label: t("components.filters.status.waiting"), count: 1 },
          { value: "done", label: t("components.filters.status.done"), count: 2 },
        ]}
      />
      <KpiStrip>
        <Kpi label={t("components.kpis.people")} value={46} featured />
        <Kpi label={t("components.kpis.absences")} value={3} />
      </KpiStrip>
      <SettingsSection title={t("components.settings.title")}>
        <SettingsRow
          title={t("components.settings.digest.title")}
          description={t("components.settings.digest.hint")}
          control={<Switch defaultChecked />}
        />
      </SettingsSection>
      <EmptyState
        icon={<Lightbulb />}
        title={t("components.empty.emptyTitle")}
        description={t("components.empty.emptyHint")}
        action={
          <Button size="sm">
            <Plus />
            {t("components.empty.add")}
          </Button>
        }
      />
    </div>
  );
}

export function LanguageCheck() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {(
        [
          ["en", en],
          ["de", de],
        ] as const
      ).map(([locale, messages]) => (
        <NextIntlClientProvider
          key={locale}
          locale={locale}
          messages={{ Playground: messages }}
          timeZone="Europe/Berlin"
        >
          <PhoneFrame label={locale === "en" ? "English · 375px" : "Deutsch · 375px"}>
            <Sample />
          </PhoneFrame>
        </NextIntlClientProvider>
      ))}
    </div>
  );
}
