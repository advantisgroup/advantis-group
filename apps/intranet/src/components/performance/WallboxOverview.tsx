"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  Briefcase,
  CircleDot,
  Hourglass,
  List,
  Trophy,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { MetricTile } from "@/components/performance/MetricTile";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { DeltaBadge, fmtNum, fmtPct } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { WallboxOppListDialog, winRate } from "@/components/performance/WallboxOppList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Overview = FunctionReturnType<typeof api.performance.wallbox.overview>;
type Totals = Overview["totals"];

interface OppTarget {
  companyId: Id<"companies">;
  by: "acquirer" | "owner";
  name: string;
  employeeId?: Id<"performanceEmployees">;
}

/** Campaign name and the date of each of the two reports — flagged when they
 * aren't from the same day, since the numbers then don't quite line up. */
function ReportDates({ data }: { data: Overview }) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const reports = [
    { label: t("wallbox.membersReport"), date: data.membersDate },
    { label: t("wallbox.oppsReport"), date: data.oppsDate },
  ];
  const outOfStep = data.membersDate && data.oppsDate && data.membersDate !== data.oppsDate;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {data.campaign && <span className="font-medium">{data.campaign}</span>}
      {reports.map((r) =>
        r.date ? (
          <span key={r.label} className="text-muted-foreground">
            {t("wallbox.asOf", { report: r.label, date: formatIsoDate(r.date, locale) })}
          </span>
        ) : (
          <Badge key={r.label} variant="warning">
            <AlertTriangle className="h-3 w-3" />
            {t("wallbox.missing", { report: r.label })}
          </Badge>
        ),
      )}
      {outOfStep && (
        <InfoTip text={t("wallbox.outOfStepHint")}>
          <Badge variant="warning">
            <AlertTriangle className="h-3 w-3" />
            {t("wallbox.outOfStep")}
          </Badge>
        </InfoTip>
      )}
    </div>
  );
}

function delta(totals: Totals, previous: Totals | null, key: keyof Totals): number | undefined {
  const cur = totals[key];
  const prev = previous?.[key];
  return cur !== null && prev !== null && prev !== undefined ? cur - prev : undefined;
}

function KpiTiles({ data }: { data: Overview }) {
  const t = useTranslations("Performance");
  const { totals, previous } = data;
  const tiles = [
    { key: "members", icon: Users, label: t("wallbox.kpiMembers") },
    { key: "inProgress", icon: Hourglass, label: t("wallbox.inProgress") },
    { key: "opps", icon: Briefcase, label: t("wallbox.opps") },
    { key: "open", icon: CircleDot, label: t("wallbox.open") },
    { key: "won", icon: Trophy, label: t("wallbox.won") },
    { key: "lost", icon: XCircle, label: t("wallbox.lost"), invert: true },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <MetricTile
          key={tile.key}
          icon={tile.icon}
          label={tile.label}
          value={fmtNum(totals[tile.key])}
          delta={delta(totals, previous, tile.key)}
          invert={"invert" in tile ? tile.invert : undefined}
        />
      ))}
    </div>
  );
}

