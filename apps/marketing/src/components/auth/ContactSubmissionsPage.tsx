"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useClerk } from "@clerk/nextjs";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Display, Eyebrow } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { type ContactMode, type ContactSubmissionRecord } from "@/types/contact";

const TYPES: readonly ContactMode[] = ["message", "callback", "other"];

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

export const ContactSubmissionsPage = () => {
  const locale = useLocale();
  const t = useTranslations("auth.submissions");
  const { openUserProfile } = useClerk();
  const [submissions, setSubmissions] = useState<ContactSubmissionRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<ContactMode | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/submissions", { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed with status ${response.status}`);

      const data = (await response.json()) as { submissions?: ContactSubmissionRecord[] };
      setSubmissions([...(data.submissions ?? [])].sort((a, b) => b.sentAt - a.sentAt));
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
  const monthFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale],
  );

  const summary = useMemo(() => {
    const now = Date.now();
    const callbacks = submissions.filter((s) => s.submissionType === "callback");

    return {
      counts: Object.fromEntries(
        TYPES.map((type) => [type, submissions.filter((s) => s.submissionType === type).length]),
      ) as Record<ContactMode, number>,
      callbacks: callbacks.length,
      upcoming: callbacks.filter((s) => {
        const at = s.desiredDateTime ? parseSubmissionDate(s.desiredDateTime) : null;
        return at !== null && at.getTime() > now;
      }).length,
      failed: submissions.filter((s) => s.status === "failed").length,
      lastSentAt: submissions[0]?.sentAt,
    };
  }, [submissions]);

  // grouped by month so a long history reads like a log, newest first
  const groups = useMemo(() => {
    const visible = filter ? submissions.filter((s) => s.submissionType === filter) : submissions;
    const byMonth = new Map<string, ContactSubmissionRecord[]>();

    for (const submission of visible) {
      const key = monthFormat.format(new Date(submission.sentAt));
      byMonth.set(key, [...(byMonth.get(key) ?? []), submission]);
    }
    return [...byMonth.entries()];
  }, [filter, submissions, monthFormat]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-32 pb-24 md:px-10 md:pt-40">
      <header>
        <Eyebrow>{t("badge")}</Eyebrow>
        <Display as="h1" size="md" className="mt-3">
          {t("title")}
        </Display>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          {t("subtitle")}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild size="sm" className="rounded-full px-4">
            <Link href="/contact">{t("newSubmissionCta")}</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full px-4"
            onClick={() => void openUserProfile()}
          >
            {t("accountCta")}
          </Button>
        </div>
      </header>

      {status === "loading" ? (
        <ul aria-busy className="mt-14 border-t border-rule">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex flex-col gap-2.5 border-b border-rule py-5">
              <span className="h-3 w-32 animate-pulse rounded bg-muted" />
              <span className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </li>
          ))}
          <span className="sr-only">{t("loading")}</span>
        </ul>
      ) : status === "error" ? (
        <div className="mt-14 border-t border-rule pt-8">
          <p className="font-medium text-foreground">{t("errorTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("errorDescription")}</p>
          <Button type="button" size="sm" variant="outline" className="mt-4" onClick={load}>
            {t("retry")}
          </Button>
        </div>
      ) : submissions.length === 0 ? (
        <div className="mt-14 border-t border-rule pt-8">
          <p className="font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-14 grid grid-cols-2 border-y border-rule sm:grid-cols-4">
            <SummaryItem label={t("summary.total")} value={submissions.length} />
            <SummaryItem
              label={t("summary.lastSent")}
              value={summary.lastSentAt ? relativeTime(summary.lastSentAt, locale) : "—"}
              small
            />
            <SummaryItem
              label={t("summary.callbacks")}
              value={summary.callbacks}
              note={summary.upcoming ? t("summary.upcoming", { count: summary.upcoming }) : null}
            />
            <SummaryItem
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

          <div role="group" className="-mx-2 mt-8 flex flex-wrap gap-1">
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

          {groups.map(([month, items]) => (
            <section key={month} className="mt-8">
              <h2 className="text-[13px] font-medium text-muted-foreground">{month}</h2>
              <ul className="mt-2 border-t border-rule">
                {items.map((submission) => (
                  <SubmissionRow key={submission._id} submission={submission} dateTime={dateTime} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
};

const SummaryItem = ({
  label,
  value,
  note,
  tone,
  small = false,
}: {
  label: string;
  value: string | number;
  note?: string | null;
  tone?: "ok" | "failed";
  small?: boolean;
}) => (
  <div className="py-5 pr-4 sm:border-l sm:border-rule sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
    <dt className="text-[13px] text-muted-foreground">{label}</dt>
    <dd
      className={cn(
        "mt-2 flex items-center gap-2 font-display font-medium leading-tight",
        small ? "text-lg" : "text-3xl tabular-nums",
      )}
    >
      {tone ? (
        <span
          aria-hidden
          className={cn("size-2 rounded-full", tone === "failed" ? "bg-destructive" : "bg-success")}
        />
      ) : null}
      {value}
    </dd>
    {note ? <p className="mt-1 text-[13px] text-muted-foreground">{note}</p> : null}
  </div>
);

const SubmissionRow = ({
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
  const upcoming = desired !== null && desired.getTime() > Date.now();
  const failed = submission.status === "failed";
  const isCallback = submission.submissionType === "callback";
  const name = `${submission.firstName} ${submission.lastName}`.trim();

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
    <li className="border-b border-rule">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-4 py-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
              <span>{t(`types.${submission.submissionType}`)}</span>
              <span aria-hidden>·</span>
              <time dateTime={new Date(submission.sentAt).toISOString()}>
                {dateTime.format(new Date(submission.sentAt))}
              </time>
              {upcoming ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-foreground">
                  {t("upcoming")}
                </span>
              ) : null}
            </p>
            <h3 className="mt-1 truncate text-base font-medium text-foreground group-open:whitespace-normal">
              {submission.subject}
            </h3>
          </div>
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", failed ? "bg-destructive" : "bg-success")}
            />
            {t(`status.${submission.status}`)}
          </span>
          <ChevronDown
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="pb-6">
          {/* a callback's `message` is the summary we mail the team; the details
              below already cover it, so only the person's own notes are shown */}
          {isCallback ? (
            submission.notes ? (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                {submission.notes}
              </p>
            ) : null
          ) : (
            <>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                {submission.message}
              </p>
              {submission.notes ? (
                <p className="mt-4 whitespace-pre-wrap border-l-2 border-rule pl-4 text-sm leading-relaxed text-muted-foreground">
                  {submission.notes}
                </p>
              ) : null}
            </>
          )}

          <dl className="mt-6 first:mt-0 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {details.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-[13px] text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 truncate text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>

          {submission.error ? (
            <p className="mt-5 text-sm text-destructive">
              <span className="font-medium">{t("deliveryIssue")}:</span> {submission.error}
            </p>
          ) : null}
        </div>
      </details>
    </li>
  );
};
