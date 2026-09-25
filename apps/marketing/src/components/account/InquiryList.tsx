"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { CheckpointNote } from "@/components/account/Checkpoints";
import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { Inquiry, InquiryList as InquiryListData } from "@/lib/inquiries-server";
import { cn } from "@/lib/utils";

import { AccountBackLink } from "./AccountNav";
import {
  TYPE_ICON,
  hasDeliveryProblem,
  isActive,
  isUpcomingCallback,
  useInquiryFormat,
} from "./inquiry-format";
import { StateLabel } from "./StateLabel";

const FILTERS = ["all", "open", "answered", "closed"] as const;
type Filter = (typeof FILTERS)[number];

const inFilter = (inquiry: Inquiry, filter: Filter) =>
  filter === "all" ||
  (filter === "open" && isActive(inquiry.state)) ||
  (filter === "answered" && inquiry.state === "answered") ||
  (filter === "closed" && (inquiry.state === "closed" || inquiry.state === "withdrawn"));

// the toolbar only earns its space once there's something to search through
const TOOLBAR_FROM = 6;

/**
 * Every inquiry the account sent, as one reading column: a title and a line
 * of what it said, then who it's with and where it's at. Reading one happens
 * on its own page.
 */
export function InquiryList({ data, limit }: { data: InquiryListData | null; limit: number }) {
  const t = useTranslations("account.inquiries");
  const format = useInquiryFormat();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const inquiries = useMemo(() => data?.submissions ?? [], [data]);

  // an inquiry sent from another tab shows up when you come back to this one
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  // "/" to search, j/k or the arrows to move between rows
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]") || event.metaKey || event.ctrlKey) {
        return;
      }
      if (event.key === "/" && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
        return;
      }
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
      if (!rows.length) return;
      const index = rows.indexOf(document.activeElement as HTMLElement);
      const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      rows[Math.min(Math.max(index + step, 0), rows.length - 1)]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const month = new Intl.DateTimeFormat(format.locale, { month: "long" });
    const monthYear = new Intl.DateTimeFormat(format.locale, { month: "long", year: "numeric" });
    const thisYear = new Date().getFullYear();

    const byMonth = new Map<string, Inquiry[]>();
    for (const inquiry of inquiries) {
      if (!inFilter(inquiry, filter)) continue;
      if (needle) {
        const haystack = [
          format.title(inquiry).title,
          inquiry.message,
          inquiry.notes,
          inquiry.company,
          inquiry.reference,
        ];
        if (!haystack.some((field) => field?.toLowerCase().includes(needle))) continue;
      }
      const at = new Date(inquiry.sentAt);
      const key = (at.getFullYear() === thisYear ? month : monthYear).format(at);
      byMonth.set(key, [...(byMonth.get(key) ?? []), inquiry]);
    }
    return [...byMonth.entries()];
  }, [inquiries, filter, query, format]);

  if (!data) {
    return (
      <>
        <AccountBackLink />
        <Display as="h1" size="md">
          {t("title")}
        </Display>
        <p className="mt-6 text-[15px] text-muted-foreground">{t("loadError")}</p>
        <Button
          className="mt-5"
          variant="outline"
          size="sm"
          shape="pill"
          onClick={() => router.refresh()}
        >
          {t("retry")}
        </Button>
      </>
    );
  }

  const upcoming = inquiries
    .filter(isUpcomingCallback)
    .sort((a, b) => a.desiredAt! - b.desiredAt!)[0];
  const problems = inquiries.filter(hasDeliveryProblem);
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f, inquiries.filter((inquiry) => inFilter(inquiry, f)).length]),
  ) as Record<Filter, number>;

  return (
    <>
      <AccountBackLink />
      <header className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <Display as="h1" size="md">
            {t("title")}
          </Display>
          {inquiries.length ? (
            <p className="mt-3 text-sm tabular-nums text-muted-foreground">
              {t("summary", {
                count: inquiries.length,
                last: format.relative(inquiries[0].sentAt),
              })}
            </p>
          ) : null}
        </div>
        <Button asChild size="sm" shape="pill" className="shrink-0">
          <Link href="/contact">{t("new")}</Link>
        </Button>
      </header>

      {upcoming ? (
        <CheckpointNote
          title={t("nextCallback")}
          detail={format.full.format(upcoming.desiredAt!)}
          action={
            <Button asChild size="sm" variant="outline" shape="pill">
              <Link href={`/account/submissions/${upcoming._id}`}>{t("view")}</Link>
            </Button>
          }
        />
      ) : null}
      {problems.length ? (
        <CheckpointNote
          tone="failed"
          title={t("problems", { count: problems.length })}
          action={
            <Button asChild size="sm" variant="outline" shape="pill">
              <Link href={`/account/submissions/${problems[0]._id}`}>{t("view")}</Link>
            </Button>
          }
        >
          {t("problemsHint")}
        </CheckpointNote>
      ) : null}

      {inquiries.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {inquiries.length >= TOOLBAR_FROM ? (
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block sm:w-72">
                <span className="sr-only">{t("search")}</span>
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("search")}
                  className="h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-base placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-[15px]"
                />
              </label>
              <div
                role="group"
                aria-label={t("filterLabel")}
                className="-mx-5 flex gap-1 overflow-x-auto px-5 sm:mx-0 sm:px-0"
              >
                {FILTERS.map((f) =>
                  f !== "all" && counts[f] === 0 ? null : (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-9",
                        filter === f
                          ? "bg-accent font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`filters.${f}`)}
                      <span className="tabular-nums text-muted-foreground">{counts[f]}</span>
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {groups.length === 0 ? (
            <p className="mt-10 border-y border-rule py-10 text-center text-[15px] text-muted-foreground">
              {t("noMatches")}
            </p>
          ) : (
            <ul ref={listRef} className="mt-6">
              {groups.map(([month, items]) => (
                <li key={month}>
                  {groups.length > 1 ? (
                    <h2 className="pt-7 pb-2 text-sm font-medium text-muted-foreground">{month}</h2>
                  ) : null}
                  <ul className="divide-y divide-rule border-y border-rule">
                    {items.map((inquiry) => (
                      <InquiryRow key={inquiry._id} inquiry={inquiry} format={format} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          {data.hasMore ? (
            <div className="mt-8 text-center">
              <Button asChild variant="outline" size="sm" shape="pill">
                <Link
                  href={{ pathname: "/account/submissions", query: { limit: limit + 50 } }}
                  scroll={false}
                >
                  {t("showOlder")}
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function InquiryRow({
  inquiry,
  format,
}: {
  inquiry: Inquiry;
  format: ReturnType<typeof useInquiryFormat>;
}) {
  const t = useTranslations("account.inquiries");
  const Icon = TYPE_ICON[inquiry.submissionType];
  const { title, preview } = format.title(inquiry);

  return (
    <li>
      <Link
        href={`/account/submissions/${inquiry._id}`}
        data-row
        className="-mx-3 block rounded-lg px-3 py-5 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring md:py-6"
      >
        <span className="flex items-baseline justify-between gap-6">
          <span className="line-clamp-1 text-base font-medium text-foreground md:text-[17px]">
            {title}
          </span>
          <time
            dateTime={new Date(inquiry.sentAt).toISOString()}
            title={format.full.format(inquiry.sentAt)}
            className="shrink-0 text-sm whitespace-nowrap tabular-nums text-muted-foreground"
          >
            {format.when(inquiry.sentAt)}
          </time>
        </span>
        {preview ? (
          <span className="mt-1.5 line-clamp-2 block max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
            {preview}
          </span>
        ) : null}
        <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
          <Icon aria-hidden className="size-3.5" />
          <span>{format.type(inquiry)}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{inquiry.reference}</span>
          <span aria-hidden>·</span>
          <StateLabel state={inquiry.state} />
          {hasDeliveryProblem(inquiry) ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[13px] font-medium text-destructive">
              {t("notDelivered")}
            </span>
          ) : null}
          {isUpcomingCallback(inquiry) ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[13px] font-medium text-foreground">
              {t("upcomingAt", { when: format.dateTime.format(inquiry.desiredAt!) })}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function EmptyState() {
  const t = useTranslations("account.inquiries");
  const links = [
    { mode: "message", label: t("empty.message") },
    { mode: "callback", label: t("empty.callback") },
    { mode: "other", label: t("empty.other") },
  ] as const;

  return (
    <div className="mt-10 border-y border-rule py-10">
      <p className="text-[15px] font-medium text-foreground">{t("empty.title")}</p>
      <p className="mt-1.5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
        {t("empty.body")}
      </p>
      <ul className="mt-6 flex flex-wrap gap-2">
        {links.map(({ mode, label }) => (
          <li key={mode}>
            <Button asChild variant="outline" size="sm" shape="pill">
              <Link href={{ pathname: "/contact", query: { mode } }}>{label}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
