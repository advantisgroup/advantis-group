"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Lightbulb, Plus, Settings2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { CategoryManagerDialog } from "@/components/suggestions/CategoryManagerDialog";
import { NewSuggestionDialog } from "@/components/suggestions/NewSuggestionDialog";
import { SuggestionRow } from "@/components/suggestions/SuggestionRow";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SplitDivider } from "@/components/ui/split-divider";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

const SPLIT_KEY = "suggestions:split";
// Wider than the shared mobile/desktop breakpoint (768px) — SuggestionRow's
// 12-column layout needs real room per pane, and at 768px the expanded
// sidebar + shell padding leave each side only ~220px, badly truncating
// dates/titles/badges. Side-by-side only kicks in once there's actually
// space for it.
const SPLIT_MIN_WIDTH = 1280;

function useCanSplit(): boolean {
  const [canSplit, setCanSplit] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${SPLIT_MIN_WIDTH}px)`);
    const onChange = () => setCanSplit(window.innerWidth >= SPLIT_MIN_WIDTH);
    mql.addEventListener("change", onChange);
    setCanSplit(window.innerWidth >= SPLIT_MIN_WIDTH);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return canSplit;
}

function monthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

const ALL_MONTHS = "all";

export default function SuggestionsPage() {
  const t = useTranslations("Suggestions");
  const locale = useLocale();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const canSplit = useCanSplit();
  const handleError = useErrorHandler();
  const splitRef = useRef<HTMLDivElement>(null);

  const suggestions = useQuery(api.suggestions.list, {});
  const remove = useMutation(api.suggestions.remove);

  const [newOpen, setNewOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [splitPct, setSplitPct] = useState(50);

  const currentMonth = monthKey(Date.now());
  const [monthFilter, setMonthFilter] = useState(currentMonth);

  const availableMonths = useMemo(() => {
    const set = new Set((suggestions ?? []).map((s) => monthKey(s.createdAt)));
    set.add(currentMonth);
    return [...set].sort().reverse();
  }, [suggestions, currentMonth]);

  const monthRows = (suggestions ?? []).filter(
    (s) => monthFilter === ALL_MONTHS || monthKey(s.createdAt) === monthFilter,
  );
  const implementedRows = (suggestions ?? []).filter((s) => s.outcome === "implemented");

  useEffect(() => {
    const raw = Number(localStorage.getItem(SPLIT_KEY));
    if (Number.isFinite(raw) && raw >= 25 && raw <= 75) setSplitPct(raw);
  }, []);

  function persistSplit(pct: number) {
    setSplitPct(pct);
    try {
      localStorage.setItem(SPLIT_KEY, String(pct));
    } catch {
      // Storage unavailable — the split just isn't remembered.
    }
  }

  async function onDelete(id: Id<"suggestions">) {
    try {
      await remove({ suggestionId: id });
      toast.success(t("deleted"));
    } catch (e) {
      handleError(e);
    }
  }

  const submittedSection = (
    <section className="h-full rounded-lg border border-border/70 bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground/80">
          {t("monthSection")}{" "}
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {monthRows.length}
          </span>
        </h2>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="h-8 w-auto gap-1.5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map((m) => (
              <SelectItem key={m} value={m}>
                {m === currentMonth
                  ? t("monthCurrent", { month: monthLabel(m, locale) })
                  : monthLabel(m, locale)}
              </SelectItem>
            ))}
            <SelectItem value={ALL_MONTHS}>{t("monthFilterAll")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {suggestions && monthRows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("emptyMonth")}</p>
      ) : (
        <div>
          {monthRows.map((s) => (
            <SuggestionRow
              key={s._id}
              suggestion={s}
              canModerate={isManager}
              onDelete={() => void onDelete(s._id)}
            />
          ))}
        </div>
      )}
    </section>
  );

  const implementedSection = (
    <section className="h-full rounded-lg border border-emerald-500/30 bg-card shadow-sm">
      <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          {t("implementedSection")}{" "}
          <span className="ml-1 rounded-full bg-background px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {implementedRows.length}
          </span>
        </h2>
      </div>
      {suggestions && implementedRows.length === 0 ? (
        <EmptyState icon={<Lightbulb />} title={t("emptyImplemented")} />
      ) : (
        <div>
          {implementedRows.map((s) => (
            <SuggestionRow
              key={s._id}
              suggestion={s}
              canModerate={isManager}
              onDelete={() => void onDelete(s._id)}
            />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className={cn("mx-auto space-y-6", canSplit ? "max-w-7xl" : "max-w-4xl")}>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        icon={<Lightbulb />}
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
                <Settings2 className="mr-2 size-4" />
                {t("manageCategories")}
              </Button>
            )}
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="mr-2 size-4" />
              {t("new")}
            </Button>
          </div>
        }
      />

      {canSplit ? (
        <div ref={splitRef} className="flex items-start">
          <div className="min-w-0" style={{ width: `${splitPct}%` }}>
            {submittedSection}
          </div>
          <SplitDivider
            containerRef={splitRef}
            value={splitPct}
            onResize={persistSplit}
            onReset={() => persistSplit(50)}
          />
          <div className="min-w-0" style={{ width: `${100 - splitPct}%` }}>
            {implementedSection}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {submittedSection}
          {implementedSection}
        </div>
      )}

      <NewSuggestionDialog open={newOpen} onOpenChange={setNewOpen} />
      <CategoryManagerDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
    </div>
  );
}
