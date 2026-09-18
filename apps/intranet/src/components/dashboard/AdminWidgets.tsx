"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Award,
  ClipboardCheck,
  Clock3,
  Coffee,
  Lock,
  Plane,
  ScrollText,
  TrendingUp,
  UserPlus,
  Users2,
  Wifi,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { useCurrentUser, useIsAdmin } from "@/components/providers/current-user";
import { isoToday } from "@/lib/absences";
import { useAbsencesCalendar, usePendingAbsenceCount } from "@/lib/absences-api";
import { formatIsoDate, relativeTime } from "@/lib/format";
import { applicantPipelineHealthCounts } from "@/lib/applicant-pipeline-health";

import { DashCard, Empty, Row, RowSkeletons, StatLine } from "./primitives";

const STALE_TICKET_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function plusDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function ManagerBriefCard() {
  const t = useTranslations("Dashboard");
  const today = isoToday();
  const outToday = useAbsencesCalendar(today, today);
  const pendingAbsences = usePendingAbsenceCount(true);
  const accessRequests = useQuery(api.accessRequests.list, { status: "pending" });
  const tickets = useQuery(api.itTickets.tickets.list);
  const measures = useQuery(api.fehlermanagement.measures.list, {});

  const staleTickets =
    tickets?.filter(
      (ticket) =>
        ticket.status !== "closed" && Date.now() - ticket.createdAt >= STALE_TICKET_AGE_MS,
    ) ?? [];
  const unassignedTickets =
    tickets?.filter((ticket) => ticket.status !== "closed" && !ticket.assignedToUserId) ?? [];
  const actionableTickets =
    tickets?.filter(
      (ticket) =>
        ticket.status !== "closed" &&
        (!ticket.assignedToUserId || Date.now() - ticket.createdAt >= STALE_TICKET_AGE_MS),
    ) ?? [];
  const overdueMeasures =
    measures?.filter(
      (measure) => measure.status === "offen" && measure.dueAt && measure.dueAt < Date.now(),
    ) ?? [];
  const attentionCount =
    (pendingAbsences ?? 0) +
    (accessRequests?.length ?? 0) +
    actionableTickets.length +
    overdueMeasures.length;

  return (
    <DashCard
      icon={<ScrollText />}
      title={t("managerBriefTitle")}
      count={attentionCount || undefined}
    >
      {outToday === undefined ||
      pendingAbsences === undefined ||
      accessRequests === undefined ||
      tickets === undefined ||
      measures === undefined ? (
        <RowSkeletons />
      ) : (
        <div className="space-y-1">
          <StatLine
            icon={<Plane />}
            label={t("managerBriefOutToday")}
            value={outToday.length}
            href="/calendar"
          />
          <StatLine
            icon={<ClipboardCheck />}
            label={t("pendingApprovals")}
            value={pendingAbsences}
            href="/approvals"
          />
          <StatLine
            icon={<UserPlus />}
            label={t("managerBriefAccessRequests")}
            value={accessRequests.length}
            href="/admin/requests"
          />
          <StatLine
            icon={<Wrench />}
            label={t("managerBriefStaleTickets")}
            value={staleTickets.length}
            href="/it-tickets"
          />
          <StatLine
            icon={<UserPlus />}
            label={t("managerBriefUnassignedTickets")}
            value={unassignedTickets.length}
            href="/it-tickets?filter=unassigned"
          />
          <StatLine
            icon={<AlertTriangle />}
            label={t("overdueMeasures")}
            value={overdueMeasures.length}
            href="/fehlermanagement/measures"
          />
        </div>
      )}
    </DashCard>
  );
}

/** Org-wide presence counts, Managers+ only (the parent gates whether this
 * mounts at all — `dashboardSummary` also enforces it server-side). */
export function TeamStatusCard() {
  const t = useTranslations("Dashboard");
  const summary = useQuery(api.activity.stats.dashboardSummary);

  return (
    <DashCard icon={<Users2 />} title={t("teamStatusTitle")}>
      {summary === undefined ? (
        <RowSkeletons />
      ) : (
        <div className="space-y-1">
          <StatLine
            icon={<Wifi />}
            label={t("teamOnline", {
              online: summary.online,
              total: summary.total,
            })}
            value=""
            href="/activity"
          />
          <StatLine
            icon={<TrendingUp />}
            label={t("teamActive", { active: summary.active })}
            value=""
            href="/activity"
          />
          {summary.onBreak > 0 && (
            <StatLine
              icon={<Coffee />}
              label={t("teamOnBreak", { count: summary.onBreak })}
              value=""
              href="/activity"
            />
          )}
          {summary.absent > 0 && (
            <StatLine
              icon={<Plane />}
              label={t("teamAbsent", { count: summary.absent })}
              value=""
              href="/activity"
            />
          )}
        </div>
      )}
    </DashCard>
  );
}

