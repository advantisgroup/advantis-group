"use client";

import { useEffect } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { ArrowLeft, BookOpen, Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  FeedbackWidget,
  GuidebookToc,
  ReadingProgress,
  RelatedGuidebooks,
} from "@/components/guidebooks/extras";
import { canAccessGuidebook, getGuidebook } from "@/components/guidebooks/registry";
import { GuidebookPager, GuidebookSwitcher } from "@/components/guidebooks/switcher";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function GuidebookPage() {
  const t = useTranslations("Guidebooks");
  const params = useParams<{ slug: string }>();
  const user = useCurrentUser();
  const guidebook = getGuidebook(params.slug);
  const allowed = guidebook ? canAccessGuidebook(user, guidebook) : false;
  const Component = guidebook?.Component;
  const setPrefs = useMutation(api.userPreferences.setMine);

  // Remember the last opened guidebook for the list page's "continue" banner.
  useEffect(() => {
    if (guidebook && allowed) {
      void setPrefs({ lastGuidebookSlug: guidebook.slug });
    }
  }, [guidebook, allowed, setPrefs]);

  return (
    <div className={cn("mx-auto max-w-4xl", guidebook?.wide && "max-w-6xl")}>
      {guidebook && allowed && <ReadingProgress />}
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/guidebooks"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("title")}
        </Link>
        {guidebook && allowed && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("print")}
              className="text-muted-foreground"
              onClick={() => window.print()}
            >
              <Printer />
            </Button>
            <GuidebookSwitcher current={guidebook} />
          </div>
        )}
      </div>

      {!guidebook || !allowed || !Component ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <BookOpen className="size-6" />
            </span>
            <p className="text-sm font-medium">{guidebook ? t("noAccess") : t("notFound")}</p>
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
          <div id="guidebook-content">
            <Component />
          </div>
          {!guidebook.minimalChrome && (
            <>
              <GuidebookToc />
              <FeedbackWidget slug={guidebook.slug} />
              <RelatedGuidebooks current={guidebook} />
              <div className="print:hidden">
                <GuidebookPager current={guidebook} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
