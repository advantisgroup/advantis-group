"use client";

import { Plug } from "lucide-react";
import { useTranslations } from "next-intl";

import { Mark } from "@/components/branding/ProviderMark";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One entry per provider. Adding the next integration (e.g. Genesys user
 * management) is a one-entry addition here, not new plumbing.
 */
const INTEGRATIONS = [
  {
    id: "clockodo",
    provider: "clockodo",
    nameKey: "clockodoCard",
    descriptionKey: "clockodoCardDescription",
    href: "/admin/integrations/clockodo",
  },
] as const;

export default function IntegrationsHubPage() {
  const t = useTranslations("Integrations");

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t("hubTitle")}
        description={t("hubSubtitle")}
        icon={<Plug />}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map(integration => (
          <Link key={integration.id} href={integration.href}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="space-y-1.5 p-4">
                <h2 className="flex items-center gap-2 font-medium text-fg">
                  <Mark provider={integration.provider} className="h-5 w-5" />
                  {t(integration.nameKey)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t(integration.descriptionKey)}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
