/**
 * Admin settings for Performance: which dashboards exist, which intranet
 * teams/departments belong to each, and which intranet person stands behind
 * each report name (`performanceEmployees.userId`). Intranet admins only.
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { slugify } from "../lib/text";
import { displayName } from "../lib/users";
import { EXCLUDED_OWNERS } from "./lib/salesforceImport";

const notFound = (message: string) => new ConvexError({ code: "not_found", message });

async function getDashboard(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
): Promise<Doc<"companies">> {
  const company = await ctx.db.get(companyId);
  if (!company) throw notFound("Dashboard nicht gefunden.");
  return company;
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

export const list = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const [companies, teams, departments] = await Promise.all([
      ctx.db.query("companies").collect(),
      ctx.db.query("teams").collect(),
      ctx.db.query("departments").collect(),
    ]);
    const teamName = new Map(teams.map((t) => [t._id, t.name]));
    const departmentName = new Map(departments.map((d) => [d._id, d.name]));

    const rows = await Promise.all(
      companies.map(async (c) => {
        const employees = await ctx.db
          .query("performanceEmployees")
          .withIndex("by_company", (q) => q.eq("companyId", c._id))
          .collect();
        const visible = employees.filter(
          (e) => e.active && !EXCLUDED_OWNERS.has(e.name.toLowerCase()),
        );
        return {
          companyId: c._id,
          name: c.name,
          teams: (c.teamIds ?? []).map((id) => ({ id, name: teamName.get(id) ?? "?" })),
          departments: (c.departmentIds ?? []).map((id) => ({
            id,
            name: departmentName.get(id) ?? "?",
          })),
          employeeCount: visible.length,
          linkedCount: visible.filter((e) => e.userId).length,
        };
      }),
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

/** Teams and departments to choose from when linking a dashboard. */
export const orgOptions = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const [teams, departments] = await Promise.all([
      ctx.db.query("teams").collect(),
      ctx.db.query("departments").collect(),
    ]);
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "de");
    return {
      teams: teams
        .filter((t) => !t.archivedAt)
        .map((t) => ({ id: t._id, name: t.name, hasLead: Boolean(t.reportsToUserId) }))
        .sort(byName),
      departments: departments
        .filter((d) => !d.archivedAt)
        .map((d) => ({ id: d._id, name: d.name, hasLead: Boolean(d.reportsToUserId) }))
        .sort(byName),
    };
  },
});

const orgArgs = {
  teamIds: v.array(v.id("teams")),
  departmentIds: v.array(v.id("departments")),
};

