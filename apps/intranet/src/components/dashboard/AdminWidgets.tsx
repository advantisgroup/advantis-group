"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Award, Coffee, Lock, Plane, ScrollText, TrendingUp, Users2, Wifi } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser, useIsAdmin } from "@/components/providers/current-user";
import { relativeTime } from "@/lib/format";

import { DashCard, Empty, Row, RowSkeletons, StatLine } from "./primitives";

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

/** Team KPI snapshot — the parent only mounts this for a linked Performance
 * admin account, so `token: ""` resolves via the Clerk-linked fallback. */
export function TeamPerformanceCard() {
  const t = useTranslations("Dashboard");
  const dashboard = useQuery(api.performanceQueries.teamDashboard, {
    token: "",
  });

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

/** Pending absence approvals + open applicant pipeline. Managers+; the
 * applicant stat only fires once the caller both has access and has their
 * vault unlocked, so a locked vault degrades to a hint instead of an error. */
export function AdminStatsCard() {
  const t = useTranslations("Dashboard");
  const user = useCurrentUser();
  const isAdmin = useIsAdmin();
  const pending = useQuery(api.absences.pendingForApproval);
  const hasApplicantAccess = isAdmin || user.applicantAccess || user.applicantAccessDelegate;
  const vaultStatus = useQuery(api.applicantVault.status, hasApplicantAccess ? {} : "skip");
  const pipeline = useQuery(
    api.applicants.pipelineCount,
    hasApplicantAccess && vaultStatus?.unlocked ? {} : "skip",
  );

  return (
    <DashCard icon={<ScrollText />} title={t("adminStatsTitle")}>
      <div className="space-y-1">
        {pending === undefined ? (
          <RowSkeletons />
        ) : (
          <StatLine
            icon={<Plane />}
            label={t("pendingApprovals")}
            value={pending.count}
            href="/absences"
          />
        )}
        {hasApplicantAccess &&
          (vaultStatus === undefined ? null : !vaultStatus.unlocked ? (
            <StatLine icon={<Lock />} label={t("vaultLockedHint")} value="" href="/applicants" />
          ) : pipeline !== undefined ? (
            <StatLine
              icon={<Users2 />}
              label={t("openApplicantPipeline")}
              value={pipeline.open}
              href="/applicants"
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
