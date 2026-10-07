"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { type FunctionArgs, type FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
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

type OppListArgs = FunctionArgs<typeof api.performance.wallbox.oppList>;
type OppRow = FunctionReturnType<typeof api.performance.wallbox.oppList>["rows"][number];

/** Won share of the closed opportunities in percent; nothing closed → null. */
export function winRate(won: number, lost: number): number | null {
  return won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : null;
}

export function OppStatusBadge({ status }: { status: OppRow["status"] }) {
  const t = useTranslations("Performance");
  if (status === "won") return <Badge variant="success">{t("wallbox.won")}</Badge>;
  if (status === "lost") return <Badge variant="muted">{t("wallbox.lost")}</Badge>;
  return <Badge variant="outline">{t("wallbox.open")}</Badge>;
}

/** The opportunities behind a Wallbox table row. `by` decides which name
 * column is shown: an employee's list names the owner, an owner's list the
 * acquirer. */
export function WallboxOppTable({ args }: { args: OppListArgs }) {
  const t = useTranslations("Performance");
  const data = useQuery(api.performance.wallbox.oppList, args);

  if (!data) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (data.rows.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{t("wallbox.noOpps")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table className="whitespace-nowrap">
        <TableHeader>
          <TableRow>
            <TableHead>{t("wallbox.colAccount")}</TableHead>
            <TableHead>
              {args.by === "owner" ? t("wallbox.colAcquiredBy") : t("wallbox.colOwner")}
            </TableHead>
            <TableHead className="text-right">{t("wallbox.colStatus")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((r, i) => (
            <TableRow key={`${r.account}-${i}`}>
              <TableCell className="max-w-[16rem] truncate font-medium" title={r.account}>
                {r.account || "–"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {(args.by === "owner" ? r.acquiredBy : r.owner) || "–"}
              </TableCell>
              <TableCell className="text-right">
                <OppStatusBadge status={r.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Dialog (bottom sheet on mobile) listing one row's opportunities. */
export function WallboxOppListDialog({
  target,
  oppsDate,
  onClose,
}: {
  target: {
    companyId: Id<"companies">;
    by: OppListArgs["by"];
    name: string;
    employeeId?: Id<"performanceEmployees">;
  } | null;
  oppsDate: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  return (
    <ResponsiveDialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t("wallbox.oppsTitle", { name: target?.name ?? "" })}
      description={
        oppsDate ? t("wallbox.oppsAsOf", { date: formatIsoDate(oppsDate, locale) }) : undefined
      }
      contentClassName="max-w-xl"
    >
      {target && (
        <WallboxOppTable
          args={{
            companyId: target.companyId,
            by: target.by,
            ...(target.employeeId ? { employeeId: target.employeeId } : { name: target.name }),
          }}
        />
      )}
    </ResponsiveDialog>
  );
}
