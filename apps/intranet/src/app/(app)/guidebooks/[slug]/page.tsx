"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Megaphone,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { EntryDialog } from "@/components/guidebooks/WikiEntryDialogs";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import {
  isOwnerOrAdmin,
  useCurrentUser,
  useHasCapability,
  useIsManager,
} from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { RichText } from "@/components/ui/rich-text";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { parseBlocks } from "@/lib/guidebook-blocks";
import { formatIsoDate } from "@/lib/format";
import { msToDateInput } from "@/lib/wiki";

const EMPTY_SLUGS: string[] = [];

/**
 * Wikis double as "read this, something's changed" notices (a new flyer, new
 * credit rules, …), so opening the page shouldn't be the only signal —
 * this gives a visible, user-initiated confirmation alongside the silent
 * auto-mark-on-view.
 */
function ReadConfirmation({ slug }: { slug: string }) {
  const t = useTranslations("Guidebooks");
  const readSlugs = useQuery(api.guidebookReads.listMine) ?? EMPTY_SLUGS;
  const markRead = useMutation(api.guidebookReads.markRead);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const isRead = readSlugs.includes(slug) || justConfirmed;

  async function onConfirm() {
    setJustConfirmed(true);
    try {
      await markRead({ slug });
      toast.success(t("readConfirmedToast"));
    } catch {
      // The auto-mark-on-view already fires on every visit, so a failure
      // here just means the visible confirmation didn't record — no need to
      // roll back the optimistic checkmark over it.
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 print:hidden">
      <p className="text-sm text-muted-foreground">
        {isRead ? t("readConfirmedBody") : t("readConfirmBody")}
      </p>
      {isRead ? (
        <Badge variant="success">
          <Check className="mr-1 size-3.5" />
          {t("readConfirmedBadge")}
        </Badge>
      ) : (
        <Button size="sm" onClick={() => void onConfirm()}>
          <Check className="mr-1.5 size-3.5" />
          {t("readConfirmCta")}
        </Button>
      )}
    </div>
  );
}

export default function GuidebookPage() {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const user = useCurrentUser();
  const isManager = useIsManager();
  const canManageWiki = useHasCapability("manage_guidebooks");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const [editing, setEditing] = useState(false);

  const staticGuidebook = getGuidebook(params.slug);
  // Only look up wiki/legacy content when the slug isn't one of the
  // hardcoded registry ones — the static registry always wins on a collision.
  const entry = useQuery(api.wikiEntries.get, staticGuidebook ? "skip" : { slug: params.slug });
  // A wiki entry with this slug supersedes any legacy page of the same slug
  // (post-migration) — only look up the legacy page once we know there's no
  // wiki entry.
  const legacyPage = useQuery(
    api.guidebookPages.get,
    staticGuidebook || entry ? "skip" : { slug: params.slug },
  );
  const removeEntry = useMutation(api.wikiEntries.remove);
  const removePage = useMutation(api.guidebookPages.remove);
  const createAnnouncement = useMutation(api.announcements.create);
  const setPrefs = useMutation(api.userPreferences.setMine);
  const markRead = useMutation(api.guidebookReads.markRead);

  const loading = !staticGuidebook && entry === undefined && legacyPage === undefined;
  const guidebook = staticGuidebook
    ? { slug: staticGuidebook.slug, teams: staticGuidebook.teams, minRole: staticGuidebook.minRole }
    : entry
      ? { slug: entry.slug, teams: [], minRole: undefined }
      : legacyPage
        ? {
            slug: legacyPage.slug,
            teams: legacyPage.teams as Guidebook["teams"],
            minRole: legacyPage.minRole ?? undefined,
          }
        : null;
  const allowed = guidebook ? canAccessGuidebook(user, guidebook) : false;
  const Component = staticGuidebook?.Component;
  const canManageEntry = !!entry && canManageWiki && isOwnerOrAdmin(user, entry.authorUserId);
  const canManagePage =
    !!legacyPage && canManageWiki && isOwnerOrAdmin(user, legacyPage.authorUserId);

  const title = staticGuidebook
    ? guidebookTitle(staticGuidebook, t)
    : (entry?.thema ?? legacyPage?.title ?? "");
  const description = staticGuidebook
    ? guidebookDescription(staticGuidebook, t)
    : (entry?.categoryName ?? legacyPage?.description ?? "");

  // Remember the last opened guidebook for the list page's "continue" banner,
  // and record a read receipt for the unread checkmark/dashboard section.
  const guidebookSlug = guidebook?.slug;
  useEffect(() => {
    if (guidebookSlug && allowed) {
      void setPrefs({ lastGuidebookSlug: guidebookSlug });
      void markRead({ slug: guidebookSlug });
    }
  }, [guidebookSlug, allowed, setPrefs, markRead]);

  async function onDeleteEntry() {
    if (!entry) return;
    const ok = await confirm({
      title: t("deleteEntryConfirm"),
      description: tc("deleteWarning"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await removeEntry({ entryId: entry._id });
      toast.success(tc("delete"));
      router.push("/guidebooks");
    } catch (e) {
      handleError(e);
    }
  }

  async function onDeletePage() {
    if (!legacyPage) return;
    const ok = await confirm({
      title: t("deletePageConfirm"),
      description: tc("deleteWarning"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await removePage({ pageId: legacyPage._id });
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
    <div className="mx-auto max-w-4xl">
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
            {canManageEntry && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tc("edit")}
                  className="text-muted-foreground"
                  onClick={() => setEditing(true)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tc("delete")}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void onDeleteEntry()}
                >
                  <Trash2 />
                </Button>
              </>
            )}
            {canManagePage && (
              <>
                <Link href={`/guidebooks/${legacyPage!.slug}/edit`}>
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
          <PageHeader eyebrow={t("eyebrow")} title={title} description={description} />
          <div id="guidebook-content">
            {Component ? (
              <Component />
            ) : entry ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="muted" className="font-normal">
                      #{tag}
                    </Badge>
                  ))}
                </div>
                <RichText html={entry.erklaerung} className="text-sm leading-relaxed" />
                {entry.link && (
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block break-all text-sm font-medium text-primary hover:underline"
                  >
                    {entry.link}
                  </a>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 p-3.5 text-xs">
                  <dt className="text-muted-foreground">{t("fieldValidFrom")}</dt>
                  <dd className="font-medium">
                    {formatIsoDate(msToDateInput(entry.validFrom), locale)} –{" "}
                    {formatIsoDate(msToDateInput(entry.validUntil), locale)}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("versionMeta", { version: entry.version })}
                  </dt>
                  <dd className="font-medium">{entry.authorName}</dd>
                </dl>
              </div>
            ) : legacyPage ? (
              <GuidebookPageView blocks={parseBlocks(legacyPage.blocks)} />
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
            <>
              <GuidebookAttachments slug={guidebook.slug} />
              <ReadConfirmation slug={guidebook.slug} />
              <FeedbackWidget slug={guidebook.slug} />
            </>
          )}
        </>
      )}
      {entry && <EntryDialog entry={editing ? entry : null} onOpenChange={() => setEditing(false)} />}
    </div>
  );
}
