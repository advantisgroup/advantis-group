"use client";

import { useMemo } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { FileStack, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRelativeTime } from "@/components/compose/use-relative-time";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { draftPreview } from "@/lib/draft-preview";
import { DRAFT_SURFACES } from "@/lib/draft-surfaces";
import { initials } from "@/lib/format";

type DraftItem = NonNullable<
  ReturnType<typeof useQuery<typeof api.drafts.drafts.listMine>>
>[number];
type SharedItem = NonNullable<
  ReturnType<typeof useQuery<typeof api.drafts.shares.listSharedWithMe>>
>[number];

function SharedRow({ item }: { item: SharedItem }) {
  const t = useTranslations("Drafts");
  const ago = useRelativeTime(item.sharedAt);
  const meta = DRAFT_SURFACES[item.surface];
  const { title, snippet } = draftPreview(item.data);
  return (
    <Link
      href={`/drafts/shared/${item.versionId}`}
      className="flex items-start gap-3 border-b border-border/60 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-accent/50"
    >
      <Avatar className="size-9">
        {item.owner.avatar && <AvatarImage src={item.owner.avatar} alt={item.owner.name} />}
        <AvatarFallback className="text-xs">
          {initials(item.owner.name, item.owner.email)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span
          className={
            title
              ? "block truncate text-[13.5px] font-medium leading-snug"
              : "block truncate text-[13.5px] leading-snug text-muted-foreground"
          }
        >
          {title || t("untitled")}
        </span>
        {snippet && (
          <span className="mt-0.5 line-clamp-1 block text-[12.5px] text-muted-foreground">
            {snippet}
          </span>
        )}
        <span className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span>{t("sharedBy", { name: item.owner.name })}</span>
          <span aria-hidden>·</span>
          <span>{meta ? t(meta.labelKey) : item.surface}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{ago}</span>
        </span>
      </span>
    </Link>
  );
}

const BUCKETS = [
  { key: "today", labelKey: "groupToday" },
  { key: "week", labelKey: "groupThisWeek" },
  { key: "earlier", labelKey: "groupEarlier" },
] as const;

function bucketOf(updatedAt: number, now: number): (typeof BUCKETS)[number]["key"] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (updatedAt >= startOfToday) return "today";
  if (updatedAt >= startOfToday - 6 * 86_400_000) return "week";
  return "earlier";
}

function DraftRow({ draft }: { draft: DraftItem }) {
  const t = useTranslations("Drafts");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const discard = useMutation(api.drafts.drafts.discard);
  const resume = useMutation(api.drafts.drafts.resume);
  const router = useRouter();
  const ago = useRelativeTime(draft.updatedAt);
  const meta = DRAFT_SURFACES[draft.surface];
  const Icon = meta?.icon ?? FileStack;
  const { title, snippet } = draftPreview(draft.data);
  // A fresh draft is its own subject (or "new", for the quick dialogs that
  // keep one unsent form); anything else is unsaved edits on something that exists.
  const editing = draft.subjectKey !== draft._id && draft.subjectKey !== "new";

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmBody"),
    });
    if (!ok) return;
    try {
      await discard({ surface: draft.surface, subjectKey: draft.subjectKey });
      toast.success(t("deleted"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="group flex items-start gap-3 border-b border-border/60 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-accent/50">
      <Link
        href={draft.href ?? meta?.listHref ?? "/"}
        onClick={(event) => {
          // A set-aside draft has to be swapped back into its form before
          // that page can show it.
          if (!draft.parkedFrom) return;
          event.preventDefault();
          resume({ surface: draft.surface, subjectKey: draft.parkedFrom, draftId: draft._id })
            .then(() => router.push(draft.href ?? meta?.listHref ?? "/"))
            .catch(handleError);
        }}
        className="flex min-w-0 flex-1 items-start gap-3"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/70 text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={
                title
                  ? "truncate text-[13.5px] font-medium leading-snug"
                  : "truncate text-[13.5px] leading-snug text-muted-foreground"
              }
            >
              {title || t("untitled")}
            </span>
            {editing && (
              <span className="shrink-0 text-[12px] text-muted-foreground">
                {t("stateEditing")}
              </span>
            )}
          </span>
          {snippet && (
            <span className="mt-0.5 line-clamp-1 block text-[12.5px] text-muted-foreground">
              {snippet}
            </span>
          )}
          <span className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span>{meta ? t(meta.labelKey) : draft.surface}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{ago}</span>
          </span>
        </span>
      </Link>
      {/* Hover-revealed on desktop so it doesn't compete with the content; always there on touch. */}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("deleteConfirmTitle")}
        onClick={() => void onDelete()}
        className="shrink-0 text-muted-foreground transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export default function DraftsPage() {
  const t = useTranslations("Drafts");
  const drafts = useQuery(api.drafts.drafts.listMine);
  const shared = useQuery(api.drafts.shares.listSharedWithMe);

  const groups = useMemo(() => {
    if (!drafts) return [];
    const now = Date.now();
    return BUCKETS.map((bucket) => ({
      ...bucket,
      rows: drafts.filter((d) => bucketOf(d.updatedAt, now) === bucket.key),
    })).filter((group) => group.rows.length > 0);
  }, [drafts]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeaderBar title={t("title")} description={t("subtitle")} icon={<FileStack />} />

      {shared && shared.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium text-muted-foreground">
            {t("sharedWithYouGroup")}
            <span className="ml-1.5 tabular-nums text-muted-foreground/70">{shared.length}</span>
          </h2>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            {shared.map((item) => (
              <SharedRow key={item.versionId} item={item} />
            ))}
          </div>
        </section>
      )}

      {drafts === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-[4.5rem] rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={<FileStack />} title={t("empty")} description={t("emptyHint")} />
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h2 className="px-1 text-xs font-medium text-muted-foreground">
              {t(group.labelKey)}
              <span className="ml-1.5 tabular-nums text-muted-foreground/70">
                {group.rows.length}
              </span>
            </h2>
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              {group.rows.map((draft) => (
                <DraftRow key={draft._id} draft={draft} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
