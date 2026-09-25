"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { inquiryTitleParts } from "@advantis/convex/marketing/inquiry";
import { usePaginatedQuery, useQuery } from "convex/react";
import { AlertTriangle, Inbox, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { StateBadge, TYPE_ICON, senderLine } from "@/components/inquiries/shared";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useHasCapability } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
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
  const [view, setView] = useState<View>("open");
  const counts = useQuery(api.marketing.inbox.counts, canManage ? {} : "skip");
  const { results, status, loadMore } = usePaginatedQuery(
    api.marketing.inbox.list,
    canManage ? { view } : "skip",
    { initialNumItems: 40 },
  );

  if (!canManage) {
    return <EmptyState icon={<Lock />} title={t("noAccess")} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<Inbox />} />

      <CountTabs<View>
        value={view}
        onChange={setView}
        className="mt-6"
        tabs={[
          { value: "open", label: t("views.open"), count: counts?.unanswered },
          { value: "answered", label: t("views.answered"), count: counts?.answered },
          { value: "closed", label: t("views.closed") },
          { value: "failed", label: t("views.failed"), count: counts?.failed || undefined },
          { value: "all", label: t("views.all") },
        ]}
      />

      {status === "LoadingFirstPage" ? (
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

type Row = ReturnType<typeof usePaginatedQuery<typeof api.marketing.inbox.list>>["results"][number];

function InquiryRow({ inquiry }: { inquiry: Row }) {
  const t = useTranslations("Inquiries");
  const locale = useLocale();
  const router = useRouter();
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
      <button
        type="button"
        onClick={() => router.push(`/inquiries/${inquiry._id}`)}
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
        </span>
        <StateBadge state={inquiry.state} className="justify-self-end" />
      </button>
    </li>
  );
}
