"use client";

import { useState } from "react";

import { ChevronDown, HelpCircle, Search } from "lucide-react";

import { BrandedText } from "@/components/branding/ProviderMark";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FAQ_SECTIONS } from "@/lib/activity/faq";
import { useI18n } from "@/lib/activity/i18n";
import { useSlashFocus } from "@/hooks/use-slash-focus";

/**
 * In-app Help / FAQ. Common errors and "how do I…" questions in plain language,
 * keyed by the same vocabulary the status tooltips use, so a non-technical admin
 * can self-serve instead of paging the developer.
 */
export default function HelpPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();
  const needle = query.trim().toLowerCase();

  const sections = FAQ_SECTIONS.map((s) => ({
    id: s.id,
    entries: s.entries.filter((e) => {
      if (!needle) return true;
      return `${t(`faq.q.${e.id}`)} ${t(`faq.a.${e.id}`)}`.toLowerCase().includes(needle);
    }),
  })).filter((s) => s.entries.length > 0);

  return (
    <section className="space-y-6">
      <PageHeader title={t("help.title")} description={t("help.subtitle")} icon={<HelpCircle />} />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("help.search")}
          className="pl-9"
        />
      </div>

      {sections.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState inline title={t("help.noResults")} />
        </Card>
      ) : (
        sections.map((s) => (
          <div key={s.id} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`faq.section.${s.id}`)}
            </h3>
            <div className="space-y-2">
              {s.entries.map((e) => (
                <Card key={e.id} className="overflow-hidden">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-fg transition-colors hover:bg-panel-2">
                      <span className="flex items-center gap-2.5">
                        <BrandedText text={t(`faq.q.${e.id}`)} />
                        <Badge variant="muted" className="shrink-0 font-normal">
                          {t(`faq.scope.${e.scope}`)}
                        </Badge>
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                      />
                    </summary>
                    <div className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                      <BrandedText text={t(`faq.a.${e.id}`)} />
                    </div>
                  </details>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
