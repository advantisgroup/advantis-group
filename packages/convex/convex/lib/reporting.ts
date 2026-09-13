import { v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";

/**
 * Who someone reports to can come from three places: a person picked for
 * them by hand, the lead set on one of their teams, or the lead set on their
 * department. `reportsVia` pins one of those; left unset, the first that
 * gives an answer wins in that order.
 */
export const reportsViaValidator = v.union(
  v.literal("manual"),
  v.literal("team"),
  v.literal("department"),
);

export type ReportsVia = "manual" | "team" | "department";

export interface ReportingLookup {
  teamLeadById: Map<string, Id<"users">>;
  teamLeadBySlug: Map<string, Id<"users">>;
  teamIdsByUser: Map<string, string[]>;
  departmentLeadById: Map<string, Id<"users">>;
  departmentLeadByName: Map<string, Id<"users">>;
}

/** One read of teams, memberships and departments, shared by every resolve. */
export async function loadReportingLookup(ctx: QueryCtx): Promise<ReportingLookup> {
  const [teams, memberships, departments] = await Promise.all([
    ctx.db.query("teams").collect(),
    ctx.db.query("userTeams").collect(),
    ctx.db.query("departments").collect(),
  ]);
  const teamLeadById = new Map<string, Id<"users">>();
  const teamLeadBySlug = new Map<string, Id<"users">>();
  for (const team of teams) {
    if (team.archivedAt || !team.reportsToUserId) continue;
    teamLeadById.set(team._id, team.reportsToUserId);
    teamLeadBySlug.set(team.slug, team.reportsToUserId);
  }
  const teamIdsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    teamIdsByUser.set(m.userId, [...(teamIdsByUser.get(m.userId) ?? []), m.teamId]);
  }
  const departmentLeadById = new Map<string, Id<"users">>();
  const departmentLeadByName = new Map<string, Id<"users">>();
  for (const department of departments) {
    if (department.archivedAt || !department.reportsToUserId) continue;
    departmentLeadById.set(department._id, department.reportsToUserId);
    departmentLeadByName.set(department.name.trim().toLowerCase(), department.reportsToUserId);
  }
  return { teamLeadById, teamLeadBySlug, teamIdsByUser, departmentLeadById, departmentLeadByName };
}

function viaTeam(user: Doc<"users">, lookup: ReportingLookup): Id<"users"> | null {
  const candidates = [
    ...(lookup.teamIdsByUser.get(user._id) ?? []).map((id) => lookup.teamLeadById.get(id)),
    ...(user.teams ?? []).map((slug) => lookup.teamLeadBySlug.get(slug)),
  ];
  return candidates.find((lead): lead is Id<"users"> => !!lead && lead !== user._id) ?? null;
}

function viaDepartment(user: Doc<"users">, lookup: ReportingLookup): Id<"users"> | null {
  const lead =
    (user.departmentId && lookup.departmentLeadById.get(user.departmentId)) ||
    (user.department && lookup.departmentLeadByName.get(user.department.trim().toLowerCase()));
  return lead && lead !== user._id ? lead : null;
}

export function resolveManager(
  user: Doc<"users">,
  lookup: ReportingLookup,
): { managerId: Id<"users"> | null; source: ReportsVia | null } {
  const manual = user.managerId && user.managerId !== user._id ? user.managerId : null;
  const order: ReportsVia[] = user.reportsVia
    ? [user.reportsVia]
    : ["manual", "team", "department"];
  for (const source of order) {
    const managerId =
      source === "manual"
        ? manual
        : source === "team"
          ? viaTeam(user, lookup)
          : viaDepartment(user, lookup);
    if (managerId) return { managerId, source };
  }
  return { managerId: null, source: null };
}
