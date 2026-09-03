"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ClipboardCheck,
  ClipboardList,
  Plane,
  Plus,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useHasCapability, useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { usePendingApprovals } from "@/lib/absences-api";
import { msToDateInput } from "@/lib/error-management";
import { formatIsoDate } from "@/lib/format";

export default function ApprovalsPage() {
  const t = useTranslations("Approvals");
  const tAbsences = useTranslations("Absences");
  const tError = useTranslations("ErrorManagement");
  const locale = useLocale();
  const isManager = useIsManager();
  const canManageClockodo = useHasCapability("manage_clockodo_team");
  const approvalCover = useQuery(api.approvalDelegations.mine);
  const hasApprovalCover = (approvalCover?.length ?? 0) > 0;
  const canReviewAbsences = canManageClockodo || hasApprovalCover;
  const { approvals } = usePendingApprovals(canReviewAbsences);
  const accessRequests = useQuery(
    api.accessRequests.list,
    isManager ? { status: "pending" } : "skip",
  );
  const measures = useQuery(api.errorMeasures.list, isManager ? {} : "skip");
  const openMeasures = useMemo(
    () =>
      measures
        ?.filter((measure) => measure.status === "offen")
        .sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 5),
    [measures],
  );

  if (!isManager && approvalCover === undefined) {
    return (
      <div className="mx-auto max-w-5xl">
        <ApprovalSkeleton />
      </div>
    );
  }

  if (!isManager && !hasApprovalCover) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<ClipboardCheck />} />

      {hasApprovalCover && (
        <Card className="border-primary/30 bg-primary/[0.03] shadow-none">
          <CardContent className="flex gap-3 p-4">
            <UserRoundCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">{t("delegatedCoverActive")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("delegatedCoverActiveHint")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {canManageClockodo && <ApprovalCoverManagement />}

      <div className="grid gap-4 lg:grid-cols-2">
        {canReviewAbsences && (
          <Card className="overflow-hidden">
            <CardHeader className="flex-col items-stretch gap-4 border-b border-border/70 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plane className="size-4 text-primary" />
                  {t("absenceApprovals")}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{t("absenceApprovalsHint")}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link href="/clockodo/approvals">{t("reviewAll")}</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {approvals === undefined ? (
                <ApprovalSkeleton />
              ) : approvals.length === 0 ? (
                <EmptyQueue>{t("noAbsenceApprovals")}</EmptyQueue>
              ) : (
                <div className="divide-y divide-border/70">
                  {approvals.slice(0, 5).map((approval) => (
                    <div key={approval.id} className="px-5 py-3">
                      <p className="truncate text-sm font-medium">
                        {approval.userName} · {tAbsences(approval.type)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatIsoDate(approval.startDate, locale)} –{" "}
                        {formatIsoDate(approval.endDate, locale)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isManager && (
          <Card className="overflow-hidden">
            <CardHeader className="flex-col items-stretch gap-4 border-b border-border/70 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4 text-primary" />
                  {t("accessRequests")}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{t("accessRequestsHint")}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link href="/admin/requests">{t("reviewAll")}</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {accessRequests === undefined ? (
                <ApprovalSkeleton />
              ) : accessRequests.length === 0 ? (
                <EmptyQueue>{t("noAccessRequests")}</EmptyQueue>
              ) : (
                <div className="divide-y divide-border/70">
                  {accessRequests.slice(0, 5).map((request) => (
                    <div key={request._id} className="px-5 py-3">
                      <p className="truncate text-sm font-medium">
                        {request.name ?? request.email}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {request.email}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isManager && (
          <Card className="overflow-hidden">
            <CardHeader className="flex-col items-stretch gap-4 border-b border-border/70 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="size-4 text-primary" />
                  {t("openMeasures")}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{t("openMeasuresHint")}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link href="/fehlermanagement/measures">{t("reviewAll")}</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {openMeasures === undefined ? (
                <ApprovalSkeleton />
              ) : openMeasures.length === 0 ? (
                <EmptyQueue>{t("noOpenMeasures")}</EmptyQueue>
              ) : (
                <div className="divide-y divide-border/70">
                  {openMeasures.map((measure) => (
                    <Link
                      key={measure._id}
                      href="/fehlermanagement/measures"
                      className="block px-5 py-3.5 transition-colors hover:bg-accent/50"
                    >
                      <p className="line-clamp-2 text-sm font-medium">{measure.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tError(`phase.${measure.phase}`)}
                        {measure.dueAt
                          ? ` · ${t("measureDue", { date: formatIsoDate(msToDateInput(measure.dueAt), locale) })}`
                          : ` · ${t("measureNoDueDate")}`}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ApprovalCoverManagement() {
  const t = useTranslations("Approvals");
  const locale = useLocale();
  const covers = useQuery(api.approvalDelegations.listGranted);
  const users = useQuery(api.users.list, {});
  const createCover = useMutation(api.approvalDelegations.create);
  const revokeCover = useMutation(api.approvalDelegations.revoke);
  const handleError = useErrorHandler();
  const [open, setOpen] = useState(false);
  const [delegateUserId, setDelegateUserId] = useState<string>();
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formatDate = (value: number) =>
    new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  async function saveCover() {
    const startsAt = Date.parse(`${startsOn}T00:00:00`);
    const endsAt = Date.parse(`${endsOn}T23:59:59.999`);
    if (!delegateUserId || Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
      toast.error(t("coverDatesRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await createCover({
        delegateUserId: delegateUserId as Id<"users">,
        scope: "absence_approvals",
        startsAt,
        endsAt,
      });
      setOpen(false);
      setDelegateUserId(undefined);
      setStartsOn("");
      setEndsOn("");
    } catch (error) {
      handleError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-col items-stretch gap-4 border-b border-border/70 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRoundCheck className="size-4 text-primary" />
            {t("approvalCover")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("approvalCoverHint")}</p>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {t("addApprovalCover")}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {covers === undefined ? (
          <ApprovalSkeleton />
        ) : covers.length === 0 ? (
          <EmptyQueue>{t("noApprovalCovers")}</EmptyQueue>
        ) : (
          <div className="divide-y divide-border/70">
            {covers.map((cover) => (
              <div key={cover._id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{cover.delegateName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(cover.startsAt)} – {formatDate(cover.endsAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void revokeCover({ delegationId: cover._id }).catch(handleError)}
                >
                  {t("revokeApprovalCover")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addApprovalCover")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              {t("approvalCoverDelegate")}
              <Select value={delegateUserId} onValueChange={setDelegateUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("approvalCoverDelegatePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {users
                    ?.filter((user) => user.status === "active")
                    .map((user) => (
                      <SelectItem key={user._id} value={user._id}>
                        {user.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm font-medium">
                {t("approvalCoverStarts")}
                <Input
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                {t("approvalCoverEnds")}
                <Input
                  type="date"
                  value={endsOn}
                  onChange={(event) => setEndsOn(event.target.value)}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void saveCover()} disabled={submitting}>
              {t("saveApprovalCover")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ApprovalSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-1.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function EmptyQueue({ children }: { children: string }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
