/**
 * Wallbox campaign dashboard (dashboard kind `wallbox`): storing the two
 * campaign reports (parsed in `lib/wallboxImport.ts`) and reading them back
 * for the team view, an employee's own page and the history chart. Calls of
 * the Wallbox team come from the shared call report like everywhere else.
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery, userQuery } from "../functions";
import { loadViewer, requireViewableEmployee, resolveDashboard } from "./lib/access";
import { countsOnDashboard } from "./lib/reports";
import { dashboardKind, nameKey, rosterOf, syncTeamRoster } from "./lib/roster";
import { matchFirstName, summarizeOpps } from "./lib/wallboxImport";

type Ctx = QueryCtx | MutationCtx;

async function requireWallbox(ctx: Ctx, companyId: Id<"companies">): Promise<Doc<"companies">> {
  const company = await ctx.db.get(companyId);
  if (!company) throw new ConvexError({ code: "not_found", message: "Dashboard nicht gefunden." });
  if (dashboardKind(company) !== "wallbox") {
    throw new ConvexError({
      code: "wrong_dashboard",
      message:
        "Wallbox-Reports gehören ins Wallbox-Dashboard. Bitte oben das Wallbox-Dashboard wählen und dort hochladen.",
    });
  }
  return company;
}

/** Replaces the snapshot of one report day and source, if there is one. */
async function replaceSnapshot(
  ctx: MutationCtx,
  row: Omit<Doc<"performanceWallboxSnapshots">, "_id" | "_creationTime">,
): Promise<void> {
  const existing = await ctx.db
    .query("performanceWallboxSnapshots")
    .withIndex("by_company_source_date", (q) =>
      q.eq("companyId", row.companyId).eq("source", row.source).eq("reportDate", row.reportDate),
    )
    .collect();
  for (const old of existing) await ctx.db.delete(old._id);
  await ctx.db.insert("performanceWallboxSnapshots", row);
}

/** Full names the members report's first names can map to: the roster plus
 * the acquirers of the newest opp report. */
async function knownFullNames(ctx: Ctx, companyId: Id<"companies">): Promise<string[]> {
  const roster = await rosterOf(ctx, companyId);
  const latestOpps = await ctx.db
    .query("performanceWallboxSnapshots")
    .withIndex("by_company_source_date", (q) => q.eq("companyId", companyId).eq("source", "opps"))
    .order("desc")
    .first();
  const acquirers = (latestOpps?.people ?? [])
    .filter((p) => p.role === "acquirer")
    .map((p) => p.name);
  return [...new Set([...roster.filter((r) => r.userId).map((r) => r.name), ...acquirers])];
}

const statusValidator = v.object({ status: v.string(), count: v.number(), ev: v.number() });

export const saveMembers = internalMutation({
  args: {
    companyId: v.id("companies"),
    reportDate: v.string(),
    campaign: v.optional(v.string()),
    total: v.number(),
    statuses: v.array(statusValidator),
    people: v.array(
      v.object({ name: v.string(), inProgress: v.number(), inProgressEv: v.number() }),
    ),
    sourceFile: v.string(),
  },
  handler: async (ctx, args): Promise<{ unmatched: string[] }> => {
    const company = await requireWallbox(ctx, args.companyId);
    await syncTeamRoster(ctx, company);
    const roster = await rosterOf(ctx, args.companyId);
    const fullNames = await knownFullNames(ctx, args.companyId);
    const unmatched: string[] = [];
    const people = args.people.map((p) => {
      const full = matchFirstName(p.name, fullNames);
      if (!full) unmatched.push(p.name);
      const matches = full
        ? roster.filter((r) => r.userId && nameKey(r.name) === nameKey(full))
        : [];
      const employee = matches.length === 1 ? matches[0] : undefined;
      return {
        name: full ?? p.name,
        role: "member" as const,
        employeeId: employee?.id,
        inProgress: p.inProgress,
        inProgressEv: p.inProgressEv,
      };
    });
    await replaceSnapshot(ctx, {
      companyId: args.companyId,
      reportDate: args.reportDate,
      source: "members",
      campaign: args.campaign,
      total: args.total,
      statuses: args.statuses,
      people,
      sourceFile: args.sourceFile,
      uploadedAt: Date.now(),
    });
    return { unmatched };
  },
});

const oppRowValidator = v.object({
  owner: v.string(),
  acquiredBy: v.string(),
  account: v.string(),
  closed: v.boolean(),
  won: v.boolean(),
});

/** The opp report: our employees are the "Acquired By" names, owners are
 * field sales and only counted. */
