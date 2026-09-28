"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { inquiryTitleParts } from "@advantis/convex/marketing/inquiry";
import { usePaginatedQuery, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  BarChart3,
  FileText,
  Inbox,
  Lock,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { InboxSettingsDialog } from "@/components/inquiries/InboxSettingsDialog";
import { StateBadge, TYPE_ICON, senderLine } from "@/components/inquiries/shared";
import { TagChips } from "@/components/inquiries/TagEditor";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useHasCapability } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill } from "@/components/ui/filter-pill";
import { Skeleton } from "@/components/ui/skeleton";

type View = "open" | "answered" | "closed" | "failed" | "all";

/**
 * Everything sent through the website's contact forms: newest activity
 * first, with who it's from, what it's about, where it's at and who has it.
 * Opening one marks it seen for the customer.
 */
export default function InquiriesPage() {
  const t = useTranslations("Inquiries");
  const canManage = useHasCapability("manage_inquiries");
  const router = useRouter();
  const [view, setView] = useState<View>("open");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tag, setTag] = useState<string | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searching = debounced.trim().length > 0;
  const headerActions = useMemo(
    () => [
      {
        key: "stats",
        label: t("stats.title"),
        icon: BarChart3,
        variant: "outline" as const,
        onClick: () => router.push("/inquiries/stats"),
      },
      {
        key: "settings",
        label: t("settings.title"),
        icon: Settings2,
        variant: "outline" as const,
        onClick: () => setSettingsOpen(true),
      },
      {
        key: "templates",
        label: t("templates.title"),
        icon: FileText,
        variant: "outline" as const,
        onClick: () => router.push("/inquiries/templates"),
      },
    ],
    [t, router],
  );

  // "/inquiries#841KGR" — a reference pasted after the page's address — starts as a search
  // for it, in every tab; the part after "#" never reaches the server, so it's read here
  useEffect(() => {
    const fromHash = decodeURIComponent(window.location.hash.slice(1)).trim();
    if (!fromHash) return;
    setQuery(fromHash);
    setDebounced(fromHash);
    setView("all");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const counts = useQuery(api.marketing.inbox.counts, canManage ? {} : "skip");
  const tags = useQuery(api.marketing.inbox.tagSuggestions, canManage ? {} : "skip");
  const { results, status, loadMore } = usePaginatedQuery(
    api.marketing.inbox.list,
    canManage && !searching ? { view, tag } : "skip",
    { initialNumItems: 40 },
  );
  const found = useQuery(
    api.marketing.inbox.search,
    canManage && searching ? { q: debounced, view, tag } : "skip",
  );

  if (!canManage) {
    return <EmptyState icon={<Lock />} title={t("noAccess")} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<Inbox />} />
      <PageHeaderActions actions={headerActions} />
      <InboxSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <form
        role="search"
        className="relative mt-6"
        onSubmit={(event) => {
          // Enter on a single hit (a reference, usually) opens it
          event.preventDefault();
          if (found?.results.length === 1) router.push(`/inquiries/${found.results[0]._id}`);
        }}
      >
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="pr-9 pl-9"
        />
        {query ? (
          <button
            type="button"
            aria-label={t("clearSearch")}
            onClick={() => {
              setQuery("");
              setDebounced("");
              searchRef.current?.focus();
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </form>

      {tags?.length || tag ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterPill
            label={t("tags.filter")}
            clearLabel={t("tags.clearFilter")}
            options={(tags ?? []).map((entry) => ({
              value: entry.tag,
              label: entry.tag,
              count: entry.count,
            }))}
            selected={tag ? [tag] : []}
            // one tag at a time: picking another replaces it
            onChange={(next) => setTag(next.at(-1))}
          />
        </div>
      ) : null}

      <CountTabs<View>
        value={view}
        onChange={setView}
        className="mt-4"
        tabs={[
          { value: "open", label: t("views.open"), count: counts?.unanswered },
          { value: "answered", label: t("views.answered"), count: counts?.answered },
          { value: "closed", label: t("views.closed") },
          { value: "failed", label: t("views.failed"), count: counts?.failed || undefined },
          { value: "all", label: t("views.all") },
        ]}
      />

      {searching ? (
        found === undefined ? (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : found.results.length === 0 ? (
          <EmptyState
            className="mt-10"
            icon={<Search />}
            title={t("noMatches", { query: debounced.trim() })}
            description={view === "all" ? undefined : t("noMatchesInTab")}
          />
        ) : (
          <>
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {found.results.map((inquiry) => (
                <InquiryRow key={inquiry._id} inquiry={inquiry} />
              ))}
            </ul>
            {found.truncated ? (
              <p className="mt-4 text-center text-xs text-muted-foreground">{t("searchScope")}</p>
            ) : null}
          </>
        )
      ) : status === "LoadingFirstPage" ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<Inbox />}
          title={t(`empty.${view}`)}
          action={
            status === "CanLoadMore" ? (
              <Button variant="outline" size="sm" onClick={() => loadMore(40)}>
                {t("loadMore")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {results.map((inquiry) => (
              <InquiryRow key={inquiry._id} inquiry={inquiry} />
            ))}
          </ul>
          {status === "CanLoadMore" ? (
            <div className="mt-6 text-center">
              <Button variant="outline" size="sm" onClick={() => loadMore(40)}>
                {t("loadMore")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

type Row =
  | ReturnType<typeof usePaginatedQuery<typeof api.marketing.inbox.list>>["results"][number]
  | FunctionReturnType<typeof api.marketing.inbox.search>["results"][number];

function InquiryRow({ inquiry }: { inquiry: Row }) {
  const t = useTranslations("Inquiries");
  const locale = useLocale();
  const Icon = TYPE_ICON[inquiry.submissionType];
  const format = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const parts = inquiryTitleParts(inquiry);
  const title =
    parts.kind === "text" || parts.kind === "subject"
      ? parts.text
      : parts.kind === "callback" && parts.at
        ? t("callbackAt", { when: format.format(parts.at) })
        : t(`types.${inquiry.submissionType}`);
  const failed = inquiry.status === "failed" || inquiry.status === "bounced";

  return (
    <li>
      <Link
        href={`/inquiries/${inquiry._id}`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 px-2 py-4 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          {!inquiry.seenAt ? (
            <span aria-label={t("unseen")} className="size-2 shrink-0 rounded-full bg-primary" />
          ) : null}
          <span className={`truncate text-sm ${inquiry.seenAt ? "" : "font-semibold"}`}>
            {title}
          </span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {format.format(inquiry.lastActivityAt)}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Icon aria-hidden className="size-3.5" />
          <span className="tabular-nums">{inquiry.reference}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{senderLine(inquiry)}</span>
          {inquiry.assigneeName ? (
            <>
              <span aria-hidden>·</span>
              <span>{t("assignedTo", { name: inquiry.assigneeName })}</span>
            </>
          ) : null}
          {inquiry.overdue ? (
            <span className="inline-flex items-center gap-1 font-medium text-destructive">
              <AlertTriangle aria-hidden className="size-3" />
              {t("overdue")}
            </span>
          ) : null}
          {failed ? (
            <span className="font-medium text-destructive">{t("notDelivered")}</span>
          ) : null}
          <TagChips tags={inquiry.tags} />
        </span>
        <StateBadge state={inquiry.state} className="justify-self-end" />
      </Link>
    </li>
  );
}
