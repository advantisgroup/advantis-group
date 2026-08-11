"use client";

import { type ReactNode } from "react";

import { ArrowLeft, BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  canAccessGuidebook,
  getGuidebook,
  guidebookDescription,
  guidebookTitle,
} from "@/components/guidebooks/registry";
import { AcademySessionProvider } from "@/components/guidebooks/wallbox-academy/session";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

/**
 * A real, navigable route tree for the academy (`/wallbox-sales-academy`,
 * `/training/<chapterId>`, `/admin/teilnehmer/<id>`, ...) instead of one
 * static guidebook page with everything switched by client-only state — so
 * every screen (admin, a chapter, a participant's detail, a specific
 * question) has an actual URL that survives a refresh, back/forward, and
 * sharing. Next.js matches this static segment before the generic
 * `/guidebooks/[slug]` route, so `[slug]/page.tsx` never handles this slug.
 */
export default function WallboxAcademyLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Guidebooks");
  const user = useCurrentUser();
  const guidebook = getGuidebook("wallbox-sales-academy");
  const allowed = guidebook ? canAccessGuidebook(user, guidebook) : false;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/guidebooks"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("title")}
        </Link>
      </div>

      {!guidebook || !allowed ? (
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
            title={guidebookTitle(guidebook, t)}
            description={guidebookDescription(guidebook, t)}
          />
          <AcademySessionProvider>{children}</AcademySessionProvider>
        </>
      )}
    </div>
  );
}