export const saveOpps = internalMutation({
  args: {
    companyId: v.id("companies"),
    reportDate: v.string(),
    campaign: v.optional(v.string()),
    rows: v.array(oppRowValidator),
    sourceFile: v.string(),
  },
  handler: async (ctx, args): Promise<{ listKept?: string }> => {
    const company = await requireWallbox(ctx, args.companyId);
    await syncTeamRoster(ctx, company);
    const roster = await rosterOf(ctx, args.companyId);
    // Acquirers are matched to the team's own rows (linked to an intranet
    // account) but never added: someone outside the linked teams still shows
    // up in the tables by name, without getting a roster row — so their
    // calls don't flow into this dashboard either.
    const team = roster.filter((r) => r.userId);
    const employeeFor = (acquiredBy: string): Id<"performanceEmployees"> | undefined => {
      if (!acquiredBy) return undefined;
      // Exact (normalised, any word order) only — the numbers end up on
      // that person's own page.
      const exact = team.filter((r) => nameKey(r.name) === nameKey(acquiredBy));
      return exact.length === 1 ? exact[0].id : undefined;
    };

    const summary = summarizeOpps(args.rows);
    const people: Doc<"performanceWallboxSnapshots">["people"] = [];
    const acquirerIds = new Map<string, Id<"performanceEmployees"> | undefined>();
    for (const a of summary.byAcquirer) {
      const realName = a.name === "(ohne Angabe)" ? "" : a.name;
      const employeeId = employeeFor(realName);
      acquirerIds.set(realName.toLowerCase(), employeeId);
      people.push({ role: "acquirer", employeeId, ...a });
    }
    for (const o of summary.byOwner) people.push({ role: "owner", ...o });

    await replaceSnapshot(ctx, {
      companyId: args.companyId,
      reportDate: args.reportDate,
      source: "opps",
      campaign: args.campaign,
      total: summary.total,
      people,
      sourceFile: args.sourceFile,
      uploadedAt: Date.now(),
    });

    // The opp list behind the tables: only replaced by a report at least as
    // new as the one it holds.
    const state = await ctx.db
      .query("performanceImportState")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .first();
    const current = state?.wallboxOppsReportDate;
    if (current && args.reportDate < current) return { listKept: current };
    const old = await ctx.db
      .query("performanceWallboxOpps")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    for (const r of args.rows) {
      await ctx.db.insert("performanceWallboxOpps", {
        companyId: args.companyId,
        reportDate: args.reportDate,
        ...r,
        acquiredByEmployeeId: acquirerIds.get(r.acquiredBy.toLowerCase()),
      });
    }
    if (state) await ctx.db.patch(state._id, { wallboxOppsReportDate: args.reportDate });
    else
      await ctx.db.insert("performanceImportState", {
        companyId: args.companyId,
        wallboxOppsReportDate: args.reportDate,
      });
    return {};
  },
});

/** Ensures every Wallbox / calls-only dashboard's roster contains its team's
 * members, then returns every dashboard's roster for a call or interactions
 * report to be matched against (the shared Genesys report feeds them all). */
export const prepareCallTargets = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    {
      companyId: Id<"companies">;
      name: string;
      employees: { id: Id<"performanceEmployees">; name: string }[];
    }[]
  > => {
    const companies = await ctx.db.query("companies").collect();
    const out = [];
    for (const company of companies) {
      await syncTeamRoster(ctx, company);
      const roster = await rosterOf(ctx, company._id);
      // Wallbox / calls-only dashboards: only their team's linked rows.
      const team = dashboardKind(company) === "sales" ? roster : roster.filter((r) => r.userId);
      out.push({
        companyId: company._id,
        name: company.name,
        employees: team
          .filter((r) => countsOnDashboard({ name: r.name, active: true }))
          .map((r) => ({ id: r.id, name: r.name })),
      });
    }
    return out;
  },
});

/** What kind of dashboard an upload goes into (null when it doesn't exist). */
export const companyKind = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const company = await ctx.db.get(companyId);
    return company ? dashboardKind(company) : null;
  },
});

// ------------------------------------------------------------------- reads

type Snapshot = Doc<"performanceWallboxSnapshots">;

async function snapshots(ctx: QueryCtx, companyId: Id<"companies">, source: "members" | "opps") {
  return await ctx.db
    .query("performanceWallboxSnapshots")
    .withIndex("by_company_source_date", (q) => q.eq("companyId", companyId).eq("source", source))
    .collect();
}

export interface WallboxPersonRow {
  name: string;
  employeeId: Id<"performanceEmployees"> | null;
  inProgress: number;
  inProgressEv: number;
  opps: number;
  open: number;
  won: number;
  lost: number;
  /** Change in opps since the previous opp report. */
  oppsDelta: number | null;
}

/** Both reports name the same person differently ("Nadine" resolved to
 * "Nadine Weidenhammer", "Nadine WEIDENHAMMER"), so rows join on the
 * normalised name. */
