"use client";

import { Suspense, useMemo, useState } from "react";

import { useParams, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { dashboardHome, usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { PerformanceBackLink } from "@/components/performance/PerformanceBackLink";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/lib/format";

const LIST_KEYS = ["analysis30", "leads14", "opp_overdue", "opp30", "opps14"] as const;
type ListKey = (typeof LIST_KEYS)[number];

interface LeadItem {
  _id: string;
  owner: string;
  status?: string;
  statusDetails?: string;
  createDate?: string;
  lastActivity?: string;
  ageDays: number | null;
  inactiveDays: number | null;
}

interface OppItem {
  _id: string;
  owner: string;
  stage?: string;
  stageDetails?: string;
  createdDate?: string;
  closeDate?: string;
  customerNumber?: string;
  lastActivity?: string;
  ageDays: number | null;
  inactiveDays: number | null;
  overdueDays?: number | null;
}

const ALL_EMPLOYEES = "__all__";
const BACK_TABS = new Set(["ueberblick", "calls", "team", "interaktionen", "entwicklung"]);

export default function DrilldownPage() {
  // Suspense because the back link reads `?from=` via useSearchParams.
  return (
    <Suspense fallback={<PerformancePageSkeleton />}>
      <DrilldownPageInner />
    </Suspense>
  );
}

function DrilldownPageInner() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const params = useParams<{ key: string }>();
  const validKey = (LIST_KEYS as readonly string[]).includes(params.key)
    ? (params.key as ListKey)
    : null;
  const { me, dashboard } = usePerformanceAccess();
  const [empFilter, setEmpFilter] = useState<string>(ALL_EMPLOYEES);
  // Back to the tab the list was opened from (`?from=<tab>` on the link).
  const from = useSearchParams().get("from");
  const backHref =
    from && BACK_TABS.has(from) ? `/performance/${from}` : dashboardHome(dashboard ?? null);
  const fmtDate = (iso: string | undefined) => (iso ? formatIsoDate(iso, locale) : "–");

  const data = useQuery(
    api.performance.queries.drilldown,
    me && validKey ? { key: validKey, companyId: dashboard?.companyId } : "skip",
  );

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const item of data?.items ?? []) {
      if (item.owner) set.add(item.owner);
    }
    return [...set].sort();
  }, [data?.items]);

  const items = useMemo(() => {
    const all = (data?.items ?? []) as unknown as (LeadItem | OppItem)[];
    if (empFilter === ALL_EMPLOYEES) return all;
    return all.filter((i) => i.owner === empFilter);
  }, [data?.items, empFilter]);

  if (me === undefined) return <PerformancePageSkeleton />;

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader />

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
        <PerformanceBackLink href={backHref} />
        {!validKey ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {t("listNotFound")}
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold">{t(`list.${validKey}.title`)}</h1>
              <p className="text-sm text-muted-foreground">{t(`list.${validKey}.desc`)}</p>
              {data?.reportDate && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("listAsOf", {
                    date: formatIsoDate(data.reportDate, locale),
                  })}
                </p>
              )}
            </div>

            {owners.length > 1 && (
              <Select value={empFilter} onValueChange={setEmpFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_EMPLOYEES}>{t("listEmpFilterAll")}</SelectItem>
                  {owners.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("listCount", { count: items.length })}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {!data ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-md" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("listEmpty")}</p>
                ) : data.kind === "lead" ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colOwner")}</TableHead>
                        <TableHead>{t("colStatus")}</TableHead>
                        <TableHead>{t("colStatusDetails")}</TableHead>
                        <TableHead>{t("colCreated")}</TableHead>
                        <TableHead>{t("colLastActivity")}</TableHead>
                        <TableHead className="text-right">{t("colAgeDays")}</TableHead>
                        <TableHead className="text-right">{t("colInactiveDays")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(items as LeadItem[]).map((item) => (
                        <TableRow key={item._id}>
                          <TableCell className="font-medium">{item.owner}</TableCell>
                          <TableCell>{item.status ?? "–"}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {item.statusDetails ?? "–"}
                          </TableCell>
                          <TableCell>{fmtDate(item.createDate)}</TableCell>
                          <TableCell>{fmtDate(item.lastActivity)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.ageDays ?? "–"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.inactiveDays ?? "–"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colOwner")}</TableHead>
                        <TableHead>{t("colStage")}</TableHead>
                        <TableHead>{t("colStageDetails")}</TableHead>
                        <TableHead>{t("colCreated")}</TableHead>
                        <TableHead>{t("colCloseDate")}</TableHead>
                        {data?.hasCustomerNo && <TableHead>{t("colCustomerNumber")}</TableHead>}
                        <TableHead className="text-right">{t("colAgeDays")}</TableHead>
                        <TableHead className="text-right">{t("colInactiveDays")}</TableHead>
                        {validKey === "opp_overdue" && (
                          <TableHead className="text-right">{t("colOverdueDays")}</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(items as OppItem[]).map((item) => (
                        <TableRow key={item._id}>
                          <TableCell className="font-medium">{item.owner}</TableCell>
                          <TableCell>{item.stage ?? "–"}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {item.stageDetails ?? "–"}
                          </TableCell>
                          <TableCell>{fmtDate(item.createdDate)}</TableCell>
                          <TableCell>{fmtDate(item.closeDate)}</TableCell>
                          {data?.hasCustomerNo && (
                            <TableCell>{item.customerNumber ?? "–"}</TableCell>
                          )}
                          <TableCell className="text-right tabular-nums">
                            {item.ageDays ?? "–"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.inactiveDays ?? "–"}
                          </TableCell>
                          {validKey === "opp_overdue" && (
                            <TableCell className="text-right tabular-nums">
                              {item.overdueDays ?? "–"}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
      <PerformanceBottomTabs />
    </div>
  );
}