export const create = userMutation({
  role: "admin",
  args: { name: v.string(), ...orgArgs },
  handler: async (ctx, { name, teamIds, departmentIds }): Promise<Id<"companies">> => {
    const trimmed = name.trim();
    if (!trimmed)
      throw new ConvexError({ code: "validation", message: "Bitte einen Namen eingeben." });
    const base = slugify(trimmed, "dashboard");
    let slug = base;
    for (let i = 2; ; i++) {
      const taken = await ctx.db
        .query("companies")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (!taken) break;
      slug = `${base}-${i}`;
    }
    const now = Date.now();
    return await ctx.db.insert("companies", {
      name: trimmed,
      slug,
      teamIds,
      departmentIds,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = userMutation({
  role: "admin",
  args: { companyId: v.id("companies"), name: v.string(), ...orgArgs },
  handler: async (ctx, { companyId, name, teamIds, departmentIds }): Promise<void> => {
    await getDashboard(ctx, companyId);
    const trimmed = name.trim();
    if (!trimmed)
      throw new ConvexError({ code: "validation", message: "Bitte einen Namen eingeben." });
    await ctx.db.patch(companyId, { name: trimmed, teamIds, departmentIds, updatedAt: Date.now() });
  },
});

/** Every report name on a dashboard with the intranet person behind it, and
 * an unambiguous name match as a suggestion where nobody is linked yet. */
export const employees = userQuery({
  role: "admin",
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await getDashboard(ctx, companyId);
    const [employees, users] = await Promise.all([
      ctx.db
        .query("performanceEmployees")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect(),
      ctx.db.query("users").collect(),
    ]);
    const activeUsers = users.filter((u) => u.status === "active");
    const userById = new Map(users.map((u) => [u._id, u]));
    const usersByKey = new Map<string, Doc<"users">[]>();
    for (const u of activeUsers) {
      const key = nameKey(displayName(u));
      usersByKey.set(key, [...(usersByKey.get(key) ?? []), u]);
    }

    return employees
      .filter((e) => !EXCLUDED_OWNERS.has(e.name.toLowerCase()))
      .map((e) => {
        const user = e.userId ? userById.get(e.userId) : undefined;
        const candidates = usersByKey.get(nameKey(e.name)) ?? [];
        return {
          id: e._id,
          name: e.name,
          active: e.active,
          user: user ? { id: user._id, name: displayName(user), email: user.email } : null,
          suggestion:
            !user && candidates.length === 1
              ? { id: candidates[0]._id, name: displayName(candidates[0]) }
              : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

async function assertUserFree(
  ctx: MutationCtx,
  employee: Doc<"performanceEmployees">,
  userId: Id<"users">,
): Promise<void> {
  const others = await ctx.db
    .query("performanceEmployees")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  if (others.some((o) => o._id !== employee._id && o.companyId === employee.companyId)) {
    throw new ConvexError({
      code: "validation",
      message: "Diese Person ist auf diesem Dashboard schon einem anderen Namen zugeordnet.",
    });
  }
}

export const linkEmployee = userMutation({
  role: "admin",
  args: {
    employeeId: v.id("performanceEmployees"),
    userId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, { employeeId, userId }): Promise<void> => {
    const employee = await ctx.db.get(employeeId);
    if (!employee) throw notFound("Mitarbeiter nicht gefunden.");
    if (userId) {
      const user = await ctx.db.get(userId);
      if (!user) throw notFound("Person nicht gefunden.");
      await assertUserFree(ctx, employee, userId);
    }
    await ctx.db.patch(employeeId, { userId: userId ?? undefined });
  },
});

/** Hides a report name from the dashboard (left the team, test account…). */
export const setEmployeeActive = userMutation({
  role: "admin",
  args: { employeeId: v.id("performanceEmployees"), active: v.boolean() },
  handler: async (ctx, { employeeId, active }): Promise<void> => {
    if (!(await ctx.db.get(employeeId))) throw notFound("Mitarbeiter nicht gefunden.");
    await ctx.db.patch(employeeId, { active });
  },
});

/**
 * Fills in missing links for one dashboard: first from the old Performance
 * logins (an admin had linked login → report name and login → intranet
 * account), then by unambiguous name match. Never overwrites a link.
 */
export const autoLink = userMutation({
  role: "admin",
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<{ fromLogins: number; byName: number }> => {
    await getDashboard(ctx, companyId);
    const employees = await ctx.db
      .query("performanceEmployees")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const taken = new Set(employees.flatMap((e) => (e.userId ? [e.userId] : [])));
    const link = async (employee: Doc<"performanceEmployees">, userId: Id<"users">) => {
      await ctx.db.patch(employee._id, { userId });
      employee.userId = userId;
      taken.add(userId);
    };

    let fromLogins = 0;
    const logins = await ctx.db.query("performanceLogins").collect();
    for (const login of logins) {
      if (!login.employeeId || !login.linkedUserId || taken.has(login.linkedUserId)) continue;
      const employee = employees.find((e) => e._id === login.employeeId);
      if (!employee || employee.userId || EXCLUDED_OWNERS.has(employee.name.toLowerCase()))
        continue;
      await link(employee, login.linkedUserId);
      fromLogins++;
    }

    let byName = 0;
    const users = (await ctx.db.query("users").collect()).filter((u) => u.status === "active");
    const usersByKey = new Map<string, Id<"users">[]>();
    for (const u of users) {
      const key = nameKey(displayName(u));
      usersByKey.set(key, [...(usersByKey.get(key) ?? []), u._id]);
    }
    for (const employee of employees) {
      if (employee.userId || EXCLUDED_OWNERS.has(employee.name.toLowerCase())) continue;
      const candidates = usersByKey.get(nameKey(employee.name)) ?? [];
      if (candidates.length !== 1 || taken.has(candidates[0])) continue;
      await link(employee, candidates[0]);
      byName++;
    }
    return { fromLogins, byName };
  },
});
