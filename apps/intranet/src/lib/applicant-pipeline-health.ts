import type { api } from "@advantis/convex/api";
import type { FunctionReturnType } from "convex/server";

export type ApplicantPipelineHealth = "uncontacted" | "overdue" | "stale";

type Applicant = FunctionReturnType<typeof api.hr.applicants.list>[number];

export const PIPELINE_HEALTH_OPTIONS: readonly ApplicantPipelineHealth[] = [
  "uncontacted",
  "overdue",
  "stale",
];

const STALE_ACTIVITY_DAYS = 14;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(date: string, today: string) {
  return Math.floor(
    (new Date(`${today}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

export function matchesApplicantPipelineHealth(
  applicant: Applicant,
  health: ApplicantPipelineHealth,
  today = isoToday(),
) {
  if (health === "uncontacted") return applicant.status === "neu";
  if (health === "overdue") {
    const appointmentDate = applicant.nextOpenTermin?.datum;
    return appointmentDate !== undefined && appointmentDate < today;
  }
  return (
    applicant.status === "pool" &&
    !applicant.nextOpenTermin &&
    applicant.lastActivity !== null &&
    daysSince(applicant.lastActivity, today) >= STALE_ACTIVITY_DAYS
  );
}

export function applicantPipelineHealthCounts(applicants: Applicant[], today = isoToday()) {
  return Object.fromEntries(
    PIPELINE_HEALTH_OPTIONS.map((health) => [
      health,
      applicants.filter((applicant) => matchesApplicantPipelineHealth(applicant, health, today))
        .length,
    ]),
  ) as Record<ApplicantPipelineHealth, number>;
}
