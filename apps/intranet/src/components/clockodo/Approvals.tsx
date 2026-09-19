"use client";

import { AbsenceTypeLabel } from "@/components/clockodo/parts";
import { PersonLink } from "@/components/profile/PersonLink";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { workingDays } from "@/lib/absences";
import { type PendingApproval, setAbsenceApprovalStatus } from "@/lib/absences-api";
import { useEdenApi } from "@/lib/eden";
import { formatIsoDate } from "@/lib/format";
import { type Id } from "@advantis/convex/dataModel";
import { Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

/** Absence requests waiting for you to approve. */

export function Approvals({
  approvals,
  onDecided,
}: {
  approvals: PendingApproval[] | undefined;
  onDecided: () => void;
}) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const eden = useEdenApi();
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function decide(approval: PendingApproval, status: "approved" | "denied") {
    setActingOn(approval.id);
    try {
      await setAbsenceApprovalStatus(eden, approval.id, status);
      toast.success(status === "approved" ? t("approved") : t("denied"));
      onDecided();
    } catch {
      toast.error(t("approvalActionFailed"));
    } finally {
      setActingOn(null);
    }
  }

  if (approvals === undefined) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }
  if (approvals.length === 0) return <EmptyState icon={<Check />} title={t("noApprovals")} />;

  const range = (approval: PendingApproval) =>
    `${formatIsoDate(approval.startDate, locale)} – ${formatIsoDate(approval.endDate, locale)}`;
  const days = (approval: PendingApproval) =>
    workingDays(approval.startDate, approval.endDate, approval.halfDay);
  const actions = (approval: PendingApproval) => (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={actingOn === approval.id}
        onClick={() => void decide(approval, "denied")}
      >
        <X />
        {t("deny")}
      </Button>
      <Button
        size="sm"
        disabled={actingOn === approval.id}
        onClick={() => void decide(approval, "approved")}
      >
        <Check />
        {t("approve")}
      </Button>
    </>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("employee")}</TableHead>
            <TableHead className="w-36">{t("type")}</TableHead>
            <TableHead className="w-56">{t("period")}</TableHead>
            <TableHead className="w-20 text-right">{t("absenceDays")}</TableHead>
            <TableHead className="w-52" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {approvals.map((approval) => {
            const detail = [approval.userDepartment, approval.reason].filter(Boolean).join(" · ");
            return (
              <TableRow key={approval.id} className="hover:bg-transparent">
                <TableCell className="w-full max-w-0">
                  <PersonLink
                    userId={approval.userId as Id<"users">}
                    className="block max-w-full font-medium"
                  >
                    {approval.userName}
                  </PersonLink>
                  {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
                </TableCell>
                <TableCell>
                  <AbsenceTypeLabel type={approval.type} />
                </TableCell>
                <TableCell className="whitespace-nowrap">{range(approval)}</TableCell>
                <TableCell className="text-right tabular-nums">{days(approval)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1.5">{actions(approval)}</div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ul className="divide-y divide-border/60 md:hidden">
        {approvals.map((approval) => (
          <li key={approval.id} className="space-y-2.5 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <PersonLink
                userId={approval.userId as Id<"users">}
                className="block max-w-full text-sm font-medium"
              >
                {approval.userName}
              </PersonLink>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <AbsenceTypeLabel type={approval.type} />
                <span>
                  {range(approval)} · {t("workingDaysLabel", { count: days(approval) })}
                </span>
              </p>
              {approval.reason && (
                <p className="text-xs text-muted-foreground">{approval.reason}</p>
              )}
            </div>
            <div className="flex justify-end gap-1.5">{actions(approval)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
