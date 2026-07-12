"use client";

import { Bug } from "lucide-react";
import { useTranslations } from "next-intl";

import { ErrorFallback } from "@/components/ErrorFallback";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { NotFoundScreen } from "@/components/layout/NotFoundScreen";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";

/**
 * Live catalog of this app's full-page error states, for previewing them
 * without having to actually reproduce the condition (e.g. you can't easily
 * demote yourself out of admin to see the 403 page). Lives under `(app)`, so
 * it's gated the same as everything else: any provisioned intranet account,
 * no extra role check.
 *
 * `AccessDeniedScreen` (blocked email domain) is intentionally not listed
 * here — mounting it self-deletes the current account and signs out, so
 * there's no safe way to preview it live.
 */
export default function ErrorsCatalogPage() {
  const t = useTranslations("ErrorsCatalog");

  const entries = [
    {
      code: "403",
      name: t("forbidden"),
      render: () => <ForbiddenScreen className="min-h-[280px]" />,
    },
    {
      code: "404",
      name: t("notFound"),
      render: () => <NotFoundScreen className="min-h-[280px]" />,
    },
    {
      code: "500",
      name: t("boundary"),
      render: () => (
        <ErrorFallback onRetry={() => {}} className="min-h-[280px]" />
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("subtitle")}
        icon={<Bug />}
      />
      <div className="space-y-4">
        {entries.map(entry => (
          <Card key={entry.code} className="overflow-hidden">
            <div className="border-b border-border/60 px-4 py-2.5 text-sm font-medium">
              {entry.code} · {entry.name}
            </div>
            {entry.render()}
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("excludedNote")}</p>
    </div>
  );
}
