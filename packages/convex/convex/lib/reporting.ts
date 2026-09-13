import { v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";

/**
 * How the org hangs together: a department covers everyone in one line of
 * work (Sales), and splits into teams (Inbound). Someone reports to every lead
 * above them — their team's lead and their department's lead — plus anyone
 * picked for them by hand. Those lines add up; none replaces another.
 */

/** No longer read — reporting lines are additive now. Kept so rows written
 *  while it was a choice still validate. */
export const reportsViaValidator = v.union(
  v.literal("manual"),
  v.literal("team"),
  v.literal("department"),
);

export type ReportingVia = "manual" | "team" | "department";

export interface ReportingLine {
  userId: Id<"users">;
  via: ReportingVia;
  /** The team or department this line comes through. */
  label: string | null;
}

interface TeamInfo {
  name: string;
  lead: Id<"users"> | undefined;
  departmentId: Id<"departments"> | undefined;
}

export interface ReportingLookup {
  teamsById: Map<string, TeamInfo>;
  teamIdBySlug: Map<string, string>;
  teamIdsByUser: Map<string, string[]>;
  departmentsById: Map<string, { name: string; lead: Id<"users"> | undefined }>;
  departmentIdByName: Map<string, string>;
}

/** One read of teams, memberships and departments, shared by every resolve. */
export async function loadReportingLookup(ctx: QueryCtx): Promise<ReportingLookup> {
  const [teams, memberships, departments] = await Promise.all([
    ctx.db.query("teams").collect(),
    ctx.db.query("userTeams").collect(),
    ctx.db.query("departments").collect(),
  ]);
  const teamsById = new Map<string, TeamInfo>();
  const teamIdBySlug = new Map<string, string>();
  for (const team of teams) {
    if (team.archivedAt) continue;
    teamsById.set(team._id, {
      name: team.name,
      lead: team.reportsToUserId,
      departmentId: team.departmentId,
    });
    teamIdBySlug.set(team.slug, team._id);
  }
  const teamIdsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    teamIdsByUser.set(m.userId, [...(teamIdsByUser.get(m.userId) ?? []), m.teamId]);
  }
  const departmentsById = new Map<string, { name: string; lead: Id<"users"> | undefined }>();
  const departmentIdByName = new Map<string, string>();
  for (const department of departments) {
    if (department.archivedAt) continue;
    departmentsById.set(department._id, {
      name: department.name,
      lead: department.reportsToUserId,
    });
    departmentIdByName.set(department.name.trim().toLowerCase(), department._id);
  }
  return { teamsById, teamIdBySlug, teamIdsByUser, departmentsById, departmentIdByName };
}

/** The teams someone is in, from the membership table and the older slug list. */
export function teamIdsOf(user: Doc<"users">, lookup: ReportingLookup): string[] {
  const ids = [
    ...(lookup.teamIdsByUser.get(user._id) ?? []),
    ...(user.teams ?? []).map((slug) => lookup.teamIdBySlug.get(slug)),
  ].filter((id): id is string => !!id && lookup.teamsById.has(id));
  return [...new Set(ids)];
}

/** Their own department, or — when that isn't set — the departments their teams sit in. */
export function departmentIdsOf(user: Doc<"users">, lookup: ReportingLookup): string[] {
  const own =
    (user.departmentId && lookup.departmentsById.has(user.departmentId) && user.departmentId) ||
    (user.department && lookup.departmentIdByName.get(user.department.trim().toLowerCase()));
  if (own) return [own];
  const viaTeams = teamIdsOf(user, lookup)
    .map((id) => lookup.teamsById.get(id)?.departmentId)
    .filter((id): id is Id<"departments"> => !!id);
  return [...new Set(viaTeams)];
}

/** Everyone this person reports to, the most direct first. */
export function reportingLines(user: Doc<"users">, lookup: ReportingLookup): ReportingLine[] {
  const lines: ReportingLine[] = [];
  const add = (userId: Id<"users"> | undefined, via: ReportingVia, label: string | null) => {
    if (!userId || userId === user._id || lines.some((line) => line.userId === userId)) return;
    lines.push({ userId, via, label });
  };
  add(user.managerId, "manual", null);
  for (const teamId of teamIdsOf(user, lookup)) {
    const team = lookup.teamsById.get(teamId)!;
    add(team.lead, "team", team.name);
  }
  for (const departmentId of departmentIdsOf(user, lookup)) {
    const department = lookup.departmentsById.get(departmentId)!;
    add(department.lead, "department", department.name);
  }
  return lines;
}

/** The single most direct manager, for places that draw one line (the org chart). */
export function resolveManager(
  user: Doc<"users">,
  lookup: ReportingLookup,
): { managerId: Id<"users"> | null } {
  return { managerId: reportingLines(user, lookup)[0]?.userId ?? null };
}
