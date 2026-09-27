"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  Hash,
  Megaphone,
  Pencil,
  Printer,
  Trash2,
  User,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  FeedbackWidget,
  GuidebookToc,
  ReadingProgress,
  RelatedGuidebooks,
} from "@/components/guidebooks/extras";
import { GermanOnlyNote } from "@/components/guidebooks/german-only-note";
import { GuidebookAttachments } from "@/components/guidebooks/GuidebookAttachments";
import { GuidebookPageView } from "@/components/guidebooks/GuidebookPageView";
import { GuidebookPrint } from "@/components/guidebooks/GuidebookPrint";
import {
  canAccessGuidebook,
  getGuidebook,
  guidebookDescription,
  guidebookTitle,
  type Guidebook,
} from "@/components/guidebooks/registry";
import { GuidebookPager, GuidebookSwitcher } from "@/components/guidebooks/switcher";
import { WikiFileLinkText } from "@/components/guidebooks/WikiFileLinkText";
import { Link } from "@/components/Link";
import { DocumentHeader } from "@/components/layout/DocumentHeader";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PrintRichText } from "@/components/print/PrintSheet";
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
import { useErrorHandler } from "@/hooks/use-error-handler";
import { parseBlocks } from "@/lib/guidebook-blocks";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isExpired, msToDateInput, needsReview } from "@/lib/wiki";

const EMPTY_SLUGS: string[] = [];

/**
 * Wikis double as "read this, something's changed" notices (a new flyer, new
 * credit rules, …). Confirmation is entirely manual — opening the page
 * records nothing on its own; only this explicit "yes, I read and
 * understood it" click does. Editors additionally see who has confirmed.
 */
