"use client";

import { useState } from "react";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { useAiNavigate } from "@/components/ai/use-ai-navigate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Type where you're trying to go, or ask about something you own ("what was
 * my last IT ticket?"), and it takes you straight there instead of making you
 * search for it. Sits next to AiBriefCard as the other half of the AI
 * overview: that one tells you about your day, this one gets you moving.
 */
export function AiNavigateCard() {
  const t = useTranslations("Dashboard");
  const te = useTranslations("Errors");
  const { run, pending, notFound, failed, limited } = useAiNavigate();
  const [query, setQuery] = useState("");

  function submit() {
    if (pending || !query.trim()) return;
    void run(query);
  }

  return (
    <section aria-live="polite" className="rounded-2xl border border-border/70 bg-card">
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <AiGlyph working={pending} className="size-[18px]" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            {t("helperTitle")}
          </h2>
        </div>

        <form
          className="mt-2.5 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder={t("helperPlaceholder")}
            disabled={pending}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            variant="outline"
            disabled={pending || !query.trim()}
            aria-label={t("helperTitle")}
          >
            <ArrowRight className="size-4" />
          </Button>
        </form>

        {(notFound || failed || limited) && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {notFound ? t("helperNoMatch") : limited ? te("ai_limit") : t("helperFailed")}
          </p>
        )}
      </div>
    </section>
  );
}
