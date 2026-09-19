"use client";

import { type ReactNode, useMemo, useState } from "react";

import { Check, List, Map, MessageSquare, RotateCcw, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { type CaseRow, CASES } from "./case-search-data";
import { SOPPanel } from "./sop-panel";
import { StationsFinder } from "./stations-finder";

/** Per record-type accent: badge chip + left card accent. Tuned for both themes. */
const RECORD_TYPE_STYLES: Record<string, { chip: string; accent: string }> = {
  Cards: {
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    accent: "bg-blue-500",
  },
  Toll: {
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    accent: "bg-emerald-500",
  },
  "Tax Operations": {
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    accent: "bg-orange-500",
  },
  Complaints: {
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    accent: "bg-rose-500",
  },
  Logistics: {
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    accent: "bg-violet-500",
  },
  "Customer Service": {
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    accent: "bg-teal-500",
  },
  Pricing: {
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    accent: "bg-amber-500",
  },
  "Internal case": {
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    accent: "bg-slate-500",
  },
  Onboarding: {
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    accent: "bg-sky-500",
  },
  Finance: {
    chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    accent: "bg-fuchsia-500",
  },
};

const FALLBACK_STYLE = {
  chip: "bg-muted text-muted-foreground",
  accent: "bg-muted-foreground",
};

function styleFor(recordType: string) {
  return RECORD_TYPE_STYLES[recordType] ?? FALLBACK_STYLE;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[´`']/g, "");
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!text || !query) return false;
  const t = normalize(text);
  const q = normalize(query);
  if (t.includes(q)) return true;
  // Allow a single typo for queries longer than 4 chars.
  if (q.length > 4) {
    for (let i = 0; i <= t.length - q.length + 1; i++) {
      let mismatches = 0;
      for (let j = 0; j < q.length; j++) {
        if (t[i + j] !== q[j]) mismatches++;
        if (mismatches > 1) break;
      }
      if (mismatches <= 1) return true;
    }
  }
  return false;
}

function scoreMatch(c: CaseRow, query: string): number {
  let score = 0;
  const q = query.toLowerCase();
  if (c.subcategoryDetail.toLowerCase().includes(q)) score += 10;
  if (c.subcategory.toLowerCase().includes(q)) score += 8;
  if (c.description.toLowerCase().includes(q)) score += 6;
  if (c.category.toLowerCase().includes(q)) score += 4;
  if (c.recordType.toLowerCase().includes(q)) score += 2;
  if (score === 0) {
    if (fuzzyMatch(c.subcategoryDetail, query)) score += 5;
    if (fuzzyMatch(c.subcategory, query)) score += 4;
    if (fuzzyMatch(c.description, query)) score += 3;
    if (fuzzyMatch(c.category, query)) score += 2;
  }
  return score;
}

function highlight(text: string, query: string): ReactNode {
  if (!text || !query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-warning/40 px-0.5 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// Mandatory case fields (domain content — kept in the team's working language).
const CHECKLIST = [
  { id: 1, label: "Kd-Nr.", hint: "im Betreff" },
  { id: 2, label: "Firmenname", hint: "+ Ort" },
  { id: 3, label: "Name Ansprechpartner", hint: "" },
  { id: 4, label: "Tel. Nr.", hint: "beim Kunden abfragen" },
  {
    id: 5,
    label: "Grund des Falls",
    hint: "worum es genau geht – keine bloße Rückrufbitte",
  },
];

const MAX_RESULTS = 40;

function CaseSearchTab() {
  const t = useTranslations("CaseSearch");
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const recordTypes = useMemo(
    () => ["All", ...Array.from(new Set(CASES.map((c) => c.recordType)))],
    [],
  );

  const q = query.trim();

  const results = useMemo(() => {
    if (!q && selectedType === "All") return [];
    return CASES.filter((c) => {
      if (selectedType !== "All" && c.recordType !== selectedType) return false;
      if (!q) return true;
      return scoreMatch(c, q) > 0;
    })
      .map((c) => ({ ...c, _score: q ? scoreMatch(c, q) : 0 }))
      .sort((a, b) => b._score - a._score)
      .slice(0, MAX_RESULTS);
  }, [q, selectedType]);

  const doneCount = CHECKLIST.filter((i) => checked[i.id]).length;
  const allDone = doneCount === CHECKLIST.length;

  return (
    <div className="space-y-5">
      {/* Mandatory-fields checklist */}
      <Card className={cn(allDone && "border-success/40")}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{t("mandatoryTitle")}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                  allDone ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                )}
              >
                {doneCount}/{CHECKLIST.length}
              </span>
            </div>
            {doneCount > 0 && (
              <button
                type="button"
                onClick={() => setChecked({})}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                {t("reset")}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("mandatoryHint")}</p>
          <div className="flex flex-wrap gap-2">
            {CHECKLIST.map((item) => {
              const on = !!checked[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChecked((p) => ({ ...p, [item.id]: !p[item.id] }))}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors",
                    on
                      ? "border-success/40 bg-success/10 text-foreground"
                      : "border-border bg-card hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                      on ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {on ? <Check className="size-3" /> : item.id}
                  </span>
                  <span className="font-medium">{item.label}</span>
                  {item.hint && (
                    <span className="text-xs italic text-muted-foreground">({item.hint})</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-11 pl-10 pr-10 text-base"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("clear")}
            className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {recordTypes.map((rt) => {
          const active = selectedType === rt;
          const style = rt === "All" ? null : styleFor(rt);
          return (
            <button
              key={rt}
              type="button"
              onClick={() => setSelectedType(rt)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary refreshed:border-foreground/25 refreshed:bg-foreground/[0.07] refreshed:text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5">
                {style && <span className={cn("size-2 rounded-full", style.accent)} />}
                {rt === "All" ? t("allTypes") : rt}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      {!q && selectedType === "All" ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Search className="size-6" />
          </span>
          <p className="text-sm font-medium">{t("emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("casesAvailable", { count: CASES.length })}
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium">{t("noResultsTitle", { query: q })}</p>
          <p className="text-xs text-muted-foreground">{t("noResultsHint")}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("resultsCount", { count: results.length })}
            {results.length === MAX_RESULTS ? ` ${t("topN", { n: MAX_RESULTS })}` : ""}
          </p>
          <div className="space-y-2.5">
            {results.map((c, i) => {
              const style = styleFor(c.recordType);
              return (
                <div
                  key={`${c.recordType}-${c.category}-${c.subcategory}-${c.subcategoryDetail}-${i}`}
                  className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 pl-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] refreshed:shadow-none"
                >
                  <span className={cn("absolute inset-y-0 left-0 w-1", style.accent)} />
                  <div className="mb-3">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                        style.chip,
                      )}
                    >
                      {c.recordType}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("fieldCategory")} value={c.category} query={q} />
                    {c.subcategory && (
                      <Field label={t("fieldSubcategory")} value={c.subcategory} query={q} />
                    )}
                    {c.subcategoryDetail && c.subcategoryDetail !== "None" && (
                      <Field
                        label={t("fieldSubcategoryDetail")}
                        value={c.subcategoryDetail}
                        query={q}
                      />
                    )}
                    {c.processor && (
                      <Field label={t("fieldProcessor")} value={c.processor} query={q} />
                    )}
                  </div>
                  {c.description && (
                    <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground refreshed:text-xs refreshed:font-medium refreshed:normal-case refreshed:tracking-normal">
                        {t("whenToUse")}{" "}
                      </span>
                      {highlight(c.description, q)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, query }: { label: string; value: string; query: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground refreshed:text-xs refreshed:font-medium refreshed:normal-case refreshed:tracking-normal">
        {label}
      </div>
      <div className="text-sm font-medium leading-snug">{highlight(value, query)}</div>
    </div>
  );
}

type Tab = "sop" | "search" | "wiki" | "stations";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "sop", label: "Szenarien", icon: <List className="h-4 w-4" /> },
  { id: "search", label: "Case-Suche", icon: <Search className="h-4 w-4" /> },
  { id: "wiki", label: "Wiki", icon: <MessageSquare className="h-4 w-4" /> },
  {
    id: "stations",
    label: "Stationsfinder",
    icon: <Map className="h-4 w-4" />,
  },
];

export function CaseSearchGuidebook() {
  const t = useTranslations("Guidebooks");
  const [activeTab, setActiveTab] = useState<Tab>("sop");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === "sop" && <SOPPanel />}
        {activeTab === "search" && <CaseSearchTab />}
        {activeTab === "wiki" && (
          <div className="flex h-[calc(100dvh-16rem)] min-h-[420px] flex-col items-center justify-center gap-4 rounded-xl border border-border bg-muted/20 p-8 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("wikiChat.title")}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{t("wikiChat.openFullHint")}</p>
            </div>
            <Link
              href="/wiki-chat"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 refreshed:bg-foreground refreshed:text-background refreshed:hover:bg-foreground/88"
            >
              {t("wikiChat.openFull")}
            </Link>
          </div>
        )}
        {activeTab === "stations" && <StationsFinder />}
      </div>
    </div>
  );
}
