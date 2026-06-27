"use client";

import { HelpCircle } from "lucide-react";

import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ActivityHelpPage() {
  const t = useTranslations("Activity");

  const sections = [
    { key: "states", title: t("nav.overview") },
    { key: "devices", title: t("nav.devices") },
    { key: "people", title: t("nav.people") },
  ] as const;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={t("title")}
        title={t("help.title")}
        icon={<HelpCircle />}
      />

      <p className="mb-4 text-sm text-muted-foreground">{t("help.intro")}</p>

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.overview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              {t("states.ACTIVE")} · {t("states.IN_CALL")} ·{" "}
              {t("states.WRAP_UP")} · {t("states.BREAK")} · {t("states.IDLE")} ·{" "}
              {t("states.ABSENT")}
            </p>
            <p>{t("overview.empty")}</p>
          </CardContent>
        </Card>

        {sections.slice(1).map(s => (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t(`${s.key}.empty`)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
