import { v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { internalMutation } from "../functions";
import { displayName } from "../lib/users";

/**
 * One-off (11/2026, Vahan): teams are gone, everyone sits in exactly one
 * department, and Performance hangs off departments only.
 *
 * - Onboarding department: Philipp Suft, Dalia Dohlen, Doreen Boateng,
 *   Melina Bagis.
 * - Sales department: every other active person, except Vahan, Kaleb,
 *   Jörg and Andrea Reichl (they keep their department as it is).
 * - Chrisi (christin.endres) is in no department but leads both Sales and
 *   Onboarding.
 * - Dashboards lose their team links; "Onboarding" gets the Onboarding
 *   department, "Advantis" keeps/gets Sales.
 * - Every team is archived (archived teams count nowhere), the legacy
 *   `users.teams` tags and open invites' `teamIds` are cleared.
 *
 * Run from the Convex dashboard: `org/dropTeams:run` with `{ dryRun: true }`
 * first, check the plan, then `{ dryRun: false }`. People are matched by the
 * part of their login address before the "@". `alsoExclude` takes more of
 * those (e.g. `["christin.endres"]`) to leave out of Sales.
 */

const ONBOARDING = ["suft", "dohlen", "boateng", "bagis"];
const UNCHANGED = ["hovhannisyan", "kalebdaniel98", "daniel", "joerg", "joerg.endres", "reichl"];
const CREATOR = "hovhannisyan";
const LEAD = "christin.endres";

const localPart = (email: string) => email.trim().toLowerCase().split("@")[0] ?? "";
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function departmentNamed(
  ctx: MutationCtx,
  name: string,
  createdBy: Id<"users">,
  dryRun: boolean,
): Promise<{ id: Id<"departments"> | null; created: boolean }> {
  const rows = await ctx.db.query("departments").collect();
  const live = rows.find((d) => !d.archivedAt && same(d.name, name));
  if (live) return { id: live._id, created: false };
  if (dryRun) return { id: null, created: true };
  const archived = rows.find((d) => same(d.name, name));
  if (archived) {
    await ctx.db.patch(archived._id, { archivedAt: undefined });
    return { id: archived._id, created: false };
  }
  const id = await ctx.db.insert("departments", { name, createdAt: Date.now(), createdBy });
  return { id, created: true };
}

export const run = internalMutation({
  args: { dryRun: v.boolean(), alsoExclude: v.optional(v.array(v.string())) },
  handler: async (ctx, { dryRun, alsoExclude }) => {
    const users = await ctx.db.query("users").collect();
    const active = users.filter((u) => u.status === "active");
    const creator = users.find((u) => localPart(u.email) === CREATOR) ?? active[0];
    if (!creator) throw new Error("Keine aktiven Nutzer gefunden.");

    const unchanged = new Set([...UNCHANGED, ...(alsoExclude ?? []).map((x) => x.toLowerCase())]);
    const sales = await departmentNamed(ctx, "Sales", creator._id, dryRun);
    const onboarding = await departmentNamed(ctx, "Onboarding", creator._id, dryRun);

    const plan: { name: string; email: string; from: string | null; to: string }[] = [];
    const departments = new Map(
      (await ctx.db.query("departments").collect()).map((d) => [d._id as string, d.name]),
    );
    const assign = async (user: Doc<"users">, to: "Sales" | "Onboarding") => {
      const id = to === "Sales" ? sales.id : onboarding.id;
      const from = user.departmentId ? (departments.get(user.departmentId) ?? "?") : null;
      if (id && user.departmentId === id) return;
      plan.push({ name: displayName(user), email: user.email, from, to });
      if (!dryRun && id) await ctx.db.patch(user._id, { departmentId: id, department: to });
    };

    const left: string[] = [];
    const lead = active.find((u) => localPart(u.email) === LEAD);
    for (const user of active) {
      const key = localPart(user.email);
      if (key === LEAD) {
        const from = user.departmentId ? (departments.get(user.departmentId) ?? "?") : null;
        if (from) plan.push({ name: displayName(user), email: user.email, from, to: "keine" });
        if (!dryRun && from) {
          await ctx.db.patch(user._id, { departmentId: undefined, department: undefined });
        }
      } else if (ONBOARDING.includes(key)) await assign(user, "Onboarding");
      else if (unchanged.has(key)) left.push(`${displayName(user)} <${user.email}>`);
      else await assign(user, "Sales");
    }
    const missingOnboarding = ONBOARDING.filter(
      (key) => !active.some((u) => localPart(u.email) === key),
    );

    // Chrisi leads both.
    if (!dryRun && lead) {
      for (const id of [sales.id, onboarding.id]) {
        if (id) await ctx.db.patch(id, { reportsToUserId: lead._id });
      }
    }

    // Dashboards: departments only.
    const dashboards: string[] = [];
    for (const company of await ctx.db.query("companies").collect()) {
      const ids = new Set<string>(company.departmentIds ?? []);
      if (same(company.name, "Onboarding") && onboarding.id) ids.add(onboarding.id);
      if (same(company.name, "Advantis") && sales.id) ids.add(sales.id);
      const names = [...ids].map(
        (id) => departments.get(id) ?? (id === onboarding.id ? "Onboarding" : "Sales"),
      );
      const hadTeams = (company.teamIds ?? []).length > 0;
      dashboards.push(
        `${company.name}: ${names.join(", ") || "keine Abteilung"}${hadTeams ? " (Team-Verknüpfung entfernt)" : ""}`,
      );
      if (!dryRun) {
        await ctx.db.patch(company._id, {
          teamIds: undefined,
          departmentIds: [...ids] as Id<"departments">[],
        });
      }
    }

    // Teams: archive every one; legacy tags and pending invites lose theirs.
    const teams = (await ctx.db.query("teams").collect()).filter((t) => !t.archivedAt);
    const tagged = users.filter((u) => (u.teams ?? []).length > 0);
    const invites = (await ctx.db.query("invites").collect()).filter(
      (i) => (i.teamIds ?? []).length > 0,
    );
    if (!dryRun) {
      const now = Date.now();
      for (const team of teams) await ctx.db.patch(team._id, { archivedAt: now });
      for (const user of tagged) await ctx.db.patch(user._id, { teams: undefined });
      for (const invite of invites) await ctx.db.patch(invite._id, { teamIds: undefined });
    }

    return {
      dryRun,
      leadOfSalesAndOnboarding: lead ? `${displayName(lead)} <${lead.email}>` : "nicht gefunden",
      newDepartments: [
        ...(sales.created ? ["Sales"] : []),
        ...(onboarding.created ? ["Onboarding"] : []),
      ],
      moves: plan.map((p) => `${p.name} <${p.email}>: ${p.from ?? "keine"} → ${p.to}`),
      unchanged: left,
      missingOnboarding,
      dashboards,
      teamsArchived: teams.map((t) => t.name),
      teamTagsCleared: tagged.length,
      invitesCleared: invites.length,
    };
  },
});
