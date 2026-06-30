"use client";

import { BookOpen, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { accessibleGuidebooks } from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

export default function GuidebooksPage() {
  const t = useTranslations("Guidebooks");
  const user = useCurrentUser();
  const guidebooks = accessibleGuidebooks(user);

  return (
    <div className="mx-auto max-w-3xl" data-tour="tour-guidebooks-list">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("subtitle")}
      />

      {guidebooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <BookOpen className="size-6" />
            </span>
            <p className="text-sm font-medium">{t("empty")}</p>
            <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {guidebooks.map(gb => {
            const Icon = gb.icon;
            return (
              <Link key={gb.slug} href={`/guidebooks/${gb.slug}`}>
                <Card className="group h-full transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-20px_rgb(0_0_0/0.18)]">
                  <CardContent className="flex h-full items-start gap-3 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold tracking-tight">
                        {t(gb.titleKey)}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {t(gb.descriptionKey)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