/** Every member status of the campaign as a bar, with its EV share. */
function MemberStatuses({ statuses }: { statuses: Overview["statuses"] }) {
  const t = useTranslations("Performance");
  const max = Math.max(1, ...statuses.map((s) => s.count));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="text-base">{t("wallbox.statusTitle")}</CardTitle>
        <InfoTip text={t("wallbox.evHint")} />
      </CardHeader>
      <CardContent>
        {statuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("wallbox.missing", { report: t("wallbox.membersReport") })}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
            {statuses.map((s) => (
              <li key={s.status} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{s.status}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{fmtNum(s.count)}</span>
                    {s.ev > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t("wallbox.evCount", { count: fmtNum(s.ev) })}
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/35"
                    style={{ width: `${(s.count / max) * 100}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary"
                    style={{ width: `${(s.ev / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface CountRow {
  opps: number;
  open: number;
  won: number;
  lost: number;
}

function sumOf<T extends CountRow>(rows: T[]): CountRow {
  return rows.reduce(
    (a, r) => ({
      opps: a.opps + r.opps,
      open: a.open + r.open,
      won: a.won + r.won,
      lost: a.lost + r.lost,
    }),
    { opps: 0, open: 0, won: 0, lost: 0 },
  );
}

/** Opportunities / Offen / Won / Lost / Quote cells shared by both tables. */
function CountCells({ row, oppsDelta }: { row: CountRow; oppsDelta?: number | null }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">
        <span className="inline-flex items-center justify-end gap-1.5">
          {fmtNum(row.opps)}
          <DeltaBadge value={oppsDelta} />
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtNum(row.open)}</TableCell>
      <TableCell className="text-right tabular-nums text-ok">{fmtNum(row.won)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmtNum(row.lost)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {fmtPct(winRate(row.won, row.lost))}
      </TableCell>
    </>
  );
}

function CountHeads() {
  const t = useTranslations("Performance");
  return (
    <>
      <TableHead className="text-right">{t("wallbox.opps")}</TableHead>
      <TableHead className="text-right">{t("wallbox.open")}</TableHead>
      <TableHead className="text-right">{t("wallbox.won")}</TableHead>
      <TableHead className="text-right">{t("wallbox.lost")}</TableHead>
      <TableHead className="text-right">
        <span className="inline-flex items-center gap-1">
          {t("wallbox.rate")}
          <InfoTip text={t("wallbox.rateHint")} />
        </span>
      </TableHead>
    </>
  );
}

function ShowOppsButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const t = useTranslations("Performance");
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title={t("wallbox.showOpps")}
      aria-label={t("wallbox.showOpps")}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <List className="h-3.5 w-3.5" />
    </Button>
  );
}

function PeopleTable({
  data,
  companyId,
  onShowOpps,
}: {
  data: Overview;
  companyId: Id<"companies">;
  onShowOpps: (target: OppTarget) => void;
}) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const rows = data.people;
  const sum = sumOf(rows);
  const inProgress = rows.reduce((a, r) => a + r.inProgress, 0);
  const inProgressEv = rows.reduce((a, r) => a + r.inProgressEv, 0);
  const href = (id: string) => `/performance/mitarbeiter/${id}/wallbox`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("wallbox.peopleTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 sm:p-6 sm:pt-0">
        {rows.length === 0 ? (
          <EmptyState inline title={t("wallbox.noRows")} />
        ) : (
          <Table className="whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead className="text-right">{t("wallbox.inProgress")}</TableHead>
                <CountHeads />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.employeeId ?? r.name}
                  className={cn(r.employeeId && "cursor-pointer hover:bg-muted/50")}
                  onClick={r.employeeId ? () => router.push(href(r.employeeId!)) : undefined}
                >
                  <TableCell className="font-medium">
                    {r.employeeId ? (
                      <Link
                        href={href(r.employeeId)}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      r.name
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(r.inProgress)}
                    {r.inProgressEv > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {t("wallbox.evCount", { count: fmtNum(r.inProgressEv) })}
                      </span>
                    )}
                  </TableCell>
                  <CountCells row={r} oppsDelta={r.oppsDelta} />
                  <TableCell className="text-right">
                    <ShowOppsButton
                      disabled={r.opps === 0}
                      onClick={() =>
                        onShowOpps({
                          companyId,
                          by: "acquirer",
                          name: r.name,
                          employeeId: r.employeeId ?? undefined,
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">{t("wallbox.sum")}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(inProgress)}
                  {inProgressEv > 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {t("wallbox.evCount", { count: fmtNum(inProgressEv) })}
                    </span>
                  )}
                </TableCell>
                <CountCells row={sum} />
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OwnersTable({
  data,
  companyId,
  onShowOpps,
}: {
  data: Overview;
  companyId: Id<"companies">;
  onShowOpps: (target: OppTarget) => void;
}) {
  const t = useTranslations("Performance");
  const rows = data.owners;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("wallbox.ownersTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 sm:p-6 sm:pt-0">
        {rows.length === 0 ? (
          <EmptyState inline title={t("wallbox.noRows")} />
        ) : (
          <Table className="whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <CountHeads />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <CountCells row={r} />
                  <TableCell className="text-right">
                    <ShowOppsButton
                      disabled={r.opps === 0}
                      onClick={() => onShowOpps({ companyId, by: "owner", name: r.name })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">{t("wallbox.sum")}</TableCell>
                <CountCells row={sumOf(rows)} />
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Überblick of a Wallbox dashboard: the campaign's member status and its
 * opportunities, per employee (Acquired By) and per field-sales owner. */
export function WallboxOverview({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("Performance");
  const isAdmin = usePerformanceAccess().me?.isAdmin ?? false;
  const data = useQuery(api.performance.wallbox.overview, { companyId });
  const [oppTarget, setOppTarget] = useState<OppTarget | null>(null);

  if (!data) return <PerformanceContentSkeleton />;

  if (!data.membersDate && !data.oppsDate) {
    return (
      <EmptyState
        icon={<Upload />}
        title={t("wallbox.emptyTitle")}
        description={t("wallbox.emptyBody")}
        action={
          isAdmin && (
            <Link href="/performance/upload">
              <Button size="sm">
                <Upload className="mr-2 h-4 w-4" />
                {t("uploadLink")}
              </Button>
            </Link>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <ReportDates data={data} />
      <KpiTiles data={data} />
      <MemberStatuses statuses={data.statuses} />
      <PeopleTable data={data} companyId={companyId} onShowOpps={setOppTarget} />
      <OwnersTable data={data} companyId={companyId} onShowOpps={setOppTarget} />
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t("wallbox.footnote")}</p>
        {data.previous && <p>{t("wallbox.deltaHint")}</p>}
      </div>
      <WallboxOppListDialog
        target={oppTarget}
        oppsDate={data.oppsDate}
        onClose={() => setOppTarget(null)}
      />
    </div>
  );
}
