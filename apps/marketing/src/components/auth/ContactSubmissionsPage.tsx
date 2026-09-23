"use client";

import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";

import { useClerk } from "@clerk/nextjs";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
  Search,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Display, Eyebrow } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { type ContactMode, type ContactSubmissionRecord } from "@/types/contact";

const TYPES: readonly ContactMode[] = ["message", "callback", "other"];

const TYPE_ICON: Record<ContactMode, ComponentType<{ className?: string }>> = {
  message: MessageSquare,
  callback: Phone,
  other: HelpCircle,
};

// callback times come in as whatever the form sent: epoch seconds/ms or a local datetime string
const parseSubmissionDate = (value: string) => {
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    const date = new Date(trimmed.length <= 10 ? Number(trimmed) * 1000 : Number(trimmed));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isUpcoming = (submission: ContactSubmissionRecord) => {
  const at = submission.desiredDateTime ? parseSubmissionDate(submission.desiredDateTime) : null;
  return at !== null && at.getTime() > Date.now();
};

const relativeTime = (from: number, locale: string) => {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((from - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];

  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
};

const matches = (submission: ContactSubmissionRecord, query: string) =>
  [submission.subject, submission.message, submission.notes, submission.company, submission.topic]
    .filter(Boolean)
    .some((field) => field!.toLowerCase().includes(query));

/**
 * The customer's own panel: everything they sent us while signed in.
 *
 * Built like an inbox — numbers up top, the list on the left, the open
 * inquiry on the right. On a phone the pane has nowhere to go, so the open
 * inquiry unfolds under its own row instead.
 */
export const ContactSubmissionsPage = () => {
  const locale = useLocale();
  const t = useTranslations("auth.submissions");
  const { openUserProfile } = useClerk();
  const [submissions, setSubmissions] = useState<ContactSubmissionRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<ContactMode | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/submissions", { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed with status ${response.status}`);

      const data = (await response.json()) as { submissions?: ContactSubmissionRecord[] };
      const sorted = [...(data.submissions ?? [])].sort((a, b) => b.sentAt - a.sentAt);
      setSubmissions(sorted);
      setSelectedId((current) => current ?? sorted[0]?._id ?? null);
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load contact submissions", error);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const shortDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
    [locale],
  );
  const monthFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale],
  );

  const summary = useMemo(() => {
    const callbacks = submissions.filter((s) => s.submissionType === "callback");
    return {
      counts: Object.fromEntries(
        TYPES.map((type) => [type, submissions.filter((s) => s.submissionType === type).length]),
      ) as Record<ContactMode, number>,
      callbacks: callbacks.length,
      upcoming: callbacks.filter(isUpcoming).length,
      failed: submissions.filter((s) => s.status === "failed").length,
      lastSentAt: submissions[0]?.sentAt,
    };
  }, [submissions]);

  // grouped by month so a long history reads like a log, newest first
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = submissions.filter(
      (s) => (!filter || s.submissionType === filter) && (!needle || matches(s, needle)),
    );
    const byMonth = new Map<string, ContactSubmissionRecord[]>();

    for (const submission of visible) {
      const key = monthFormat.format(new Date(submission.sentAt));
      byMonth.set(key, [...(byMonth.get(key) ?? []), submission]);
    }
    return [...byMonth.entries()];
  }, [filter, query, submissions, monthFormat]);

  const selected = submissions.find((s) => s._id === selectedId) ?? null;

  const select = (id: string) => {
    // on a phone tapping the open row folds it away; the desktop pane always shows one
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    setSelectedId((current) => (current === id && !wide ? null : id));
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-28 pb-20 md:px-10 md:pt-36 md:pb-24">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Eyebrow>{t("badge")}</Eyebrow>
          <Display as="h1" size="md" className="mt-3">
            {t("title")}
          </Display>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild size="sm" className="rounded-full px-4">
            <Link href="/contact">{t("newSubmissionCta")}</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full px-4"
            onClick={() => void openUserProfile()}
          >
            {t("accountCta")}
          </Button>
        </div>
      </header>

      {status === "loading" ? (
        <div aria-busy className="mt-10 space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
          <span className="sr-only">{t("loading")}</span>
        </div>
      ) : status === "error" ? (
        <div className="mt-10 rounded-xl border border-rule bg-card p-6">
          <p className="font-medium text-foreground">{t("errorTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("errorDescription")}</p>
          <Button type="button" size="sm" variant="outline" className="mt-4" onClick={load}>
            {t("retry")}
          </Button>
        </div>
      ) : submissions.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-rule-strong p-8 text-center sm:p-12">
          <Inbox aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-4 font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <Button asChild size="sm" className="mt-6 rounded-full px-4">
            <Link href="/contact">{t("newSubmissionCta")}</Link>
          </Button>
        </div>
      ) : (
        <>
          <dl className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={Inbox} label={t("summary.total")} value={submissions.length} />
            <StatTile
              icon={Clock3}
              label={t("summary.lastSent")}
              value={summary.lastSentAt ? relativeTime(summary.lastSentAt, locale) : "—"}
              small
            />
            <StatTile
              icon={Phone}
              label={t("summary.callbacks")}
              value={summary.callbacks}
              note={summary.upcoming ? t("summary.upcoming", { count: summary.upcoming }) : null}
            />
            <StatTile
              icon={summary.failed ? AlertCircle : CheckCircle2}
              label={t("summary.delivery")}
              value={
                summary.failed
                  ? t("summary.issues", { count: summary.failed })
                  : t("summary.allDelivered")
              }
              tone={summary.failed ? "failed" : "ok"}
              small
            />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section className="min-w-0 overflow-hidden rounded-xl border border-rule bg-card">
              <div className="space-y-3 border-b border-rule p-3">
                <label className="relative block">
                  <span className="sr-only">{t("search")}</span>
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("search")}
                    className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-sm"
                  />
                </label>
                <div role="group" className="flex flex-wrap gap-1">
                  {([null, ...TYPES] as const).map((type) => {
                    const count = type ? summary.counts[type] : submissions.length;
                    if (type && count === 0) return null;
                    return (
                      <button
                        key={type ?? "all"}
                        type="button"
                        aria-pressed={filter === type}
                        onClick={() => setFilter(type)}
                        className={cn(
                          "inline-flex min-h-9 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors",
                          filter === type
                            ? "bg-accent font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {type ? t(`types.${type}`) : t("filterAll")}
                        <span className="tabular-nums text-muted-foreground/70">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {groups.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("noMatches")}
                </p>
              ) : (
                groups.map(([month, items]) => (
                  <div key={month}>
                    <h2 className="border-b border-rule bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                      {month}
                    </h2>
                    <ul>
                      {items.map((submission) => {
                        const open = submission._id === selectedId;
                        return (
                          <li key={submission._id} className="border-b border-rule last:border-b-0">
                            <ListRow
                              submission={submission}
                              date={shortDate.format(new Date(submission.sentAt))}
                              open={open}
                              onSelect={() => select(submission._id)}
                            />
                            {open ? (
                              <div className="border-t border-rule px-4 pt-4 pb-5 lg:hidden">
                                <SubmissionDetail submission={submission} dateTime={dateTime} />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </section>

            <aside className="hidden min-w-0 lg:block">
              <div className="sticky top-24 rounded-xl border border-rule bg-card p-6">
                {selected ? (
                  <SubmissionDetail submission={selected} dateTime={dateTime} />
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    {t("selectHint")}
                  </p>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
};

const StatTile = ({
  icon: Icon,
  label,
  value,
  note,
  tone,
  small = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  note?: string | null;
  tone?: "ok" | "failed";
  small?: boolean;
}) => (
  <div className="min-w-0 rounded-xl border border-rule bg-card p-4 md:p-5">
    <div className="flex items-start justify-between gap-2">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          tone === "failed"
            ? "text-destructive"
            : tone === "ok"
              ? "text-success"
              : "text-muted-foreground",
        )}
      />
    </div>
    <dd
      className={cn(
        "mt-3 font-display font-medium leading-tight",
        small ? "text-base md:text-lg" : "text-2xl tabular-nums md:text-3xl",
      )}
    >
      {value}
    </dd>
    {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
  </div>
);

const ListRow = ({
  submission,
  date,
  open,
  onSelect,
}: {
  submission: ContactSubmissionRecord;
  date: string;
  open: boolean;
  onSelect: () => void;
}) => {
  const t = useTranslations("auth.submissions");
  const Icon = TYPE_ICON[submission.submissionType];
  const failed = submission.status === "failed";

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
        open ? "bg-accent" : "hover:bg-muted/50",
      )}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-foreground">{submission.subject}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{date}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{t(`types.${submission.submissionType}`)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", failed ? "bg-destructive" : "bg-success")}
            />
            {t(`status.${submission.status}`)}
          </span>
          {isUpcoming(submission) ? (
            <span className="rounded-full bg-background px-2 py-0.5 font-medium text-foreground">
              {t("upcoming")}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
};

const SubmissionDetail = ({
  submission,
  dateTime,
}: {
  submission: ContactSubmissionRecord;
  dateTime: Intl.DateTimeFormat;
}) => {
  const t = useTranslations("auth.submissions");
  const desired = submission.desiredDateTime
    ? parseSubmissionDate(submission.desiredDateTime)
    : null;
  const failed = submission.status === "failed";
  const isCallback = submission.submissionType === "callback";
  const name = `${submission.firstName} ${submission.lastName}`.trim();
  const inbox = process.env.NEXT_PUBLIC_EMAIL_ADRESS;
  const followUpSubject = `Re: ${submission.subject}${submission.messageId ? ` (${submission.messageId})` : ""}`;

  const details = [
    { label: t("name"), value: name },
    { label: t("contactEmail"), value: submission.email },
    { label: t("phone"), value: submission.phone },
    { label: t("company"), value: submission.company },
    {
      label: t("desiredTime"),
      value: submission.desiredDateTime
        ? desired
          ? dateTime.format(desired)
          : submission.desiredDateTime
        : undefined,
    },
    { label: t("topic"), value: submission.topic },
    { label: t("accountEmail"), value: submission.accountEmail },
    { label: t("reference"), value: submission.messageId },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <article>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <span>{t(`types.${submission.submissionType}`)}</span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", failed ? "bg-destructive" : "bg-success")}
          />
          {t(`status.${submission.status}`)}
        </span>
        <span aria-hidden>·</span>
        <time dateTime={new Date(submission.sentAt).toISOString()}>
          {dateTime.format(new Date(submission.sentAt))}
        </time>
      </p>
      <h2 className="mt-2 text-lg font-medium text-foreground [overflow-wrap:anywhere] md:text-xl">
        {submission.subject}
      </h2>

      {/* a callback's `message` is the summary we mail the team; the details
          below already cover it, so only the person's own notes are shown */}
      <div className="mt-4">
        {isCallback ? (
          submission.notes ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {submission.notes}
            </p>
          ) : null
        ) : (
          <>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {submission.message}
            </p>
            {submission.notes ? (
              <p className="mt-4 whitespace-pre-wrap border-l-2 border-rule pl-4 text-sm leading-relaxed text-muted-foreground">
                {submission.notes}
              </p>
            ) : null}
          </>
        )}
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-rule pt-5 text-sm sm:grid-cols-2">
        {details.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-[13px] text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 text-foreground [overflow-wrap:anywhere]">{item.value}</dd>
          </div>
        ))}
      </dl>

      {submission.error ? (
        <p className="mt-5 rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
          <span className="font-medium">{t("deliveryIssue")}:</span> {submission.error}
        </p>
      ) : null}

      {inbox ? (
        <Button asChild size="sm" variant="outline" className="mt-6 rounded-full px-4">
          <a href={`mailto:${inbox}?subject=${encodeURIComponent(followUpSubject)}`}>
            <Mail />
            {t("followUp")}
          </a>
        </Button>
      ) : null}
    </article>
  );
};