function keyOf(p: { name: string }): string {
  return nameKey(p.name);
}

/** Joins the members (In Progress) and opp (Acquired By) side per employee. */
function peopleRows(
  members: Snapshot | undefined,
  opps: Snapshot | undefined,
  prevOpps: Snapshot | undefined,
  hidden: ReadonlySet<string>,
): WallboxPersonRow[] {
  const rows = new Map<string, WallboxPersonRow>();
  const row = (p: Snapshot["people"][number]) => {
    const key = keyOf(p);
    const cur = rows.get(key) ?? {
      name: p.name,
      employeeId: null,
      inProgress: 0,
      inProgressEv: 0,
      opps: 0,
      open: 0,
      won: 0,
      lost: 0,
      oppsDelta: null,
    };
    cur.employeeId ??= p.employeeId ?? null;
    rows.set(key, cur);
    return cur;
  };
  // A first name the members upload couldn't resolve ("In Progress -
  // Michael", e.g. when the opp report came in after it, or the person isn't
  // in the linked team) joins the opp report's acquirer with that first name,
  // if exactly one has it — otherwise "Michael" and "Michael Eysselein" would
  // be two rows for one person.
  const acquirerNames = (opps?.people ?? [])
    .filter((p) => p.role === "acquirer")
    .map((p) => p.name);
  for (const raw of members?.people ?? []) {
    const single = raw.name.trim().split(/\s+/).length === 1;
    const full = single ? matchFirstName(raw.name, acquirerNames) : null;
    const p = full ? { ...raw, name: full } : raw;
    const r = row(p);
    r.inProgress += p.inProgress ?? 0;
    r.inProgressEv += p.inProgressEv ?? 0;
  }
  const prevByKey = new Map(
    (prevOpps?.people ?? [])
      .filter((p) => p.role === "acquirer")
      .map((p) => [keyOf(p), p.opps ?? 0]),
  );
  for (const p of opps?.people ?? []) {
    if (p.role !== "acquirer") continue;
    const r = row(p);
    r.opps += p.opps ?? 0;
    r.open += p.open ?? 0;
    r.won += p.won ?? 0;
    r.lost += p.lost ?? 0;
    if (prevOpps) r.oppsDelta = (p.opps ?? 0) - (prevByKey.get(keyOf(p)) ?? 0);
  }
  return [...rows.values()]
    .filter((r) => !(r.employeeId && hidden.has(r.employeeId)))
    .sort(
      (a, b) =>
        b.opps - a.opps || b.inProgress - a.inProgress || a.name.localeCompare(b.name, "de"),
    );
}

function totalsOf(members: Snapshot | undefined, opps: Snapshot | undefined) {
  const acquirers = (opps?.people ?? []).filter((p) => p.role === "acquirer");
  const sum = (k: "open" | "won" | "lost") => acquirers.reduce((a, p) => a + (p[k] ?? 0), 0);
  return {
    members: members?.total ?? null,
    inProgress: members?.statuses?.find((s) => s.status === "In Progress")?.count ?? null,
    opps: opps?.total ?? null,
    open: opps ? sum("open") : null,
    won: opps ? sum("won") : null,
    lost: opps ? sum("lost") : null,
  };
}

async function hiddenEmployees(ctx: QueryCtx, companyId: Id<"companies">): Promise<Set<string>> {
  const roster = await rosterOf(ctx, companyId);
  return new Set(roster.filter((r) => !countsOnDashboard(r)).map((r) => r.id));
}

/** Team view of a Wallbox dashboard: admins and the dashboard's lead. */
export const overview = userQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, { companyId: companyIdArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const dashboard = resolveDashboard(viewer, companyIdArg);
    if (!dashboard.canViewTeam) {
      throw new ConvexError({
        code: "forbidden",
        message: "Die Team-Ansicht sehen nur Teamleitung und Admins.",
      });
    }
    const companyId = dashboard.companyId;
    const [members, opps, hidden] = await Promise.all([
      snapshots(ctx, companyId, "members"),
      snapshots(ctx, companyId, "opps"),
      hiddenEmployees(ctx, companyId),
    ]);
    const latestMembers = members.at(-1);
    const latestOpps = opps.at(-1);
    const prevMembers = members.at(-2);
    const prevOpps = opps.at(-2);

    // History: one point per report day that has either report, each
    // source carried forward to days where only the other was uploaded.
    const days = [...new Set([...members, ...opps].map((s) => s.reportDate))].sort();
    let m: Snapshot | undefined;
    let o: Snapshot | undefined;
    const mByDay = new Map(members.map((s) => [s.reportDate, s]));
    const oByDay = new Map(opps.map((s) => [s.reportDate, s]));
    const history = days.map((date) => {
      m = mByDay.get(date) ?? m;
      o = oByDay.get(date) ?? o;
      return { date, ...totalsOf(m, o) };
    });

    return {
      campaign: latestOpps?.campaign ?? latestMembers?.campaign ?? null,
      membersDate: latestMembers?.reportDate ?? null,
      oppsDate: latestOpps?.reportDate ?? null,
      totals: totalsOf(latestMembers, latestOpps),
      previous:
        prevMembers || prevOpps
          ? totalsOf(prevMembers ?? latestMembers, prevOpps ?? latestOpps)
          : null,
      statuses: latestMembers?.statuses ?? [],
      people: peopleRows(latestMembers, latestOpps, prevOpps, hidden),
      owners: (latestOpps?.people ?? [])
        .filter((p) => p.role === "owner")
        .map((p) => ({
          name: p.name,
          opps: p.opps ?? 0,
          open: p.open ?? 0,
          won: p.won ?? 0,
          lost: p.lost ?? 0,
        })),
      history,
    };
  },
});

