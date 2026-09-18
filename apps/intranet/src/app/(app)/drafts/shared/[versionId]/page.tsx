"use client";

import { useMemo, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Eye, FileStack, GitBranch, PenLine, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { DraftComments } from "@/components/compose/DraftComments";
import { useRelativeTime } from "@/components/compose/use-relative-time";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RichText } from "@/components/ui/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { draftContent } from "@/lib/draft-preview";
import { DRAFT_SURFACES } from "@/lib/draft-surfaces";
import { initials } from "@/lib/format";

/** One draft version someone shared, read-only — the way a shared chat link
 *  reads: exactly what was shared, who it's from, and the conversation about it. */
export default function SharedDraftPage() {
  const t = useTranslations("Drafts");
  const tc = useTranslations("Compose");
  const locale = useLocale();
  const router = useRouter();
  const handleError = useErrorHandler();
  const { versionId } = useParams<{ versionId: string }>();
  const shared = useQuery(api.drafts.shares.get, { versionId });
  const continueFrom = useMutation(api.drafts.shares.continueFrom);
  const [copying, setCopying] = useState(false);
  const sharedAgo = useRelativeTime(shared?.sharedAt ?? null);
  const content = useMemo(() => (shared ? draftContent(shared.data) : null), [shared]);

  const header = (
    <PageHeaderBar title={t("sharedTitle")} description={t("sharedSubtitle")} icon={<Share2 />} />
  );

  if (shared === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <Skeleton className="h-10 w-2/3 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (shared === null || !content) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <EmptyState
          icon={<FileStack />}
          title={t("sharedGoneTitle")}
          description={t("sharedGoneBody")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/drafts">
                <ArrowLeft />
                {t("sharedBackToDrafts")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const surface = DRAFT_SURFACES[shared.surface];
  const SurfaceIcon = surface?.icon ?? FileStack;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(
    shared.savedAt,
  );
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(content.bodyRaw);

  async function copyToMine() {
    setCopying(true);
    try {
      router.push(await continueFrom({ versionId: shared!.versionId }));
    } catch (error) {
      handleError(error);
      setCopying(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-10">
      {header}

      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {shared.isOwner ? (
            <>
              <AvatarStack
                size="size-7"
                max={4}
                people={shared.recipients.map((person) => ({
                  id: person._id,
                  name: person.name,
                  avatar: person.avatar,
                }))}
              />
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                {shared.recipients.length > 0
                  ? t("sharedByYou", {
                      name: shared.recipients[0].name,
                      others: shared.recipients.length - 1,
                    })
                  : t("sharedByYouNobody")}
              </p>
              {shared.editHref && (
                <Button asChild size="sm" variant="outline">
                  <Link href={shared.editHref}>
                    <PenLine />
                    {t("sharedOpenEditor")}
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <>
              <Avatar className="size-7">
                {shared.owner?.avatar && (
                  <AvatarImage src={shared.owner.avatar} alt={shared.owner.name} />
                )}
                <AvatarFallback className="text-[10px]">
                  {initials(shared.owner?.name, shared.owner?.email)}
                </AvatarFallback>
              </Avatar>
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">{shared.owner?.name}</span>{" "}
                {t("sharedWithYou", { time: sharedAgo ?? "" })}
              </p>
              {shared.canContinue && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={copying}
                  onClick={() => void copyToMine()}
                >
                  <GitBranch />
                  {t("sharedContinue")}
                </Button>
              )}
            </>
          )}
        </div>

        <article className="rounded-2xl border border-border/70 bg-card">
          <header className="space-y-2 border-b border-border/60 px-6 pb-4 pt-5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <SurfaceIcon className="size-3.5" />
              {surface ? t(surface.labelKey) : shared.surface}
              <span aria-hidden>·</span>
              {shared.name ? `${shared.name} · ${when}` : t("sharedVersionFrom", { time: when })}
            </p>
            <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">
              {content.title || tc("draftsUntitled")}
            </h1>
          </header>
          <div className="px-6 py-5">
            {content.bodyRaw ? (
              looksLikeHtml ? (
                <RichText html={content.bodyRaw} className="text-[15px] leading-relaxed" />
              ) : (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{content.bodyRaw}</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">{t("sharedNoText")}</p>
            )}
          </div>
          <footer className="flex gap-2 border-t border-border/60 px-6 py-3 text-xs leading-relaxed text-muted-foreground">
            <Eye className="mt-0.5 size-3.5 shrink-0" />
            {shared.isOwner
              ? t("sharedReadOnlyOwner")
              : shared.canContinue
                ? t("sharedReadOnlyContinue", { name: shared.owner?.name ?? "" })
                : t("sharedReadOnly", { name: shared.owner?.name ?? "" })}
          </footer>
        </article>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("sharedComments")}</h2>
        <p className="-mt-2 text-xs text-muted-foreground">
          {shared.isOwner ? t("sharedCommentsHintOwner") : t("sharedCommentsHint")}
        </p>
        <DraftComments versionId={shared.versionId} />
      </section>
    </div>
  );
}
