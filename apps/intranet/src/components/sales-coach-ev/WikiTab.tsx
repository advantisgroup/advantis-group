"use client";

import { useEffect, useMemo, useState } from "react";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

import { type WikiArticle } from "./types";

const STOPWORDS = new Set([
  "und", "die", "der", "das", "ist", "sind", "haben", "hat", "mit", "fuer", "von", "auf", "zu", "in",
  "an", "bei", "sie", "wir", "ich", "ihr", "nicht", "auch", "noch", "wie", "was", "wann", "wo", "wer",
  "aber", "oder", "wenn", "dann", "schon", "mal", "denn", "ja", "nein", "bitte", "danke", "okay", "gut",
  "sehr", "gerne", "klar", "genau", "eben", "doch", "halt", "nur", "bereits", "immer", "alle", "uns",
  "ihm", "man", "mehr", "sich", "dem", "ein", "eine", "des", "eines", "einer", "einem", "als", "aus",
  "nach", "vor", "ueber", "unter", "werden", "war", "wird", "werde", "hatten", "hatte",
]);

function matches(article: WikiArticle, needle: string): boolean {
  const q = needle.toLowerCase();
  return (
    article.title.toLowerCase().includes(q) ||
    article.body.toLowerCase().includes(q) ||
    article.tags.toLowerCase().includes(q)
  );
}

/** Ranks the transcript's recent distinctive words against wiki titles/tags —
 * a lightweight local heuristic, not an AI call, matching the original tool. */
function autoScanCandidates(articles: WikiArticle[], transcript: string): WikiArticle[] {
  const recent = transcript.trim().split(/\s+/).slice(-60).join(" ").toLowerCase();
  const words = recent.match(/[a-zäöüß]{4,}/g) ?? [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 8);

  const found: WikiArticle[] = [];
  for (const word of ranked) {
    for (const article of articles) {
      if (found.includes(article)) continue;
      if (article.title.toLowerCase().includes(word) || article.tags.toLowerCase().includes(word)) {
        found.push(article);
      }
    }
  }
  return found.slice(0, 5);
}

export function WikiTab({
  wikiArticles,
  transcript,
  query,
  onQueryChange,
}: {
  wikiArticles: WikiArticle[];
  transcript: string;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const t = useTranslations("SalesCoachEv");
  const [autoHits, setAutoHits] = useState<WikiArticle[]>([]);
  const [lastScanLen, setLastScanLen] = useState(0);

  useEffect(() => {
    if (transcript.length - lastScanLen < 30) return;
    const timer = setTimeout(() => {
      setLastScanLen(transcript.length);
      setAutoHits(autoScanCandidates(wikiArticles, transcript));
    }, 2000);
    return () => clearTimeout(timer);
  }, [transcript, wikiArticles, lastScanLen]);

  const searchHits = useMemo(() => {
    if (!query.trim()) return [];
    return wikiArticles.filter((a) => matches(a, query)).slice(0, 5);
  }, [wikiArticles, query]);

  const results = query.trim() ? searchHits : autoHits;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("wikiSearchPlaceholder")}
            className="h-7 pl-7 text-[13px]"
          />
        </div>
      </div>
      {!query.trim() && autoHits.length > 0 && (
        <div className="border-b border-border bg-primary/5 px-2.5 py-1.5 text-[11px] font-semibold text-primary">
          {t("wikiAutoHits", { count: autoHits.length })}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <div className="p-3.5 text-center text-[13px] italic text-muted-foreground">
            {query.trim() ? t("wikiNoResults") : t("wikiScanHint")}
          </div>
        ) : (
          results.map((a) => (
            <div key={a._id} className="border-b border-border px-2.5 py-2 text-[13px] leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-foreground/90">
                {a.title}
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-normal text-primary hover:underline"
                  >
                    {t("wikiOpenLink")}
                  </a>
                )}
              </div>
              <div className="text-muted-foreground">{a.body.slice(0, 150)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
