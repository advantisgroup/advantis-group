"use client";

import { useEffect } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, BookOpen, Megaphone, Pencil, Printer, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  FeedbackWidget,
  GuidebookToc,
  ReadingProgress,
  RelatedGuidebooks,
} from "@/components/guidebooks/extras";
import { GuidebookAttachments } from "@/components/guidebooks/GuidebookAttachments";
import { GuidebookPageView } from "@/components/guidebooks/GuidebookPageView";
import {
  canAccessGuidebook,
  getGuidebook,
  guidebookDescription,
  guidebookTitle,
  type Guidebook,
} from "@/components/guidebooks/registry";
import { GuidebookPager, GuidebookSwitcher } from "@/components/guidebooks/switcher";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { isOwnerOrAdmin, useCurrentUser, useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { parseBlocks } from "@/lib/guidebook-blocks";
import { cn } from "@/lib/utils";

export default function GuidebookPage() {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const user = useCurrentUser();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const staticGuidebook = getGuidebook(params.slug);
  // Only look up a custom (DB-backed) page when the slug isn't one of the
  // hardcoded ones — the static registry always wins on a collision.
  const customPage = useQuery(
    api.guidebookPages.get,
    staticGuidebook ? "skip" : { slug: params.slug },
  );
  const removePage = useMutation(api.guidebookPages.remove);
  const createAnnouncement = useMutation(api.announcements.create);
  const setPrefs = useMutation(api.userPreferences.setMine);

  const loading = !staticGuidebook && customPage === undefined;
  const custom: Guidebook | null = customPage
    ? {
        slug: customPage.slug,
        title: customPage.title,
        description: customPage.description,
        custom: true,
        icon: BookOpen,
        category: "guide",
        topic: customPage.topic as Guidebook["topic"],
        minRole: customPage.minRole ?? undefined,
        teams: customPage.teams as Guidebook["teams"],
      }
    : null;
  const guidebook = staticGuidebook ?? custom;
  const allowed = guidebook ? canAccessGuidebook(user, guidebook) : false;
  const Component = staticGuidebook?.Component;
  const canManagePage = !!customPage && isOwnerOrAdmin(user, customPage.authorUserId);

  // Remember the last opened guidebook for the list page's "continue" banner.
  useEffect(() => {
    if (guidebook && allowed) {
      void setPrefs({ lastGuidebookSlug: guidebook.slug });
    }
  }, [guidebook, allowed, setPrefs]);

  async function onDeletePage() {
    if (!customPage) return;
    const ok = await confirm({
      title: t("deletePageConfirm"),
      description: tc("deleteWarning"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await removePage({ pageId: customPage._id });
      toast.success(tc("delete"));
      router.push("/guidebooks");
    } catch (e) {
      handleError(e);
    }
  }

  async function onAnnounce() {
    if (!guidebook) return;
    const ok = await confirm({
      title: t("shareConfirmTitle"),
      description: t("shareConfirmDescription"),
      confirmLabel: t("shareAsAnnouncement"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      const title = guidebookTitle(guidebook, t);
      const description = guidebookDescription(guidebook, t);
      await createAnnouncement({
        title: t("announcementTitle", { title }),
        body: `<p>${t("announcementBody", { title, description })}</p><p><a href="/guidebooks/${guidebook.slug}">${title}</a></p>`,
        audience: { kind: "all" },
        category: t("title"),
      });
      toast.success(t("announcementSent"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className={cn("mx-auto max-w-4xl", staticGuidebook?.wide && "max-w-6xl")}>
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
          <div className="flex items-center gap-1">
            {isManager && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("shareAsAnnouncement")}
                className="text-muted-foreground"
                onClick={() => void onAnnounce()}
              >
                <Megaphone />
              </Button>
            )}
            {canManagePage && (
              <>
                <Link href={`/guidebooks/${guidebook.slug}/edit`}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tc("edit")}
                    className="text-muted-foreground"
                  >
                    <Pencil />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tc("delete")}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void onDeletePage()}
                >
                  <Trash2 />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("print")}
              className="text-muted-foreground"
              onClick={() => window.print()}
            >
              <Printer />
            </Button>
            {staticGuidebook && <GuidebookSwitcher current={staticGuidebook} />}
          </div>
        )}
      </div>

      {loading ? null : !guidebook || !allowed ? (
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
          <div id="guidebook-content">
            {Component ? (
              <Component />
            ) : customPage ? (
              <GuidebookPageView blocks={parseBlocks(customPage.blocks)} />
            ) : null}
          </div>
          {staticGuidebook ? (
            !staticGuidebook.minimalChrome && (
              <>
                <GuidebookToc />
                <GuidebookAttachments slug={staticGuidebook.slug} />
                <FeedbackWidget slug={guidebook.slug} />
                <RelatedGuidebooks current={staticGuidebook} />
                <div className="print:hidden">
                  <GuidebookPager current={staticGuidebook} />
                </div>
              </>
            )
          ) : (
            <FeedbackWidget slug={guidebook.slug} />
          )}
        </>
      )}
    </div>
  );
}
