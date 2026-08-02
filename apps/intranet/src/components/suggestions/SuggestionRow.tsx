"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { ChevronDown, ChevronUp, Download, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/upload";

export interface SuggestionListItem {
  _id: Id<"suggestions">;
  authorUserId: Id<"users">;
  authorName: string;
  categoryId: Id<"suggestionCategories">;
  categoryName: string;
  title: string;
  explanation: string | null;
  link: string | null;
  attachments: {
    storageId: Id<"_storage">;
    kind: "image" | "file";
    name: string;
    size: number | null;
    contentType: string | null;
    url: string | null;
  }[];
  status: "open" | "in_discussion" | "implementing" | "closed";
  outcome: "withdrawn" | "not_possible" | "implemented" | null;
  createdAt: number;
  updatedAt: number | null;
}

const STATUS_VARIANT: Record<SuggestionListItem["status"], BadgeProps["variant"]> = {
  open: "outline",
  in_discussion: "warning",
  implementing: "warning",
  closed: "muted",
};

const OUTCOME_VARIANT: Record<NonNullable<SuggestionListItem["outcome"]>, BadgeProps["variant"]> = {
  withdrawn: "muted",
  not_possible: "destructive",
  implemented: "success",
};

const STATUSES: SuggestionListItem["status"][] = [
  "open",
  "in_discussion",
  "implementing",
  "closed",
];
const OUTCOMES: NonNullable<SuggestionListItem["outcome"]>[] = [
  "withdrawn",
  "not_possible",
  "implemented",
];
const NO_OUTCOME = "none";

export function SuggestionRow({
  suggestion,
  canModerate,
  onDelete,
}: {
  suggestion: SuggestionListItem;
  canModerate: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("Suggestions");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const update = useMutation(api.suggestions.update);
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const { openFileViewer } = useFileViewer();
  const tc = useTranslations("Common");

  async function onDeleteClick() {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: tc("deleteWarning"),
      details: [{ label: tc("fieldTitle"), value: suggestion.title }],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (ok) onDelete();
  }

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-12 items-center gap-2 px-4 py-3 text-left hover:bg-accent/50"
      >
        <div className="col-span-2 text-xs text-muted-foreground">
          {formatDateTime(suggestion.createdAt, locale)}
        </div>
        <div className="col-span-3 truncate text-sm font-medium">{suggestion.title}</div>
        <div className="col-span-2">
          <Badge variant="muted" className="max-w-full truncate font-normal">
            {suggestion.categoryName}
          </Badge>
        </div>
        <div className="col-span-5 flex flex-wrap items-center justify-end gap-1.5">
          <Badge variant={STATUS_VARIANT[suggestion.status]}>
            {t(`status_${suggestion.status}`)}
          </Badge>
          {suggestion.outcome && (
            <Badge variant={OUTCOME_VARIANT[suggestion.outcome]}>
              {t(`outcome_${suggestion.outcome}`)}
            </Badge>
          )}
          {open ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <div className="space-y-3 bg-muted/30 px-4 pb-4 pt-1 text-sm">
          <p className="text-xs text-muted-foreground">
            {t("submittedBy", {
              name: suggestion.authorName,
              date: formatDateTime(suggestion.createdAt, locale),
            })}
          </p>
          {suggestion.explanation && (
            <p className="whitespace-pre-wrap text-foreground/90">{suggestion.explanation}</p>
          )}
          {suggestion.link && (
            <a
              href={
                suggestion.link.startsWith("http") ? suggestion.link : `https://${suggestion.link}`
              }
              target="_blank"
              rel="noreferrer"
              className="block text-primary underline"
            >
              {suggestion.link}
            </a>
          )}
          {suggestion.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestion.attachments.map((a) => (
                <button
                  key={a.storageId}
                  type="button"
                  onClick={() =>
                    openFileViewer({
                      storageId: a.storageId,
                      name: a.name,
                      contentType: a.contentType ?? undefined,
                      size: a.size ?? undefined,
                      url: a.url ?? undefined,
                    })
                  }
                  className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1 text-xs hover:border-primary"
                >
                  <Download className="size-3" />
                  {a.name}
                  {a.size != null && (
                    <span className="text-muted-foreground">· {formatFileSize(a.size)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {canModerate && (
            <div className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-3">
              <label className="text-xs text-muted-foreground">
                {t("fieldStatus")}
                <Select
                  value={suggestion.status}
                  onValueChange={(v) =>
                    update({
                      suggestionId: suggestion._id,
                      status: v as SuggestionListItem["status"],
                    }).catch(handleError)
                  }
                >
                  <SelectTrigger className="mt-1 h-8 w-auto gap-1.5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`status_${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs text-muted-foreground">
                {t("fieldOutcome")}
                <Select
                  value={suggestion.outcome ?? NO_OUTCOME}
                  onValueChange={(v) =>
                    update({
                      suggestionId: suggestion._id,
                      outcome:
                        v === NO_OUTCOME ? null : (v as NonNullable<SuggestionListItem["outcome"]>),
                    }).catch(handleError)
                  }
                >
                  <SelectTrigger className="mt-1 h-8 w-auto gap-1.5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_OUTCOME}>{t("outcomeNone")}</SelectItem>
                    {OUTCOMES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {t(`outcome_${o}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-destructive hover:text-destructive"
                onClick={() => void onDeleteClick()}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                {t("delete")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
