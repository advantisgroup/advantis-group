"use client";

import { useMemo, useState, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  ClipboardList,
  Plane,
  Plus,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Panel, PanelSkeleton } from "@/components/admin/overview/primitives";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { PersonLink } from "@/components/profile/PersonLink";
import { useHasCapability, useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { isoToday } from "@/lib/absences";
import { usePendingApprovals } from "@/lib/absences-api";
import { msToDateInput } from "@/lib/error-management";
import { formatIsoDate, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
/** An absence starting this soon is a decision someone is waiting on to plan. */
const SOON_DAYS = 3;

function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [ty, tm, td] = isoToday().split("-").map(Number);
  return Math.round(
    (new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / DAY_MS,
  );
}

function QueueRow({
  primary,
  secondary,
  trailing,
  urgent,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  trailing?: ReactNode;
  urgent?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", urgent ? "bg-warn" : "bg-border")}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{primary}</div>
        <div className="truncate text-xs text-muted-foreground">{secondary}</div>
      </div>
      {trailing && (
        <span
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
            urgent ? "bg-warn/12 text-warn" : "bg-muted text-muted-foreground",
          )}
        >
          {trailing}
        </span>
      )}
    </li>
  );
}

function QueueEmpty({ children }: { children: string }) {
  return (
    <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 text-ok" />
      {children}
    </p>
  );
}

function ReviewAll({ href }: { href: string }) {
  const t = useTranslations("Approvals");
  return (
    <Button asChild variant="ghost" size="xs">
      <Link href={href}>{t("reviewAll")}</Link>
    </Button>
  );
}

