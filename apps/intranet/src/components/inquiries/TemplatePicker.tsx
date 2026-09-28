"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type TemplatePlaceholder, fillTemplate } from "@advantis/convex/marketing/inquiry";
import { useMutation, useQuery } from "convex/react";
import { FileText, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * "Templates" beside the reply box: pick one, and its text lands in the
 * reply with the customer's name, the reference and your own name filled in.
 * Templates in the customer's language come first.
 */
export function TemplatePicker({
  locale,
  values,
  onPick,
}: {
  /** The site language the inquiry came in. */
  locale: string | undefined;
  values: Partial<Record<TemplatePlaceholder, string | undefined>>;
  onPick: (text: string) => void;
}) {
  const t = useTranslations("Inquiries.templates");
  const templates = useQuery(api.marketing.templates.list, {});
  const markUsed = useMutation(api.marketing.templates.markUsed);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const lang = locale ?? "de";
    return (templates ?? [])
      .filter((template) => {
        const text = `${template.title} ${template.body}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      })
      .map((template) => ({
        template,
        // the customer's language first, then any-language ones, then the rest
        rank: template.locale === lang ? 0 : template.locale ? 2 : 1,
      }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ template }) => template);
  }, [templates, query, locale]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <FileText className="size-3.5" aria-hidden />
          {t("pick")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="h-8 text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter" && shown[0]) {
              event.preventDefault();
              pick(shown[0]);
            }
          }}
        />
        {templates === undefined ? null : shown.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {templates.length === 0 ? t("none") : t("noMatch")}
          </p>
        ) : (
          <ul className="mt-2 max-h-72 overflow-y-auto">
            {shown.map((template) => (
              <li key={template._id}>
                <button
                  type="button"
                  onClick={() => pick(template)}
                  className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="truncate">{template.title}</span>
                    {template.locale ? (
                      <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                        {template.locale}
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {template.body}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/inquiries/templates"
          className="mt-2 flex items-center gap-1.5 border-t border-border px-2 pt-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="size-3.5" aria-hidden />
          {t("manage")}
        </Link>
      </PopoverContent>
    </Popover>
  );

  function pick(template: NonNullable<typeof templates>[number]) {
    onPick(fillTemplate(template.body, values));
    void markUsed({ id: template._id });
    setOpen(false);
    setQuery("");
  }
}
