import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { displayName } from "../../lib/users";

/** The kinds of dashboard (see `companies.kind` in the schema). */
export type DashboardKind = "sales" | "wallbox" | "calls";

export function dashboardKind(company: Pick<Doc<"companies">, "kind"> | null): DashboardKind {
  return company?.kind ?? "sales";
}

/** Lowercase, no accents, ß→ss, single spaces, word order ignored — so
 * "Eyßelein, Michael" in a report matches "Michael Eyßelein" in the intranet. */
export function nameKey(name: string): string {
  return name
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Active intranet users in the dashboard's linked teams and departments. */
export async function dashboardMembers(
  ctx: QueryCtx | MutationCtx,
  company: Doc<"companies">,
): Promise<Doc<"users">[]> {
  const teamIds = new Set<string>(company.teamIds ?? []);
  const departmentIds = new Set<string>(company.departmentIds ?? []);
  if (teamIds.size === 0 && departmentIds.size === 0) return [];
  // Archived teams/departments no longer count.
  for (const id of [...teamIds]) {
    const team = await ctx.db.get(id as Id<"teams">);
    if (!team || team.archivedAt) teamIds.delete(id);
  }
  for (const id of [...departmentIds]) {
    const dep = await ctx.db.get(id as Id<"departments">);
    if (!dep || dep.archivedAt) departmentIds.delete(id);
  }
  const [users, memberships] = await Promise.all([
    ctx.db.query("users").collect(),
    teamIds.size > 0 ? ctx.db.query("userTeams").collect() : Promise.resolve([]),
  ]);
  const inTeam = new Set<string>(
    memberships.filter((m) => teamIds.has(m.teamId)).map((m) => m.userId),
  );
  return users.filter(
    (u) =>
      u.status === "active" &&
      (inTeam.has(u._id) || (u.departmentId !== undefined && departmentIds.has(u.departmentId))),
  );
}

/**
 * For Wallbox and calls-only dashboards the roster is the linked intranet
 * team itself (their reports don't name everyone the way Salesforce owner
 * columns do): every member gets an employee row linked to their account,
 * reusing an unlinked row with the same name (e.g. one an earlier report
 * created) before adding a new one. Never unlinks or deletes anything.
 * Sales dashboards keep building their roster from the Salesforce exports.
 */
export async function syncTeamRoster(
  ctx: MutationCtx,
  company: Doc<"companies">,
): Promise<{ added: number; linked: number }> {
  if (dashboardKind(company) === "sales") return { added: 0, linked: 0 };
  const members = (await dashboardMembers(ctx, company)).filter((u) => !u.external);
  if (members.length === 0) return { added: 0, linked: 0 };
  const employees = await ctx.db
    .query("performanceEmployees")
    .withIndex("by_company", (q) => q.eq("companyId", company._id))
    .collect();
  const byUser = new Set<string>(employees.flatMap((e) => (e.userId ? [e.userId] : [])));
  let added = 0;
  let linked = 0;
  for (const user of members) {
    if (byUser.has(user._id)) continue;
    const name = displayName(user);
    // Exact (normalised) name only: the fuzzy report matcher treats prefixes
    // as equal ("Maria" ~ "Marian"), which is fine for a report row but
    // would silently hand someone another person's numbers here. Anything
    // less certain is left for an admin under Einstellungen.
    const sameName = employees.filter((e) => !e.userId && nameKey(e.name) === nameKey(name));
    const match = sameName.length === 1 ? sameName[0] : undefined;
    if (match) {
      await ctx.db.patch(match._id, { userId: user._id });
      match.userId = user._id;
      linked++;
    } else {
      const id = await ctx.db.insert("performanceEmployees", {
        name,
        active: true,
        companyId: company._id,
        userId: user._id,
      });
      employees.push({
        _id: id,
        _creationTime: Date.now(),
        name,
        active: true,
        companyId: company._id,
        userId: user._id,
      });
      added++;
    }
    byUser.add(user._id);
  }
  return { added, linked };
}

/** The roster names of a dashboard reports are matched against. */
export async function rosterOf(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
): Promise<
  { id: Id<"performanceEmployees">; name: string; active: boolean; userId?: Id<"users"> }[]
> {
  const employees = await ctx.db
    .query("performanceEmployees")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  return employees.map((e) => ({ id: e._id, name: e.name, active: e.active, userId: e.userId }));
}