/** One employee's own Wallbox numbers with their history. */
export const employee = userQuery({
  args: { employeeId: v.id("performanceEmployees") },
  handler: async (ctx, { employeeId }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const { employee, companyId } = await requireViewableEmployee(ctx, viewer, employeeId);
    const company = await ctx.db.get(companyId);
    if (dashboardKind(company) !== "wallbox") return null;
    const [members, opps] = await Promise.all([
      snapshots(ctx, companyId, "members"),
      snapshots(ctx, companyId, "opps"),
    ]);
    const mine = (s: Snapshot | undefined, role: "member" | "acquirer") =>
      s?.people.find(
        (p) =>
          p.role === role &&
          (p.employeeId === employeeId || nameKey(p.name) === nameKey(employee.name)),
      );
    const days = [...new Set([...members, ...opps].map((s) => s.reportDate))].sort();
    const mByDay = new Map(members.map((s) => [s.reportDate, s]));
    const oByDay = new Map(opps.map((s) => [s.reportDate, s]));
    let m: Snapshot | undefined;
    let o: Snapshot | undefined;
    const history = days.map((date) => {
      m = mByDay.get(date) ?? m;
      o = oByDay.get(date) ?? o;
      const mm = mine(m, "member");
      const oo = mine(o, "acquirer");
      return {
        date,
        inProgress: mm?.inProgress ?? 0,
        opps: oo?.opps ?? 0,
        won: oo?.won ?? 0,
        lost: oo?.lost ?? 0,
      };
    });
    const latestMembers = members.at(-1);
    const latestOpps = opps.at(-1);
    const row = peopleRows(latestMembers, latestOpps, opps.at(-2), new Set()).find(
      (r) => r.employeeId === employeeId || nameKey(r.name) === nameKey(employee.name),
    );
    return {
      name: employee.name,
      membersDate: latestMembers?.reportDate ?? null,
      oppsDate: latestOpps?.reportDate ?? null,
      row: row ?? null,
      history,
    };
  },
});

/** The opportunities behind a table row: by our employee (Acquired By) or
 * by field-sales owner. Employees only ever get their own. */
export const oppList = userQuery({
  args: {
    companyId: v.id("companies"),
    by: v.union(v.literal("acquirer"), v.literal("owner")),
    name: v.optional(v.string()),
    employeeId: v.optional(v.id("performanceEmployees")),
  },
  handler: async (ctx, { companyId, by, name, employeeId }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const dashboard = resolveDashboard(viewer, companyId);
    if (!dashboard.canViewTeam) {
      // Own opportunities only.
      if (by !== "acquirer" || !employeeId || employeeId !== dashboard.employeeId) {
        throw new ConvexError({ code: "forbidden", message: "Kein Zugriff." });
      }
    }
    const rows = await ctx.db
      .query("performanceWallboxOpps")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    // Opps without an "Acquired By" are counted under this label.
    const key = name === "(ohne Angabe)" ? "" : name?.toLowerCase();
    const picked = rows.filter((r) =>
      by === "owner"
        ? r.owner.toLowerCase() === key
        : employeeId
          ? r.acquiredByEmployeeId === employeeId
          : r.acquiredBy.toLowerCase() === key,
    );
    return {
      reportDate: rows[0]?.reportDate ?? null,
      rows: picked
        .map((r) => ({
          account: r.account,
          owner: r.owner,
          acquiredBy: r.acquiredBy,
          status: !r.closed ? ("open" as const) : r.won ? ("won" as const) : ("lost" as const),
        }))
        .sort(
          (a, b) => a.status.localeCompare(b.status) || a.account.localeCompare(b.account, "de"),
        ),
    };
  },
});