function RefreshedApprovalsPage() {
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
        .sort(
          (a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER),
        ),
    [measures],
  );

  if (!isManager && approvalCover === undefined) {
    return <Skeleton className="mx-auto h-28 max-w-5xl rounded-xl" />;
  }
  if (!isManager && !hasApprovalCover) return <ForbiddenScreen />;

  const sortedApprovals = [...(approvals ?? [])].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const now = Date.now();
  const overdueMeasures = (openMeasures ?? []).filter((m) => m.dueAt && m.dueAt < now).length;
  const soonAbsences = sortedApprovals.filter((a) => daysUntil(a.startDate) <= SOON_DAYS).length;
  const total =
    (canReviewAbsences ? sortedApprovals.length : 0) +
    (isManager ? (accessRequests?.length ?? 0) + (openMeasures?.length ?? 0) : 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<UserRoundCheck />} />

      <KpiStrip className={cn(!isManager && "lg:grid-cols-2")}>
        <Kpi
          featured
          label={t("waitingOnYou")}
          value={total}
          hint={total === 0 ? t("allClear") : t("oldestFirst")}
        />
        {canReviewAbsences && (
          <Kpi
            tone={soonAbsences > 0 ? "warn" : "neutral"}
            label={t("absenceApprovals")}
            value={approvals?.length ?? "–"}
            hint={soonAbsences > 0 ? t("startingSoon", { count: soonAbsences }) : undefined}
            href="/clockodo/approvals"
          />
        )}
        {isManager && (
          <Kpi
            label={t("accessRequests")}
            value={accessRequests?.length ?? "–"}
            href="/admin/requests"
          />
        )}
        {isManager && (
          <Kpi
            tone={overdueMeasures > 0 ? "warn" : "neutral"}
            label={t("openMeasures")}
            value={openMeasures?.length ?? "–"}
            hint={overdueMeasures > 0 ? t("overdueCount", { count: overdueMeasures }) : undefined}
            href="/fehlermanagement/measures"
          />
        )}
      </KpiStrip>

      {hasApprovalCover && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-2.5 text-sm">
          <UserRoundCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium">{t("delegatedCoverActive")}</span>
            <span className="text-muted-foreground"> — {t("delegatedCoverActiveHint")}</span>
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {canReviewAbsences && (
          <Panel
            icon={<Plane />}
            title={t("absenceApprovals")}
            description={t("absenceApprovalsHint")}
            action={<ReviewAll href="/clockodo/approvals" />}
            bodyClassName="p-0"
          >
            {approvals === undefined ? (
              <div className="p-5">
                <PanelSkeleton rows={3} />
              </div>
            ) : sortedApprovals.length === 0 ? (
              <QueueEmpty>{t("noAbsenceApprovals")}</QueueEmpty>
            ) : (
              <ul className="divide-y divide-border/60">
                {sortedApprovals.slice(0, 6).map((approval) => {
                  const days = daysUntil(approval.startDate);
                  return (
                    <QueueRow
                      key={approval.id}
                      urgent={days <= SOON_DAYS}
                      primary={
                        <>
                          <PersonLink userId={approval.userId as Id<"users">}>
                            {approval.userName}
                          </PersonLink>
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {tAbsences(approval.type)}
                          </span>
                        </>
                      }
                      secondary={`${formatIsoDate(approval.startDate, locale)} – ${formatIsoDate(approval.endDate, locale)}${approval.halfDay ? ` · ${t("halfDay")}` : ""}`}
                      trailing={
                        days < 0
                          ? t("started")
                          : days === 0
                            ? t("startsToday")
                            : t("startsIn", { days })
                      }
                    />
                  );
                })}
              </ul>
            )}
          </Panel>
        )}

        {isManager && (
          <Panel
            icon={<ShieldCheck />}
            title={t("accessRequests")}
            description={t("accessRequestsHint")}
            action={<ReviewAll href="/admin/requests" />}
            bodyClassName="p-0"
          >
            {accessRequests === undefined ? (
              <div className="p-5">
                <PanelSkeleton rows={3} />
              </div>
            ) : accessRequests.length === 0 ? (
              <QueueEmpty>{t("noAccessRequests")}</QueueEmpty>
            ) : (
              <ul className="divide-y divide-border/60">
                {accessRequests.slice(0, 6).map((request) => (
                  <QueueRow
                    key={request._id}
                    primary={request.name ?? request.email}
                    secondary={request.name ? request.email : (request.message ?? "")}
                    trailing={t("requestedAgo", { age: relativeTime(request.createdAt) })}
                  />
                ))}
              </ul>
            )}
          </Panel>
        )}

        {isManager && (
          <Panel
            icon={<ClipboardList />}
            title={t("openMeasures")}
            description={t("openMeasuresHint")}
            action={<ReviewAll href="/fehlermanagement/measures" />}
            bodyClassName="p-0"
          >
            {openMeasures === undefined ? (
              <div className="p-5">
                <PanelSkeleton rows={3} />
              </div>
            ) : openMeasures.length === 0 ? (
              <QueueEmpty>{t("noOpenMeasures")}</QueueEmpty>
            ) : (
              <ul className="divide-y divide-border/60">
                {openMeasures.slice(0, 6).map((measure) => {
                  const overdue = !!measure.dueAt && measure.dueAt < now;
                  return (
                    <QueueRow
                      key={measure._id}
                      urgent={overdue}
                      primary={measure.description}
                      secondary={[tError(`phase.${measure.phase}`), measure.ownerName]
                        .filter(Boolean)
                        .join(" · ")}
                      trailing={
                        measure.dueAt
                          ? overdue
                            ? t("overdue")
                            : t("measureDue", {
                                date: formatIsoDate(msToDateInput(measure.dueAt), locale),
                              })
                          : t("measureNoDueDate")
                      }
                    />
                  );
                })}
              </ul>
            )}
          </Panel>
        )}

        {canManageClockodo && <ApprovalCoverPanel />}
      </div>
    </div>
  );
}

function ApprovalCoverPanel() {
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
    <Panel
      icon={<UserRoundCheck />}
      title={t("approvalCover")}
      description={t("approvalCoverHint")}
      action={
        <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
          <Plus />
          {t("addApprovalCover")}
        </Button>
      }
      bodyClassName="p-0"
    >
      {covers === undefined ? (
        <div className="p-5">
          <PanelSkeleton rows={2} />
        </div>
      ) : covers.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          {t("noApprovalCovers")}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {covers.map((cover) => (
            <li key={cover._id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <PersonLink userId={cover.delegateUserId} className="text-sm font-medium">
                  {cover.delegateName}
                </PersonLink>
                <p className="text-xs text-muted-foreground">
                  {formatDate(cover.startsAt)} – {formatDate(cover.endsAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => void revokeCover({ delegationId: cover._id }).catch(handleError)}
              >
                {t("revokeApprovalCover")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("addApprovalCover")}
        description={t("approvalCoverHint")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => void saveCover()}
              disabled={submitting}
              className="max-sm:flex-1"
            >
              {t("saveApprovalCover")}
            </Button>
          </>
        }
      >
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
            <Input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
          </label>
        </div>
      </ResponsiveDialog>
    </Panel>
  );
}

export default function ApprovalsPage() {
  return <RefreshedApprovalsPage />;
}
