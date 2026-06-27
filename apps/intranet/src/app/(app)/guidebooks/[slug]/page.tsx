"use client";

import { ArrowLeft, BookOpen } from "lucide-react";

import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";

import {
  canAccessGuidebook,
  getGuidebook,
} from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

export default function GuidebookPage() {
  const t = useTranslations("Guidebooks");
  const params = useParams<{ slug: string }>();
  const user = useCurrentUser();
  const guidebook = getGuidebook(params.slug);
  const allowed = guidebook ? canAccessGuidebook(user, guidebook) : false;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/guidebooks"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>

      {!guidebook || !allowed ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <BookOpen className="size-6" />
            </span>
            <p className="text-sm font-medium">
              {guidebook ? t("noAccess") : t("notFound")}
            </p>
            <p className="text-xs text-muted-foreground">
              {guidebook ? t("noAccessHint") : t("notFoundHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <PageHeader
            eyebrow={t("eyebrow")}
            title={t(guidebook.titleKey)}
            description={t(guidebook.descriptionKey)}
          />
          <guidebook.Component />
        </>
      )}
    </div>
  );
}