/** Planned leave for the manager's own teams. The calendar API already
 * excludes private absence types, so this uses the same availability data
 * colleagues can see in the calendar rather than creating a second data path. */
export function TeamAvailabilityCard() {
  const t = useTranslations("Dashboard");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const user = useCurrentUser();
  const today = isoToday();
  const absences = useAbsencesCalendar(today, plusDays(today, 13));
  const users = useQuery(api.users.list, {});

  const memberIds = new Set(
    users
      ?.filter((member) => member.teams.some((team) => user.teams.includes(team)))
      .map((member) => String(member._id)),
  );
  const plannedLeave = absences
    ?.filter((absence) => memberIds.has(absence.userId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <DashCard
      icon={<Plane />}
      title={t("teamAvailabilityTitle")}
      count={plannedLeave?.length || undefined}
    >
      {absences === undefined || users === undefined ? (
        <RowSkeletons />
      ) : plannedLeave?.length === 0 ? (
        <Empty href="/calendar" linkLabel={t("openCalendar")}>
          {t("teamAvailabilityEmpty")}
        </Empty>
      ) : (
        <div className="space-y-1">
          <p className="px-3 pb-1 text-xs text-muted-foreground">{t("teamAvailabilityWindow")}</p>
          {plannedLeave?.slice(0, 4).map((absence) => (
            <Row
              key={absence.id}
              href={`/calendar?absence=${absence.id}`}
              title={absence.userName}
              subtitle={tAbs(absence.type)}
              leading={<Plane className="size-4 shrink-0 text-muted-foreground" />}
              trailing={
                <span className="whitespace-nowrap text-xs">
                  {formatIsoDate(absence.startDate, locale)}
                  {absence.startDate !== absence.endDate &&
                    ` – ${formatIsoDate(absence.endDate, locale)}`}
                </span>
              }
            />
          ))}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-1 text-xs font-medium">
            <Link href="/directory?scope=my-teams" className="text-primary hover:underline">
              {t("openMyTeams")}
            </Link>
            <Link
              href="/directory?scope=my-teams&availability=now"
              className="text-primary hover:underline"
            >
              {t("findCoverage")}
            </Link>
          </div>
        </div>
      )}
    </DashCard>
  );
}

/** Team KPI snapshot — the parent only mounts this for an account with a
 * valid Performance session and `view_all_employees`, which may be a
 * password login with no Clerk link, so this needs the real session token
 * (not a hardcoded "") to resolve. */
export function TeamPerformanceCard() {
  const t = useTranslations("Dashboard");
  const { token } = usePerformanceSession();
  const dashboard = useQuery(api.performanceQueries.teamDashboard, { token });

  return (
    <DashCard icon={<TrendingUp />} title={t("teamPerformanceTitle")}>
      {dashboard === undefined ? (
        <RowSkeletons />
      ) : (
        <div className="space-y-1">
          {dashboard.total.wonMonth !== undefined && (
            <StatLine
              icon={<Award />}
              label={t("wonThisMonth")}
              value={dashboard.total.wonMonth}
              href="/performance"
            />
          )}
          {dashboard.total.hitrate !== undefined && (
            <StatLine
              icon={<TrendingUp />}
              label={t("hitrate")}
              value={`${dashboard.total.hitrate}%`}
              href="/performance"
            />
          )}
        </div>
      )}
    </DashCard>
  );
}

/** Recruiting remains owned by the existing vault-gated HR workspace. This
 * card only turns its existing first-contact, appointment and activity data
 * into direct routes back to the relevant filtered list. */
export function ApplicantPipelineHealthCard() {
  const t = useTranslations("Dashboard");
  const user = useCurrentUser();
  const isAdmin = useIsAdmin();
  const canReadApplicants = isAdmin || user.applicantAccess;
  const vaultStatus = useQuery(api.applicantVault.status, canReadApplicants ? {} : "skip");
  const applicants = useQuery(
    api.applicants.list,
    canReadApplicants && vaultStatus?.unlocked ? {} : "skip",
  );
  const counts = applicants ? applicantPipelineHealthCounts(applicants) : null;

  return (
    <DashCard icon={<UserPlus />} title={t("applicantPipelineHealthTitle")}>
      {!canReadApplicants || vaultStatus === undefined || applicants === undefined ? (
        <RowSkeletons />
      ) : !vaultStatus.unlocked ? (
        <Empty href="/hr" linkLabel={t("openApplicants")}>
          {t("vaultLockedHint")}
        </Empty>
      ) : (
        <div className="space-y-1">
          <StatLine
            icon={<UserPlus />}
            label={t("applicantPipelineUncontacted")}
            value={counts?.uncontacted ?? 0}
            href="/hr?health=uncontacted"
          />
          <StatLine
            icon={<AlertTriangle />}
            label={t("applicantPipelineOverdue")}
            value={counts?.overdue ?? 0}
            href="/hr?health=overdue"
          />
          <StatLine
            icon={<Clock3 />}
            label={t("applicantPipelineStale")}
            value={counts?.stale ?? 0}
            href="/hr?health=stale"
          />
        </div>
      )}
    </DashCard>
  );
}

export function OpenMeasuresCard() {
  const t = useTranslations("Dashboard");
  const measures = useQuery(api.fehlermanagement.measures.list, {});
  const open = measures?.filter((measure) => measure.status === "offen") ?? [];
  const overdue = open.filter((measure) => measure.dueAt && measure.dueAt < Date.now());

  return (
    <DashCard icon={<ClipboardCheck />} title={t("errorMeasuresTitle")} count={open.length}>
      {measures === undefined ? (
        <RowSkeletons />
      ) : open.length === 0 ? (
        <Empty href="/fehlermanagement/measures" linkLabel={t("openErrorMeasures")}>
          {t("noOpenMeasures")}
        </Empty>
      ) : (
        <div className="space-y-1">
          <StatLine
            icon={<ClipboardCheck />}
            label={t("openMeasures")}
            value={open.length}
            href="/fehlermanagement/measures"
          />
          <StatLine
            icon={<AlertTriangle />}
            label={t("overdueMeasures")}
            value={overdue.length}
            href="/fehlermanagement/measures"
          />
        </div>
      )}
    </DashCard>
  );
}

/** Pending absence approvals + open applicant pipeline. Managers+; the
 * applicant stat only fires once the caller both has access and has their
 * vault unlocked, so a locked vault degrades to a hint instead of an error. */
export function AdminStatsCard() {
  const t = useTranslations("Dashboard");
  const user = useCurrentUser();
  const isAdmin = useIsAdmin();
  const pendingCount = usePendingAbsenceCount(true);
  const hasApplicantAccess = isAdmin || user.applicantAccess || user.applicantAccessDelegate;
  const vaultStatus = useQuery(api.applicantVault.status, hasApplicantAccess ? {} : "skip");
  const pipeline = useQuery(
    api.applicants.pipelineCount,
    hasApplicantAccess && vaultStatus?.unlocked ? {} : "skip",
  );

  return (
    <DashCard icon={<ScrollText />} title={t("adminStatsTitle")}>
      <div className="space-y-1">
        {pendingCount === undefined ? (
          <RowSkeletons />
        ) : (
          <StatLine
            icon={<Plane />}
            label={t("pendingApprovals")}
            value={pendingCount}
            href="/clockodo/approvals"
          />
        )}
        {hasApplicantAccess &&
          (vaultStatus === undefined ? null : !vaultStatus.unlocked ? (
            <StatLine icon={<Lock />} label={t("vaultLockedHint")} value="" href="/hr" />
          ) : pipeline !== undefined ? (
            <StatLine
              icon={<Users2 />}
              label={t("openApplicantPipeline")}
              value={pipeline.open}
              href="/hr"
            />
          ) : null)}
      </div>
    </DashCard>
  );
}

/** Admins only — stricter than the Managers+ gate on the rest of this
 * section, since `auditLog.list` itself requires `requireAdmin`. */
export function RecentActivityCard() {
  const t = useTranslations("Dashboard");
  const rows = useQuery(api.auditLog.list, { limit: 5 });

  return (
    <DashCard icon={<ScrollText />} title={t("recentActivityTitle")}>
      {rows === undefined ? (
        <RowSkeletons />
      ) : rows.length === 0 ? (
        <Empty href="/admin/audit" linkLabel={t("openAuditLog")}>
          {t("noRecentActivity")}
        </Empty>
      ) : (
        rows.map((r) => (
          <Row
            key={r._id}
            href={`/admin/audit?entry=${r._id}`}
            title={`${r.user?.name ?? "unknown"} · ${r.action}`}
            subtitle={r.target ?? undefined}
            trailing={<span className="whitespace-nowrap">{relativeTime(r.at)}</span>}
          />
        ))
      )}
    </DashCard>
  );
}
