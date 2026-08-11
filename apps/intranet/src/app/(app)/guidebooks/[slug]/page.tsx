"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, BookOpen, Check, Megaphone, Pencil, Printer, Trash2 } from "lucide-react";
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
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { msToDateInput } from "@/lib/wiki";

const EMPTY_SLUGS: string[] = [];

/**
 * Wikis double as "read this, something's changed" notices (a new flyer, new
 * credit rules, …). Confirmation is entirely manual — opening the page
 * records nothing on its own; only this explicit "yes, I read and
 * understood it" click does. Editors additionally see who has confirmed.
 */
function ReadConfirmation({ slug }: { slug: string }) {
  const t = useTranslations("Guidebooks");
  const locale = useLocale();
  const canManageWiki = useHasCapability("manage_guidebooks");
  const readSlugs = useQuery(api.guidebookReads.listMine) ?? EMPTY_SLUGS;
  const confirmers = useQuery(
    api.guidebookReads.listConfirmersForSlug,
    canManageWiki ? { slug } : "skip",
  );
  const markRead = useMutation(api.guidebookReads.markRead);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [showConfirmers, setShowConfirmers] = useState(false);
  const isRead = readSlugs.includes(slug) || justConfirmed;

  async function onConfirm() {
    setJustConfirmed(true);
    try {
      await markRead({ slug });
      toast.success(t("readConfirmedToast"));
    } catch (e) {
      setJustConfirmed(false);
      toast.error(e instanceof Error ? e.message : t("readConfirmFailed"));
    }
  }

  return (
    <div className="mt-8 space-y-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
      {canManageWiki && (
        <div className="border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setShowConfirmers((v) => !v)}
            className="text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {confirmers
              ? t("readConfirmersCount", { count: confirmers.length })
              : t("readConfirmersLoading")}
          </button>
          {showConfirmers && confirmers && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {confirmers.length === 0 && <li>{t("readConfirmersEmpty")}</li>}
              {confirmers.map((c) => (
                <li key={c.userId} className="flex items-center justify-between gap-3">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0">{formatDateTime(c.readAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
  const announceGuidebook = useMutation(api.announcements.announceGuidebook);
  const setPrefs = useMutation(api.userPreferences.setMine);

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

  // Remember the last opened guidebook for the list page's "continue"
  // banner. The read receipt itself is manual now (see `ReadConfirmation`
  // below) — opening the page no longer marks it read on its own.
  const guidebookSlug = guidebook?.slug;
  useEffect(() => {
    if (guidebookSlug && allowed) {
      void setPrefs({ lastGuidebookSlug: guidebookSlug });
    }
  }, [guidebookSlug, allowed, setPrefs]);

  async function onDeleteEntry() {
    if (!entry) return;
    const ok = await confirm({
      title: t("deleteEntryConfirm"),
      description: tc("deleteWarning"),
      details: [
        { label: t("fieldThema"), value: entry.thema },
        ...(entry.categoryName ? [{ label: t("fieldCategory"), value: entry.categoryName }] : []),
        { label: t("versionMeta", { version: entry.version }), value: entry.authorName },
      ],
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
      details: [{ label: t("fieldThema"), value: legacyPage.title }],
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
      destructive: false,
    });
    if (!ok) return;
    try {
      await announceGuidebook({
        guideTitle: title,
        guideDescription: description || undefined,
        guideSlug: guidebook.slug,
        locale: locale === "de" ? "de" : "en",
      });
      toast.success(t("announcementSent"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className={cn("mx-auto", staticGuidebook?.wide ? "max-w-6xl" : "max-w-4xl")}>
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
      {entry && (
        <EntryDialog entry={editing ? entry : null} onOpenChange={() => setEditing(false)} />
      )}
    </div>
  );
}
