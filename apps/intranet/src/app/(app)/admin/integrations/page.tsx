"use client";

import { Plug } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Hub for third-party account management. The Clockodo user admin lived here
 * until the own Zeiterfassung replaced it (09.10.2026); the next integration
 * (e.g. Genesys user management) gets a card here again.
 */
export default function IntegrationsHubPage() {
  const t = useTranslations("Integrations");

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeaderBar title={t("hubTitle")} description={t("hubSubtitle")} icon={<Plug />} />
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{t("hubEmpty")}</CardContent>
      </Card>
    </section>
  );
}
