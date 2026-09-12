"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  Building2,
  FileStack,
  Lightbulb,
  Megaphone,
  Newspaper,
  Rss,
  Trash2,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRelativeTime } from "@/components/compose/DraftIndicator";
import { type DraftSurface } from "@/components/compose/use-draft";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { htmlToText } from "@/components/ui/rich-text";
import { useErrorHandler } from "@/hooks/use-error-handler";

type DraftItem = NonNullable<ReturnType<typeof useQuery<typeof api.drafts.listMine>>>[number];

const SURFACE_META: Partial<Record<DraftSurface, { icon: LucideIcon; labelKey: string }>> = {
  wikiEntry: { icon: BookOpen, labelKey: "surfaceWikiEntry" },
  guidebookPage: { icon: BookOpen, labelKey: "surfaceGuidebookPage" },
  blogPost: { icon: Newspaper, labelKey: "surfaceBlogPost" },
  announcement: { icon: Megaphone, labelKey: "surfaceAnnouncement" },
  update: { icon: Rss, labelKey: "surfaceUpdate" },
  suggestion: { icon: Lightbulb, labelKey: "surfaceSuggestion" },
  itTicket: { icon: Wrench, labelKey: "surfaceItTicket" },
  coachWiki: { icon: Zap, labelKey: "surfaceCoachWiki" },
  salesCockpitProject: { icon: Building2, labelKey: "surfaceSalesCockpitProject" },
};

const MAX_TITLE_CHARS = 80;
// Checked in order — "thema" covers wiki entries, the rest are best-effort
// guesses for surfaces that don't have their own composer's title field yet.
const TITLE_FIELDS = ["thema", "title", "subject", "name"] as const;

/**
 * Best-effort one-line preview of a draft's content, from its opaque JSON
 * blob — the shape is entirely up to whichever composer wrote it, so this is
 * the one place that has to guess. Falls back to "Untitled draft" (via the
 * caller) when nothing recognizable is found.
 */
function draftTitle(surface: DraftSurface, data: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return "";
  }
  if (typeof parsed !== "object" || parsed === null) return "";
  const fields = surface === "wikiEntry" ? TITLE_FIELDS : TITLE_FIELDS.slice(1);
  const raw = fields
    .map((field) => (parsed as Record<string, unknown>)[field])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!raw) return "";
  const text = htmlToText(raw).trim();
  return text.length > MAX_TITLE_CHARS ? `${text.slice(0, MAX_TITLE_CHARS).trimEnd()}…` : text;
}

function resumeHref(draft: DraftItem): string {
  if (draft.surface === "wikiEntry" && draft.subjectKey === draft._id) {
    return `/guidebooks/draft/${draft._id}`;
  }
  if (draft.surface === "wikiEntry") return `/guidebooks/${draft.subjectKey}/compose`;
  return "/guidebooks";
}

function DraftRow({ draft }: { draft: DraftItem }) {
  const t = useTranslations("Drafts");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const discard = useMutation(api.drafts.discard);
  const ago = useRelativeTime(draft.updatedAt);
  const meta = SURFACE_META[draft.surface];
  const Icon = meta?.icon ?? FileStack;
  const title = draftTitle(draft.surface, draft.data) || t("untitled");

  async function onDelete() {
    const ok = await confirm({ title: t("deleteConfirmTitle"), description: t("deleteConfirmBody") });
    if (!ok) return;
    try {
      await discard({ surface: draft.surface, subjectKey: draft.subjectKey });
      toast.success(t("deleted"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <Link href={resumeHref(draft)} className="min-w-0 flex-1 group">
        <p className="truncate text-sm font-medium group-hover:underline">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {meta ? t(meta.labelKey) : draft.surface} · {t("updated", { time: ago ?? "" })}
        </p>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("deleteConfirmTitle")}
        onClick={() => void onDelete()}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export default function DraftsPage() {
  const t = useTranslations("Drafts");
  const drafts = useQuery(api.drafts.listMine);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeaderBar title={t("title")} description={t("subtitle")} />
      {drafts === undefined ? null : drafts.length === 0 ? (
        <EmptyState icon={<FileStack className="size-6" />} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <div className="divide-y divide-border/60">
          {drafts.map((draft) => (
            <DraftRow key={draft._id} draft={draft} />
          ))}
        </div>
      )}
    </div>
  );
}
