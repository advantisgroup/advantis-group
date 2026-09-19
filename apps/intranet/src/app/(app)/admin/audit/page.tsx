"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Activity, Download, Plug, ScrollText, Search, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Mark } from "@/components/branding/ProviderMark";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { downloadFile, toCsv } from "@/lib/activity/export";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

type Source = "activity" | "onedrive" | "integrations" | "content";
type Range = "today" | "7d" | "30d" | "all";
type AuditEntry = FunctionReturnType<typeof api.org.auditLog.list>[number];

const DAY_MS = 24 * 60 * 60 * 1000;

function SourceIcon({ source }: { source: Source }) {
  if (source === "onedrive") return <Mark provider="onedrive" className="size-4" />;
  if (source === "integrations") return <Plug className="size-4 text-muted-foreground" />;
  if (source === "content") return <Trash2 className="size-4 text-muted-foreground" />;
  return <Activity className="size-4 text-muted-foreground" />;
}

function AuditRow({
  row,
  locale,
  highlighted,
}: {
  row: AuditEntry;
  locale: string;
  highlighted: boolean;
}) {
  const t = useTranslations("Admin");
  const ref = useRef<HTMLLIElement>(null);

  // Deep link from a notification/dashboard widget: scroll the matching
  // entry into view and give it the same warm flash used elsewhere.
  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  return (
    <li
      ref={ref}
      className={cn("flex items-start gap-3 px-4 py-3 text-sm", highlighted && "deeplink-hl")}
    >
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted"
        title={t(`auditLog.source_${row.source}`)}
      >
        <SourceIcon source={row.source} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{row.user?.name ?? t("auditLog.unknownPerson")}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {row.action}
          </code>
        </p>
        {row.target && <p className="mt-0.5 truncate text-muted-foreground">{row.target}</p>}
      </div>
      <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
        {formatTime(row.at, locale)}
      </span>
    </li>
  );
}

export default function AuditLogPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const [source, setSource] = useState<Source | "all">("all");
  const [person, setPerson] = useState("all");
  const [range, setRange] = useState<Range>("7d");
  const [search, setSearch] = useState("");

  const rows = useQuery(api.org.auditLog.list, {
    source: source === "all" ? undefined : source,
    limit: 500,
  });

  // Deep link from a notification/dashboard widget: /admin/audit?entry=<id>
  // highlights the matching row once the log has loaded.
  const highlightId = useDeepLinkId("entry");

  const people = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of rows ?? []) {
      if (row.user) byId.set(row.actorUserId, row.user.name);
    }
    return [...byId].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const since =
      range === "today"
        ? new Date().setHours(0, 0, 0, 0)
        : range === "7d"
          ? now - 7 * DAY_MS
          : range === "30d"
            ? now - 30 * DAY_MS
            : 0;
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) =>
        (highlightId === row._id || row.at >= since) &&
        (person === "all" || row.actorUserId === person) &&
        (!q ||
          row.action.toLowerCase().includes(q) ||
          (row.target ?? "").toLowerCase().includes(q)),
    );
  }, [highlightId, person, range, rows, search]);

  const days = useMemo(() => {
    const groups: { key: string; label: string; rows: AuditEntry[] }[] = [];
    for (const row of filtered) {
      const date = new Date(row.at);
      const key = date.toDateString();
      let group = groups.at(-1);
      if (group?.key !== key) {
        group = {
          key,
          label: date.toLocaleDateString(locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
          }),
          rows: [],
        };
        groups.push(group);
      }
      group.rows.push(row);
    }
    return groups;
  }, [filtered, locale]);

  function exportCsv() {
    const csv = toCsv(
      filtered.map((row) => ({
        at: new Date(row.at).toISOString(),
        source: row.source,
        person: row.user?.name ?? "",
        action: row.action,
        target: row.target ?? "",
      })),
      ["at", "source", "person", "action", "target"],
    );
    downloadFile(
      `audit-log_${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv;charset=utf-8",
      csv,
    );
  }

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeaderBar
        title={t("auditLog.title")}
        description={t("auditLog.description")}
        icon={<ScrollText />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("auditLog.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={person} onValueChange={setPerson}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("auditLog.everyone")}</SelectItem>
            {people.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setSource(v as Source | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("auditLog.allSources")}</SelectItem>
            <SelectItem value="activity">{t("auditLog.source_activity")}</SelectItem>
            <SelectItem value="onedrive">{t("auditLog.source_onedrive")}</SelectItem>
            <SelectItem value="integrations">{t("auditLog.source_integrations")}</SelectItem>
            <SelectItem value="content">{t("auditLog.source_content")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t("auditLog.rangeToday")}</SelectItem>
            <SelectItem value="7d">{t("auditLog.range7d")}</SelectItem>
            <SelectItem value="30d">{t("auditLog.range30d")}</SelectItem>
            <SelectItem value="all">{t("auditLog.rangeAll")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download />
          {t("auditLog.exportCsv")}
        </Button>
      </div>

      {rows === undefined ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title={t("noAudit")}
          action={
            (search || person !== "all" || range !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setPerson("all");
                  setRange("all");
                }}
              >
                {t("auditLog.resetFilters")}
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            {t("auditLog.count", { count: filtered.length })}
          </p>
          {days.map((day) => (
            <section key={day.key}>
              <h2 className="mb-2 text-xs font-medium text-muted-foreground">{day.label}</h2>
              <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card">
                {day.rows.map((row) => (
                  <AuditRow
                    key={row._id}
                    row={row}
                    locale={locale}
                    highlighted={row._id === highlightId}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
