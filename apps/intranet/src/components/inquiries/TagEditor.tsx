"use client";

import { useId, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { MAX_TAGS, normalizeTags } from "@advantis/convex/marketing/inquiry";
import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

/**
 * The team's labels on one inquiry. Enter or comma adds, × removes; the
 * suggestions are the tags already in use, so "pricing" doesn't also become
 * "prices". Nothing here reaches the customer.
 */
export function TagEditor({ id, tags }: { id: Id<"emails">; tags: string[] }) {
  const t = useTranslations("Inquiries.tags");
  const listId = useId();
  const suggestions = useQuery(api.marketing.inbox.tagSuggestions, {});
  const setTags = useMutation(api.marketing.inbox.setTags);
  const [draft, setDraft] = useState("");

  const save = async (next: string[]) => {
    try {
      await setTags({ id, tags: next });
    } catch {
      toast.error(t("failed"));
    }
  };

  const add = (value = draft) => {
    const [tag] = normalizeTags([value]);
    setDraft("");
    if (tag && !tags.includes(tag)) void save([...tags, tag]);
  };

  return (
    <div>
      {tags.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs"
            >
              {tag}
              <button
                type="button"
                aria-label={t("remove", { tag })}
                onClick={() => void save(tags.filter((other) => other !== tag))}
                className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {tags.length < MAX_TAGS ? (
        <>
          <Input
            value={draft}
            list={listId}
            onChange={(event) => {
              const value = event.target.value;
              // a comma finishes a tag, like Enter
              if (value.endsWith(",")) add(value.slice(0, -1));
              else setDraft(value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            onBlur={() => draft.trim() && add()}
            placeholder={t("placeholder")}
            aria-label={t("add")}
            className="mt-2 h-8 text-sm"
          />
          <datalist id={listId}>
            {suggestions
              ?.filter((entry) => !tags.includes(entry.tag))
              .map((entry) => (
                <option key={entry.tag} value={entry.tag} />
              ))}
          </datalist>
        </>
      ) : null}
    </div>
  );
}

/** The tags on a row in the list: small, quiet, after everything else. */
export function TagChips({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <>
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-muted px-1.5 py-px text-[11px]">
          {tag}
        </span>
      ))}
    </>
  );
}
