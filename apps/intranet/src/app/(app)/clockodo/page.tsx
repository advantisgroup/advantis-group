"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Approvals } from "@/components/clockodo/Approvals";
import { ClockodoAdminPanel } from "@/components/clockodo/ClockodoAdminPanel";
import { Dashboard } from "@/components/clockodo/Dashboard";
import { AbsencesSubNav, type ClockodoSection } from "@/components/clockodo/parts";
import { Planner } from "@/components/clockodo/Planner";
import { Requests } from "@/components/clockodo/Requests";
import { Timetable } from "@/components/clockodo/Timetable";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useHasCapability } from "@/components/providers/current-user";
import { addDaysIso, isoToday } from "@/lib/absences";
import {
  useAbsencesCalendar,
  useMyAbsences,
  usePendingAbsenceCount,
  usePendingApprovals,
} from "@/lib/absences-api";
import { buildIcs, downloadIcs } from "@/lib/ics";
import { cn } from "@/lib/utils";

export function ClockodoWorkspace({ section }: { section: ClockodoSection }) {
  const t = useTranslations("Absences");
  const router = useRouter();
  const hasTeamAccess = useHasCapability("view_clockodo_team");
  const canManageClockodo = useHasCapability("manage_clockodo_team");
  const approvalCover = useQuery(api.org.delegations.mine);
  const hasApprovalCover = (approvalCover?.length ?? 0) > 0;
  const canReviewAbsences = canManageClockodo || hasApprovalCover;
  const { absences: mine, refresh } = useMyAbsences();
  const calendarStart = addDaysIso(isoToday(), -31);
  const calendarEnd = addDaysIso(isoToday(), 90);
  const calendar = useAbsencesCalendar(calendarStart, calendarEnd);
  const pending = usePendingAbsenceCount(hasTeamAccess);
  const { approvals, refresh: refreshApprovals } = usePendingApprovals(canReviewAbsences);

  function exportIcs() {
    const approved = (mine ?? []).filter((absence) => absence.status === "approved");
    const ics = buildIcs(
      t("title"),
      approved.map((absence) => ({
        uid: absence.id,
        title: t(absence.type),
        startDate: absence.startDate,
        endDate: absence.endDate,
        description: absence.reason ?? undefined,
      })),
    );
    downloadIcs("clockodo-absences.ics", ics);
    toast.success(t("exported"));
  }

  const navigate = (next: ClockodoSection) => {
    const href: Record<ClockodoSection, string> = {
      dashboard: "/clockodo",
      timetable: "/clockodo/timetable",
      requests: "/clockodo/requests",
      planner: "/clockodo/planner",
      approvals: "/clockodo/approvals",
      admin: "/clockodo/admin",
    };
    router.push(href[next]);
  };

  const isAbsencesSubSection =
    section === "requests" || section === "approvals" || section === "planner";

  return (
    <ErrorBoundary
      key={section}
      fallback={({ reset }) => <ErrorFallback title={t("sectionUnavailable")} onRetry={reset} />}
    >
      {section === "dashboard" && (
        <Dashboard mine={mine} calendar={calendar} pending={pending} onNavigate={navigate} />
      )}
      {section === "timetable" && <Timetable />}
      <div className={cn(isAbsencesSubSection && "space-y-4")}>
        {isAbsencesSubSection && (
          <AbsencesSubNav
            active={section}
            canManageClockodo={canReviewAbsences}
            onNavigate={navigate}
          />
        )}
        {section === "requests" && <Requests mine={mine} onExport={exportIcs} onSaved={refresh} />}
        {section === "planner" && <Planner calendar={calendar} />}
        {section === "approvals" &&
          (canReviewAbsences ? (
            <Approvals approvals={approvals} onDecided={refreshApprovals} />
          ) : (
            <ForbiddenScreen />
          ))}
      </div>
      {section === "admin" && (canManageClockodo ? <ClockodoAdminPanel /> : <ForbiddenScreen />)}
    </ErrorBoundary>
  );
}

export default function ClockodoPage() {
  return <ClockodoWorkspace section="dashboard" />;
}