function ReadConfirmation({
  slug,
  policyVersion,
}: {
  slug: string;
  /** Set for a policy: the version everyone has to have confirmed. */
  policyVersion: number | null;
}) {
  const t = useTranslations("Guidebooks");
  const locale = useLocale();
  const canManageWiki = useHasCapability("manage_guidebooks");
  const readSlugs = useQuery(api.guidebooks.reads.listMine) ?? EMPTY_SLUGS;
  const confirmers = useQuery(
    api.guidebooks.reads.listConfirmersForSlug,
    canManageWiki ? { slug } : "skip",
  );
  const markRead = useMutation(api.guidebooks.reads.markRead);
  const handleError = useErrorHandler();
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [showConfirmers, setShowConfirmers] = useState(false);
  const isRead = readSlugs.includes(slug) || justConfirmed;
  const mine = useQuery(api.guidebooks.reads.mineForSlug, policyVersion ? { slug } : "skip");
  // Confirmed before an editor asked everyone to confirm the policy again.
  const changed = !isRead && policyVersion !== null && !!mine && mine.version < policyVersion;
  const currentConfirmers =
    policyVersion === null ? confirmers : confirmers?.filter((c) => c.version >= policyVersion);

  async function onConfirm() {
    setJustConfirmed(true);
    try {
      await markRead({ slug });
      toast.success(t("readConfirmedToast"));
    } catch (e) {
      setJustConfirmed(false);
      handleError(e, t("readConfirmFailed"));
    }
  }

  return (
    <div className="mt-8 space-y-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isRead
            ? t("readConfirmedBody")
            : changed
              ? t("policyChangedBody")
              : policyVersion !== null
                ? t("policyConfirmBody")
                : t("readConfirmBody")}
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
            {currentConfirmers
              ? t("readConfirmersCount", { count: currentConfirmers.length })
              : t("readConfirmersLoading")}
          </button>
          {showConfirmers && confirmers && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {confirmers.length === 0 && <li>{t("readConfirmersEmpty")}</li>}
              {confirmers.map((c) => (
                <li key={c.userId} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {c.name}
                    {policyVersion !== null && c.version < policyVersion && (
                      <span className="text-warn"> · {t("policyOlderVersion")}</span>
                    )}
                  </span>
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

  const registered = getGuidebook(params.slug);
  // The built-in guides move into the wiki under the same slug
  // (migrations/moveGuidesToWiki). Once their wiki entry exists it wins;
  // until then — or for someone the entry's audience leaves out, who gets
  // the registry's own access check instead — the component is the fallback.
  // Interactive tools never move, so for those the registry always wins.
  const movable = registered?.category === "guide";
  const entry = useQuery(
    api.wiki.entries.get,
    registered && !movable ? "skip" : { slug: params.slug },
  );
  const staticGuidebook = movable && entry !== null ? undefined : registered;
  // A wiki entry with this slug supersedes any legacy page of the same slug
  // (post-migration) — only look up the legacy page once we know there's no
  // wiki entry.
  const legacyPage = useQuery(
    api.guidebooks.pages.get,
    registered || entry ? "skip" : { slug: params.slug },
  );
  // Loaded here (not just inside `GuidebookAttachments`) so `WikiFileLinkText`
  // can resolve inline file-link chips in the body — Convex dedupes this
  // against the identical query that component runs itself.
  const attachments = useQuery(
    api.guidebooks.attachments.list,
    entry ? { slug: entry.slug } : "skip",
  );
  const removeEntry = useMutation(api.wiki.entries.remove);
  const removePage = useMutation(api.guidebooks.pages.remove);
  const announceGuidebook = useMutation(api.announcements.announceGuidebook);
  const setPrefs = useMutation(api.people.preferences.setMine);

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
  // A live tool (a search, a lookup) has nothing to put on paper.
  const printable = !!guidebook && allowed && staticGuidebook?.category !== "interactive";

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
                  asChild
                >
                  <Link href={`/guidebooks/${entry!.slug}/compose`}>
                    <Pencil />
                  </Link>
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
            {printable && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("print")}
                className="text-muted-foreground"
                onClick={() => window.print()}
              >
                <Printer />
              </Button>
            )}
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
          {/* A guidebook is read, not operated: its title belongs in the page at
              reading size. The top bar just says which part of the app this is. */}
          <PageHeaderBar title={t("eyebrow")} />
          <DocumentHeader eyebrow={t("eyebrow")} title={title} description={description} />
          <div id="guidebook-content">
            {movable && <GermanOnlyNote />}
            {Component ? (
              <Component />
            ) : entry ? (
              <div className="space-y-5">
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {entry.tags.map((tag) => (
                      <Badge key={tag} variant="muted" className="font-normal">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
                  <div className="min-w-0 space-y-4">
                    <WikiFileLinkText
                      html={entry.erklaerung}
                      attachments={attachments}
                      className="text-sm leading-relaxed"
                    />
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
                  </div>
                  <aside className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm lg:sticky lg:top-20 lg:self-start">
                    <p className="text-xs text-muted-foreground font-medium normal-case tracking-normal">
                      {t("detailsSectionTitle")}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.categoryColor ?? "#77808A" }}
                      />
                      <span className="min-w-0 truncate font-medium">
                        {entry.categoryName ?? t("archiveChip")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">
                        {entry.ownerName ?? entry.authorName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="size-4 shrink-0" />
                      <span>
                        {formatIsoDate(msToDateInput(entry.validFrom), locale)} –{" "}
                        {formatIsoDate(msToDateInput(entry.validUntil), locale)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Hash className="size-4 shrink-0" />
                      <span>{t("versionMeta", { version: entry.version })}</span>
                    </div>
                    {isExpired(entry) ? (
                      <Badge variant="muted">{t("expiredBadge")}</Badge>
                    ) : (
                      needsReview(entry) && <Badge variant="warning">{t("reviewDueBadge")}</Badge>
                    )}
                  </aside>
                </div>
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
              <ReadConfirmation
                slug={guidebook.slug}
                policyVersion={entry?.policy ? (entry.policyVersion ?? 1) : null}
              />
              <FeedbackWidget slug={guidebook.slug} />
            </>
          )}
        </>
      )}

      {printable && (
        <GuidebookPrint slug={guidebook.slug} title={title} description={description} entry={entry}>
          {Component ? (
            <Component />
          ) : entry ? (
            <PrintRichText html={entry.erklaerung} />
          ) : legacyPage ? (
            <GuidebookPageView blocks={parseBlocks(legacyPage.blocks)} />
          ) : null}
        </GuidebookPrint>
      )}
    </div>
  );
}
