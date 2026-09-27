"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ChevronRight,
  ClipboardList,
  ClipboardX,
  Lightbulb,
  type LucideIcon,
  Plane,
  UploadCloud,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { localIsoDate } from "@/lib/absences";
import { formatIsoDate } from "@/lib/format";
import { type MyAbsence, useMyAbsences } from "@/lib/absences-api";

type State = "open" | "active" | "done" | "declined";
type Kind = "ticket" | "suggestion" | "error" | "upload" | "absence";

interface Row {
  kind: Kind;
  id: string;
  title: string;
  state: State;
  status: string;
  updatedAt: number;
  href: string;
}

const KIND_ICON: Record<Kind, LucideIcon> = {
  ticket: Wrench,
  suggestion: Lightbulb,
  error: ClipboardX,
  upload: UploadCloud,
  absence: Plane,
};

const STATE_BADGE: Record<State, "secondary" | "warning" | "success" | "muted"> = {
  open: "secondary",
  active: "warning",
  done: "success",
  declined: "muted",
};

/** A few statuses say more than their state does ("withdrawn" isn't the
 *  same as "declined" to the person who withdrew it). */
const STATUS_OVERRIDE: Partial<Record<string, string>> = {
  withdrawn: "statusWithdrawn",
  failed: "statusFailed",
  cancelled: "statusCancelled",
};

const ABSENCE_STATE: Record<MyAbsence["status"], State> = {
  pending: "open",
  approved: "done",
  denied: "declined",
  cancelled: "declined",
};

/**
 * Everything I've asked for, wherever I asked for it — an IT ticket, a
 * suggestion, an error report, a file upload, time off — and where each one
 * stands, so nobody has to remember which of five places to check.
 */
export default function MyRequestsPage() {
  const user = useCurrentUser();
  // Absences come from Clockodo, and only for people linked to it — the
  // Clockodo call only happens inside the wrapper that needs it.
  return user.clockodoUserId ? <WithAbsences /> : <RequestsView absences={NO_ROWS} />;
}

const NO_ROWS: Row[] = [];

function WithAbsences() {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const { absences } = useMyAbsences();
  const rows = useMemo(
    () =>
      (absences ?? []).map(
        (a): Row => ({
          kind: "absence",
          id: a.id,
          title: `${t(a.type)}: ${formatIsoDate(a.startDate, locale)}${
            a.endDate !== a.startDate ? ` – ${formatIsoDate(a.endDate, locale)}` : ""
          }`,
          state: ABSENCE_STATE[a.status],
          status: a.status,
          // Clockodo doesn't say when a request last changed; the first day
          // off is the date people think of it by.
          updatedAt: new Date(`${a.startDate}T00:00:00`).getTime(),
          href: "/clockodo/requests",
        }),
      ),
    [absences, t, locale],
  );
  return <RequestsView absences={rows} />;
}

function RequestsView({ absences }: { absences: Row[] }) {
  const t = useTranslations("Requests");
  const requests = useQuery(api.people.requests.mine);
  const [tab, setTab] = useState<"open" | "closed">("open");

  const rows = useMemo(() => {
    if (!requests) return undefined;
    return [...requests, ...absences].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [requests, absences]);

  const open = rows?.filter((r) => r.state === "open" || r.state === "active") ?? [];
  const closed = rows?.filter((r) => r.state === "done" || r.state === "declined") ?? [];
  const shown = tab === "open" ? open : closed;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <PageHeader title={t("title")} description={t("description")} icon={<ClipboardList />} />
      <CountTabs
        tabs={[
          { value: "open", label: t("tabOpen"), count: rows ? open.length : undefined },
          { value: "closed", label: t("tabClosed"), count: rows ? closed.length : undefined },
        ]}
        value={tab}
        onChange={setTab}
      />
      {rows === undefined ? (
        <SkeletonRows rows={4} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={tab === "open" ? t("emptyOpen") : t("emptyClosed")}
          description={rows.length === 0 ? t("emptyHint") : undefined}
          action={
            rows.length === 0 ? (
              <Button size="sm" variant="outline" asChild>
                <Link href="/help">{t("emptyAction")}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
          {shown.map((row) => (
            <RequestRow key={`${row.kind}:${row.id}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestRow({ row }: { row: Row }) {
  const t = useTranslations("Requests");
  const locale = useLocale();
  const Icon = KIND_ICON[row.kind];
  const statusKey = STATUS_OVERRIDE[row.status] ?? `state.${row.state}`;
  return (
    <li>
      <Link
        href={row.href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{row.title}</span>
          <span className="block text-[13px] text-muted-foreground">
            {t(`kind.${row.kind}`)} ·{" "}
            {t("updated", {
              date: formatIsoDate(localIsoDate(new Date(row.updatedAt)), locale),
            })}
          </span>
        </span>
        <Badge variant={STATE_BADGE[row.state]} className="shrink-0">
          {t(statusKey)}
        </Badge>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
