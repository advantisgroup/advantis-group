import { type Id } from "@advantis/convex/dataModel";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleX,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

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
  decisionNote: string | null;
  createdAt: number;
  updatedAt: number | null;
}

export type SuggestionStatus = SuggestionListItem["status"];
export type SuggestionOutcome = NonNullable<SuggestionListItem["outcome"]>;

export const SUGGESTION_STATUSES: SuggestionStatus[] = [
  "open",
  "in_discussion",
  "implementing",
  "closed",
];
export const SUGGESTION_OUTCOMES: SuggestionOutcome[] = [
  "implemented",
  "not_possible",
  "withdrawn",
];

const STATUS_VISUAL: Record<SuggestionStatus, { accent: string; icon: LucideIcon }> = {
  open: { accent: "var(--warn)", icon: CircleDashed },
  in_discussion: { accent: "var(--info)", icon: MessagesSquare },
  implementing: { accent: "var(--signal)", icon: CircleDot },
  closed: { accent: "var(--muted-foreground)", icon: CircleMinus },
};

const OUTCOME_VISUAL: Record<SuggestionOutcome, { accent: string; icon: LucideIcon }> = {
  implemented: { accent: "var(--ok)", icon: CircleCheck },
  not_possible: { accent: "var(--destructive)", icon: CircleX },
  withdrawn: { accent: "var(--muted-foreground)", icon: CircleMinus },
};

/** Once an outcome is set it's the more specific news, so it's what the list
 * dot, the panel edge and the chip show instead of the bare status. */
export function suggestionState(suggestion: Pick<SuggestionListItem, "status" | "outcome">) {
  return suggestion.outcome
    ? {
        ...OUTCOME_VISUAL[suggestion.outcome],
        labelKey: `outcome_${suggestion.outcome}` as const,
      }
    : {
        ...STATUS_VISUAL[suggestion.status],
        labelKey: `status_${suggestion.status}` as const,
      };
}

export function SuggestionStateBadge({
  suggestion,
  className,
}: {
  suggestion: Pick<SuggestionListItem, "status" | "outcome">;
  className?: string;
}) {
  const t = useTranslations("Suggestions");
  const state = suggestionState(suggestion);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        className,
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: state.accent }} />
      {t(state.labelKey)}
    </span>
  );
}
