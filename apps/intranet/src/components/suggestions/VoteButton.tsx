"use client";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SuggestionListItem } from "@/components/suggestions/shared";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

export function VoteButton({
  suggestion,
  className,
}: {
  suggestion: SuggestionListItem;
  className?: string;
}) {
  const t = useTranslations("Suggestions");
  const handleError = useErrorHandler();
  const toggle = useMutation(api.suggestions.suggestions.toggleVote).withOptimisticUpdate(
    (store, args) => {
      const list = store.getQuery(api.suggestions.suggestions.list, {});
      if (!list) return;
      store.setQuery(
        api.suggestions.suggestions.list,
        {},
        list.map((s) =>
          s._id === args.suggestionId
            ? {
                ...s,
                votedByMe: !s.votedByMe,
                voteCount: s.voteCount + (s.votedByMe ? -1 : 1),
              }
            : s,
        ),
      );
    },
  );

  return (
    <button
      type="button"
      aria-pressed={suggestion.votedByMe}
      aria-label={suggestion.votedByMe ? t("unvote") : t("vote")}
      onClick={(event) => {
        event.stopPropagation();
        toggle({ suggestionId: suggestion._id }).catch(handleError);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn(
        "flex w-11 shrink-0 flex-col items-center rounded-lg border py-1 text-xs font-medium tabular-nums transition-colors",
        suggestion.votedByMe
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
        className,
      )}
    >
      <ChevronUp className="size-3.5" />
      {suggestion.voteCount}
    </button>
  );
}
