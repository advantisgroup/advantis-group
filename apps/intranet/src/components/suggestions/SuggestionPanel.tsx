"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Ellipsis, ExternalLink, Link2, Paperclip, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AskButton } from "@/components/ai/AskButton";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { PersonLink } from "@/components/profile/PersonLink";
import {
  SUGGESTION_OUTCOMES,
  SUGGESTION_STATUSES,
  SuggestionStateBadge,
  suggestionState,
  type SuggestionListItem,
  type SuggestionOutcome,
  type SuggestionStatus,
} from "@/components/suggestions/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PropertyButton,
  SidePanel,
  SidePanelProperties,
  SidePanelSection,
  StatusChip,
} from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { copyPanelLink } from "@/hooks/use-panel-param";
import { formatDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/upload";

const NOTE_FIELD_ID = "suggestion-decision-note";

// The backend rejects closing or deciding without a note, so point at the
// field instead of letting the save fail with a generic error.
function needsNoteFirst(message: string) {
  toast.error(message);
  document.getElementById(NOTE_FIELD_ID)?.focus();
}

export function SuggestionPanel({
  suggestion,
  open,
  onOpenChange,
  canModerate,
  onDelete,
}: {
  suggestion: SuggestionListItem | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canModerate: boolean;
  onDelete: (suggestion: SuggestionListItem) => void;
}) {
  const tc = useTranslations("Common");
  // Holds the last suggestion so the panel keeps its content while animating closed.
  const [shown, setShown] = useState(suggestion);
  if (suggestion && suggestion !== shown) setShown(suggestion);

  return (
    <SidePanel
      open={open && !!shown}
      onOpenChange={onOpenChange}
      title={shown?.title ?? ""}
      accent={shown ? suggestionState(shown).accent : undefined}
      closeLabel={tc("close")}
      header={
        shown && (
          <SuggestionPanelHeader suggestion={shown} canModerate={canModerate} onDelete={onDelete} />
        )
      }
    >
      {shown && (
        <SuggestionPanelBody key={shown._id} suggestion={shown} canModerate={canModerate} />
      )}
    </SidePanel>
  );
}

function SuggestionPanelHeader({
  suggestion,
  canModerate,
  onDelete,
}: {
  suggestion: SuggestionListItem;
  canModerate: boolean;
  onDelete: (suggestion: SuggestionListItem) => void;
}) {
  const t = useTranslations("Suggestions");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const update = useMutation(api.suggestions.suggestions.update);
  const handleError = useErrorHandler();
  const state = suggestionState(suggestion);

  const date = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  function changeStatus(status: SuggestionStatus) {
    if (status === suggestion.status) return;
    if (status === "closed" && !suggestion.decisionNote) {
      needsNoteFirst(t("decisionNoteRequired"));
      return;
    }
    update({ suggestionId: suggestion._id, status })
      .then(() => toast.success(t("updated")))
      .catch(handleError);
  }

  function copyLink() {
    void copyPanelLink("/suggestions", suggestion._id).then(() => toast.success(t("linkCopied")));
  }

  const chip = (
    <StatusChip
      accent={state.accent}
      icon={state.icon}
      label={t(state.labelKey)}
      disabled={!canModerate}
    />
  );

  return (
    <div className="md:pr-9">
      <div className="flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{suggestion.categoryName}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <AskButton
            look="icon"
            subject={{ type: "suggestion", id: suggestion._id, label: suggestion.title }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={t("moreActions")}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyLink}>
                <Link2 />
                {t("copyLink")}
              </DropdownMenuItem>
              {canModerate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(suggestion)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 />
                    {tc("delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="mt-1.5 text-lg font-semibold leading-snug tracking-tight text-balance">
        {suggestion.title}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {canModerate ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{chip}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {SUGGESTION_STATUSES.map((status) => (
                <DropdownMenuItem key={status} onClick={() => changeStatus(status)}>
                  <SuggestionStateBadge suggestion={{ status, outcome: null }} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          chip
        )}
        <span className="text-xs text-muted-foreground">
          {suggestion.updatedAt
            ? t("updatedOn", { date: date(suggestion.updatedAt) })
            : t("submittedOn", { date: date(suggestion.createdAt) })}
        </span>
      </div>
    </div>
  );
}

function SuggestionPanelBody({
  suggestion,
  canModerate,
}: {
  suggestion: SuggestionListItem;
  canModerate: boolean;
}) {
  const t = useTranslations("Suggestions");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const update = useMutation(api.suggestions.suggestions.update);
  const handleError = useErrorHandler();
  const { openFileViewer } = useFileViewer();
  const [note, setNote] = useState(suggestion.decisionNote ?? "");

  const outcomeLabel = suggestion.outcome ? t(`outcome_${suggestion.outcome}`) : null;

  function changeOutcome(outcome: SuggestionOutcome | null) {
    if (outcome === suggestion.outcome) return;
    if (outcome && !suggestion.decisionNote) {
      needsNoteFirst(t("decisionNoteRequired"));
      return;
    }
    update({ suggestionId: suggestion._id, outcome })
      .then(() => toast.success(t("updated")))
      .catch(handleError);
  }

  function saveNote() {
    update({ suggestionId: suggestion._id, decisionNote: note.trim() || null })
      .then(() => toast.success(t("updated")))
      .catch(handleError);
  }

  const href = suggestion.link?.startsWith("http") ? suggestion.link : `https://${suggestion.link}`;

  const rows = [
    {
      label: t("columnSubmittedBy"),
      value: <PersonLink userId={suggestion.authorUserId}>{suggestion.authorName}</PersonLink>,
    },
    { label: t("field_category"), value: suggestion.categoryName },
    { label: t("columnDate"), value: formatDateTime(suggestion.createdAt, locale) },
    {
      label: t("fieldOutcome"),
      value: canModerate ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <PropertyButton>
              {suggestion.outcome ? (
                <SuggestionStateBadge suggestion={suggestion} className="text-sm" />
              ) : (
                <span className="text-muted-foreground">{t("outcomeNone")}</span>
              )}
            </PropertyButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SUGGESTION_OUTCOMES.map((outcome) => (
              <DropdownMenuItem key={outcome} onClick={() => changeOutcome(outcome)}>
                <SuggestionStateBadge suggestion={{ status: suggestion.status, outcome }} />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => changeOutcome(null)}>
              {t("outcomeNone")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        (outcomeLabel ?? <span className="text-muted-foreground">—</span>)
      ),
    },
    ...(suggestion.link
      ? [
          {
            label: t("link"),
            value: (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
              >
                <span className="truncate">{suggestion.link}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <SidePanelSection title={t("details")}>
        <SidePanelProperties rows={rows} />
      </SidePanelSection>

      {suggestion.explanation && (
        <SidePanelSection title={t("field_explanation")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{suggestion.explanation}</p>
        </SidePanelSection>
      )}

      {suggestion.attachments.length > 0 && (
        <SidePanelSection title={t("field_attachments")}>
          <div className="flex flex-wrap gap-2">
            {suggestion.attachments.map((attachment) => (
              <button
                key={attachment.storageId}
                type="button"
                onClick={() =>
                  openFileViewer({
                    storageId: attachment.storageId,
                    name: attachment.name,
                    contentType: attachment.contentType ?? undefined,
                    size: attachment.size ?? undefined,
                    url: attachment.url ?? undefined,
                  })
                }
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{attachment.name}</span>
                {attachment.size != null && (
                  <span className="shrink-0 text-muted-foreground">
                    {formatFileSize(attachment.size)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </SidePanelSection>
      )}

      {canModerate ? (
        <SidePanelSection
          title={t("decisionNote")}
          action={
            <Button
              variant="ghost"
              size="xs"
              disabled={note.trim() === (suggestion.decisionNote ?? "")}
              onClick={saveNote}
            >
              {tc("save")}
            </Button>
          }
        >
          <Textarea
            id={NOTE_FIELD_ID}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("decisionNotePlaceholder")}
            className="min-h-24 text-sm"
          />
        </SidePanelSection>
      ) : (
        suggestion.decisionNote && (
          <SidePanelSection title={t("decisionNote")}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{suggestion.decisionNote}</p>
          </SidePanelSection>
        )
      )}
    </>
  );
}
