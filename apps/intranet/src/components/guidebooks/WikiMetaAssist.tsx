"use client";

import { type ReactNode, useState } from "react";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { AiButton } from "@/components/ai/AiButton";
import { AiGlyph } from "@/components/ai/AiGlyph";
import { AiRunCard } from "@/components/ai/AiRunCard";
import { parseJson, useAiRun } from "@/components/ai/use-ai-run";
import { Button } from "@/components/ui/button";
import { htmlToText } from "@/components/ui/rich-text";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { type WikiImportAssist, useWikiImportApi } from "@/lib/wiki-import-api";

const MIN_TEXT_CHARS = 40;

interface Category {
  _id: string;
  name: string;
  color: string;
}

function matchCategory(hint: string, categories: Category[]): Category | undefined {
  const h = hint.toLowerCase();
  if (!h) return undefined;
  return categories.find((c) => {
    const name = c.name.toLowerCase();
    return name === h || name.includes(h) || h.includes(name);
  });
}

/**
 * "Suggest a topic & tags" for a wiki entry. Suggestions are offered, never
 * applied behind anyone's back — each one has its own Apply, and the body
 * text is never part of what comes back.
 */
export function WikiMetaAssist({
  entryKey,
  href,
  erklaerung,
  thema,
  tags,
  categoryId,
  categories,
  onApply,
}: {
  entryKey: string;
  href?: string;
  erklaerung: string;
  thema: string;
  tags: string[];
  categoryId: string;
  categories: Category[];
  onApply: (patch: { thema?: string; tags?: string[]; categoryId?: string }) => void;
}) {
  const t = useTranslations("Guidebooks");
  const ta = useTranslations("Ai");
  const importApi = useWikiImportApi();
  const handleError = useErrorHandler();
  const view = useAiRun<WikiImportAssist>({ subjectKey: `wikiMeta:${entryKey}` }, parseJson);
  const [starting, setStarting] = useState(false);
  const text = htmlToText(erklaerung).trim();

  async function start() {
    setStarting(true);
    try {
      await importApi.start({ text, subjectKey: entryKey, href });
    } catch (e) {
      handleError(e);
    } finally {
      setStarting(false);
    }
  }

  const unseen = !!view.run && !view.run.seenAt;
  const suggestion = unseen && view.state === "done" ? view.result : null;

  if (unseen && !suggestion) {
    return <AiRunCard view={view} onRetry={() => void start()} onDismiss={view.markSeen} />;
  }

  if (suggestion) {
    const match = matchCategory(suggestion.categoryHint, categories);
    const rows: {
      key: string;
      label: string;
      value: ReactNode;
      applied: boolean;
      apply?: () => void;
    }[] = [];
    if (suggestion.thema) {
      rows.push({
        key: "thema",
        label: t("fieldThema"),
        value: suggestion.thema,
        applied: suggestion.thema === thema,
        apply: () => onApply({ thema: suggestion.thema }),
      });
    }
    if (suggestion.tags.length > 0) {
      rows.push({
        key: "tags",
        label: t("tagsFilterLabel"),
        value: (
          <span className="flex flex-wrap gap-1">
            {suggestion.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {tag}
              </span>
            ))}
          </span>
        ),
        applied: suggestion.tags.every((tag) => tags.includes(tag)),
        apply: () => onApply({ tags: [...new Set([...tags, ...suggestion.tags])] }),
      });
    }
    if (suggestion.categoryHint) {
      rows.push({
        key: "category",
        label: t("fieldCategory"),
        value: match ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: match.color }} />
            {match.name}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t("metaNoCategoryMatch", { hint: suggestion.categoryHint })}
          </span>
        ),
        applied: match?._id === categoryId,
        apply: match ? () => onApply({ categoryId: match._id }) : undefined,
      });
    }

    return (
      <section
        className="rounded-2xl border border-border/60 p-4"
        style={{
          backgroundColor: "var(--card)",
          backgroundImage:
            "radial-gradient(26rem 10rem at 0% 0%, color-mix(in oklch, var(--ai-2) 14%, transparent), transparent 70%)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="ai-edge flex size-8 items-center justify-center rounded-lg">
            <AiGlyph className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em]">
              <span className="ai-text">{ta("eyebrow")}</span>
              <span className="text-muted-foreground"> · {ta("kind.wikiMeta")}</span>
            </p>
            <h3 className="font-display text-base font-bold tracking-tight">
              {t("metaAssistReady")}
            </h3>
          </div>
        </div>
        <ul className="mt-3 divide-y divide-border/60">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className="ai-rise flex items-center gap-3 py-2.5"
              style={{ ["--i" as string]: index }}
            >
              <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                {row.label}
              </span>
              <span className="min-w-0 flex-1 text-sm">{row.value}</span>
              {row.applied ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success">
                  <Check className="size-3.5" strokeWidth={3} />
                  {t("metaApplied")}
                </span>
              ) : (
                row.apply && (
                  <Button size="xs" variant="outline" onClick={row.apply}>
                    {t("metaApply")}
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={view.markSeen}>
            {ta("dismiss")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              for (const row of rows) if (!row.applied) row.apply?.();
              view.markSeen();
            }}
          >
            {t("metaApplyAll")}
          </Button>
        </div>
      </section>
    );
  }

  const tooShort = text.length < MIN_TEXT_CHARS;
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-dashed border-border/80 p-3.5">
      <AiGlyph className="mt-0.5 size-5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("metaAssistTitle")}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {tooShort ? t("metaAssistNeedsText") : t("metaAssistHint")}
        </p>
      </div>
      <AiButton working={starting} disabled={tooShort || starting} onClick={() => void start()}>
        {t("metaAssistCta")}
      </AiButton>
    </section>
  );
}
