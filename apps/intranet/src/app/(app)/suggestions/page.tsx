"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Lightbulb, Plus, Search, Settings2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PersonLink } from "@/components/profile/PersonLink";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { CategoryManagerDialog } from "@/components/suggestions/CategoryManagerDialog";
import { ClassicSuggestionsPage } from "@/components/suggestions/ClassicSuggestionsPage";
import { NewSuggestionDialog } from "@/components/suggestions/NewSuggestionDialog";
import {
  SUGGESTION_STATUSES,
  SuggestionStateBadge,
  type SuggestionListItem,
  type SuggestionStatus,
} from "@/components/suggestions/shared";
import { SuggestionPanel } from "@/components/suggestions/SuggestionPanel";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill, TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { DesignSwitch } from "@/lib/design-preview";
import { formatDateTime } from "@/lib/format";

type StatusTab = "all" | SuggestionStatus;

function monthKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function SuggestionsPageContent() {
  const t = useTranslations("Suggestions");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const suggestions = useQuery(api.suggestions.list, {});
  const remove = useMutation(api.suggestions.remove);

  const [newOpen, setNewOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [tab, setTab] = useState<StatusTab>("all");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [implementedOnly, setImplementedOnly] = useState(false);
  const [search, setSearch] = useState("");

  const openNewFromUrl = params.get("new") === "1";
  const panelId = params.get("open");
  const currentMonth = monthKey(Date.now());

  useEffect(() => {
    if (!openNewFromUrl) return;
    setNewOpen(true);
    router.replace("/suggestions");
  }, [openNewFromUrl, router]);

  function monthLabel(key: string) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  }

  const all = useMemo(() => suggestions ?? [], [suggestions]);
  const query = search.trim().toLowerCase();
  // Everything but the status tab, so each tab's count is what it would show.
  const filteredByPills = useMemo(
    () =>
      all.filter((s) => {
        if (categoryFilter.length > 0 && !categoryFilter.includes(s.categoryName)) return false;
        if (monthFilter.length > 0 && !monthFilter.includes(monthKey(s.createdAt))) return false;
        if (implementedOnly && s.outcome !== "implemented") return false;
        if (!query) return true;
        return [s.title, s.explanation, s.authorName, s.categoryName]
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [all, categoryFilter, monthFilter, implementedOnly, query],
  );
  const rows = tab === "all" ? filteredByPills : filteredByPills.filter((s) => s.status === tab);

  // Month headings inside the list keep the old month-by-month reading
  // without forcing a month filter on everyone who opens the page.
  const groups = useMemo(() => {
    const map = new Map<string, SuggestionListItem[]>();
    for (const row of rows) {
      const key = monthKey(row.createdAt);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [rows]);

  const categoryNames = [...new Set(all.map((s) => s.categoryName))].sort((a, b) =>
    a.localeCompare(b),
  );
  const months = [...new Set([currentMonth, ...all.map((s) => monthKey(s.createdAt))])]
    .sort()
    .reverse();
  const implementedCount = all.filter((s) => s.outcome === "implemented").length;
  const filtersActive =
    categoryFilter.length > 0 || monthFilter.length > 0 || implementedOnly || query !== "";

  function clearFilters() {
    setCategoryFilter([]);
    setMonthFilter([]);
    setImplementedOnly(false);
    setSearch("");
  }

  function openPanel(id: string) {
    router.replace(`/suggestions?open=${id}`, { scroll: false });
  }

  function closePanel() {
    router.replace("/suggestions", { scroll: false });
  }

  async function onDelete(suggestion: SuggestionListItem) {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: tc("deleteWarning"),
      details: [{ label: tc("fieldTitle"), value: suggestion.title }],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove({ suggestionId: suggestion._id });
      closePanel();
      toast.success(t("deleted"));
    } catch (e) {
      handleError(e);
    }
  }

  const statusTabs = [
    { value: "all" as const, label: tc("all"), count: filteredByPills.length },
    ...SUGGESTION_STATUSES.map((status) => ({
      value: status,
      label: t(`status_${status}`),
      count: filteredByPills.filter((s) => s.status === status).length,
    })),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<Lightbulb />} />
      <PageHeaderActions
        actions={[
          ...(isAdmin
            ? [
                {
                  key: "categories",
                  label: t("manageCategories"),
                  icon: Settings2,
                  onClick: () => setCategoriesOpen(true),
                  variant: "outline" as const,
                },
              ]
            : []),
          { key: "new", label: t("new"), icon: Plus, onClick: () => setNewOpen(true) },
        ]}
      />

      <CountTabs value={tab} onChange={setTab} tabs={statusTabs} />

      <div className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-9 rounded-full pl-8 text-sm md:h-7 md:text-xs"
          />
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0">
          <FilterPill
            label={t("field_category")}
            options={categoryNames.map((name) => ({
              value: name,
              label: name,
              count: all.filter((s) => s.categoryName === name).length,
            }))}
            selected={categoryFilter}
            onChange={setCategoryFilter}
            clearLabel={t("clearFilter", { label: t("field_category") })}
          />
          <FilterPill
            label={t("month")}
            options={months.map((key) => ({
              value: key,
              label:
                key === currentMonth
                  ? t("monthCurrent", { month: monthLabel(key) })
                  : monthLabel(key),
              count: all.filter((s) => monthKey(s.createdAt) === key).length,
            }))}
            selected={monthFilter}
            onChange={setMonthFilter}
            clearLabel={t("clearFilter", { label: t("month") })}
          />
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <TogglePill
            active={implementedOnly}
            onClick={() => setImplementedOnly((value) => !value)}
            count={implementedCount}
            dotClassName="bg-ok"
          >
            {t("implementedFilter")}
          </TogglePill>
          {filtersActive && (
            <Button variant="ghost" size="xs" className="shrink-0" onClick={clearFilters}>
              <X />
              {t("clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {suggestions === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Lightbulb />}
          title={all.length === 0 ? t("empty") : t("noResults")}
          action={
            filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("columnSuggestion")}</TableHead>
                <TableHead className="w-44">{t("field_category")}</TableHead>
                <TableHead className="w-48">{t("columnSubmittedBy")}</TableHead>
                <TableHead className="w-48">{t("fieldStatus")}</TableHead>
                <TableHead className="w-40">{t("columnDate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(([key, items]) => (
                <Fragment key={key}>
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="bg-muted/30 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {monthLabel(key)}
                      <span className="ml-2 font-normal tabular-nums">{items.length}</span>
                    </TableCell>
                  </TableRow>
                  {items.map((s) => (
                    <TableRow
                      key={s._id}
                      tabIndex={0}
                      data-state={s._id === panelId ? "selected" : undefined}
                      onClick={() => openPanel(s._id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") openPanel(s._id);
                      }}
                      className="cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
                    >
                      <TableCell className="w-full max-w-0">
                        <span className="block truncate font-medium">{s.title}</span>
                      </TableCell>
                      <TableCell className="max-w-44 truncate text-muted-foreground">
                        {s.categoryName}
                      </TableCell>
                      <TableCell className="max-w-48">
                        <PersonLink userId={s.authorUserId}>{s.authorName}</PersonLink>
                      </TableCell>
                      <TableCell>
                        <SuggestionStateBadge suggestion={s} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(s.createdAt, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>

          <div className="md:hidden">
            {groups.map(([key, items]) => (
              <section key={key}>
                <p className="border-b border-border/60 bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {monthLabel(key)}
                  <span className="ml-2 font-normal tabular-nums">{items.length}</span>
                </p>
                <ul className="divide-y divide-border/60">
                  {items.map((s) => (
                    <li
                      key={s._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openPanel(s._id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") openPanel(s._id);
                      }}
                      className="space-y-1 px-4 py-3 active:bg-accent/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-medium">{s.title}</p>
                        <SuggestionStateBadge suggestion={s} className="mt-0.5 shrink-0" />
                      </div>
                      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">{s.categoryName}</span>
                        <span aria-hidden>·</span>
                        <PersonLink userId={s.authorUserId} className="shrink-0">
                          {s.authorName}
                        </PersonLink>
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="border-t border-border/70 px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
            {t("countLabel", { shown: rows.length, total: all.length })}
          </div>
        </div>
      )}

      <SuggestionPanel
        suggestion={all.find((s) => s._id === panelId)}
        open={!!panelId}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
        canModerate={isManager}
        onDelete={(suggestion) => void onDelete(suggestion)}
      />
      <NewSuggestionDialog open={newOpen} onOpenChange={setNewOpen} />
      <CategoryManagerDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
    </div>
  );
}

export default function SuggestionsPage() {
  return (
    <Suspense fallback={null}>
      <DesignSwitch refreshed={<SuggestionsPageContent />} classic={<ClassicSuggestionsPage />} />
    </Suspense>
  );
}
