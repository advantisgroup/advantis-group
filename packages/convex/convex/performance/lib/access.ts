import { ConvexError } from "convex/values";

import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { type Caller } from "../../lib/caller";
import { displayName } from "../../lib/users";

/**
 * Who may see which Performance dashboard. Access runs entirely through the
 * intranet (Clerk) since 10/2026 — the old separate password logins are gone.
 *
 * - Intranet admins see every dashboard and every employee, and are the only
 *   ones who upload reports or change settings.
 * - The lead of a team/department linked to a dashboard (`teams` /
 *   `departments` `.reportsToUserId`) sees that dashboard's team view.
 * - Everyone else sees only their own numbers: the `performanceEmployees`
 *   row whose `userId` is them.
 *
 * A dashboard is a `companies` row (historical table name).
 */

type Ctx = QueryCtx | MutationCtx;

export interface DashboardAccess {
  companyId: Id<"companies">;
  name: string;
  /** Admin, or lead of a team/department linked to this dashboard. */
  canViewTeam: boolean;
  /** The viewer's own employee row on this dashboard, if one is linked. */
  employeeId: Id<"performanceEmployees"> | null;
}

export interface PerformanceViewer {
  userId: Id<"users">;
  name: string;
  isAdmin: boolean;
  /** Dashboards the viewer can open at all, sorted by name. */
  dashboards: DashboardAccess[];
}

const forbidden = (message = "Kein Zugriff auf dieses Dashboard.") =>
  new ConvexError({ code: "forbidden", message });

const notFound = (message: string) => new ConvexError({ code: "not_found", message });

/** Works out once per request what `caller` may see. Every table read here is
 * small (a handful of dashboards, teams and departments). */
export async function loadViewer(ctx: Ctx, caller: Caller): Promise<PerformanceViewer> {
  const user = caller.user;
  const isAdmin = caller.isAdmin;

  const [companies, memberships, ledTeams, ledDepartments, myEmployees] = await Promise.all([
    ctx.db.query("companies").collect(),
    ctx.db
      .query("userTeams")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect(),
    ctx.db
      .query("teams")
      .collect()
      .then((teams) => teams.filter((t) => t.reportsToUserId === user._id && !t.archivedAt)),
    ctx.db
      .query("departments")
      .collect()
      .then((deps) => deps.filter((d) => d.reportsToUserId === user._id && !d.archivedAt)),
    ctx.db
      .query("performanceEmployees")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect(),
  ]);

  const myTeamIds = new Set<Id<"teams">>(memberships.map((m) => m.teamId));
  const ledTeamIds = new Set<Id<"teams">>(ledTeams.map((t) => t._id));
  const ledDepartmentIds = new Set<Id<"departments">>(ledDepartments.map((d) => d._id));
  const employeeByCompany = new Map<Id<"companies">, Id<"performanceEmployees">>();
  for (const e of myEmployees) {
    if (e.companyId && e.active) employeeByCompany.set(e.companyId, e._id);
  }

  const dashboards: DashboardAccess[] = [];
  for (const company of companies) {
    const teamIds = company.teamIds ?? [];
    const departmentIds = company.departmentIds ?? [];
    const leads =
      teamIds.some((id) => ledTeamIds.has(id)) ||
      departmentIds.some((id) => ledDepartmentIds.has(id));
    const member =
      teamIds.some((id) => myTeamIds.has(id)) ||
      (user.departmentId !== undefined && departmentIds.includes(user.departmentId));
    const employeeId = employeeByCompany.get(company._id) ?? null;
    if (!isAdmin && !leads && !member && !employeeId) continue;
    dashboards.push({
      companyId: company._id,
      name: company.name,
      canViewTeam: isAdmin || leads,
      employeeId,
    });
  }
  dashboards.sort((a, b) => a.name.localeCompare(b.name, "de"));

  return { userId: user._id, name: displayName(user), isAdmin, dashboards };
}

export function requireAdmin(viewer: PerformanceViewer): void {
  if (!viewer.isAdmin) throw forbidden("Nur Admins können das.");
}

/** The dashboard the request is about: `companyIdArg` when given (must be one
 * the viewer can open), otherwise their default — the first one with a team
 * view, else the first one at all. */
export function resolveDashboard(
  viewer: PerformanceViewer,
  companyIdArg: Id<"companies"> | undefined,
): DashboardAccess {
  if (companyIdArg) {
    const match = viewer.dashboards.find((d) => d.companyId === companyIdArg);
    if (!match) throw forbidden();
    return match;
  }
  const preferred =
    viewer.dashboards.find((d) => d.canViewTeam) ??
    viewer.dashboards.find((d) => d.employeeId) ??
    viewer.dashboards[0];
  if (!preferred) throw forbidden("Dir ist noch kein Dashboard zugeordnet.");
  return preferred;
}

/** Team-wide data of a dashboard: admins and that dashboard's leads only. */
export function requireTeamView(
  viewer: PerformanceViewer,
  companyIdArg: Id<"companies"> | undefined,
): Id<"companies"> {
  const dashboard = resolveDashboard(viewer, companyIdArg);
  if (!dashboard.canViewTeam) throw forbidden("Die Team-Ansicht sehen nur Teamleitung und Admins.");
  return dashboard.companyId;
}

/** Whether `viewer` may see `employee`'s numbers: an admin, a lead of the
 * employee's dashboard, or the employee themself. */
export function canViewEmployee(
  viewer: PerformanceViewer,
  employee: Doc<"performanceEmployees">,
): boolean {
  if (viewer.isAdmin) return true;
  if (employee.userId === viewer.userId) return true;
  return viewer.dashboards.some((d) => d.companyId === employee.companyId && d.canViewTeam);
}

/** Loads an employee the viewer may see and returns it with its dashboard id. */
export async function requireViewableEmployee(
  ctx: Ctx,
  viewer: PerformanceViewer,
  employeeId: Id<"performanceEmployees">,
): Promise<{ employee: Doc<"performanceEmployees">; companyId: Id<"companies"> }> {
  const employee = await ctx.db.get(employeeId);
  if (!employee || !employee.companyId) throw notFound("Mitarbeiter nicht gefunden.");
  if (!canViewEmployee(viewer, employee)) throw forbidden();
  return { employee, companyId: employee.companyId };
}

/** An admin acting on one dashboard (upload, settings, flagged rows). */
export async function requireAdminDashboard(
  ctx: Ctx,
  viewer: PerformanceViewer,
  companyId: Id<"companies">,
): Promise<Doc<"companies">> {
  requireAdmin(viewer);
  const company = await ctx.db.get(companyId);
  if (!company) throw notFound("Dashboard nicht gefunden.");
  return company;
}
