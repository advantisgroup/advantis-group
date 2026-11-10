/**
 * Call history for a person who joined a dashboard later. A Genesys report
 * goes into every dashboard whose roster has the agent *at upload time*
 * (`uploadParse.ts`), so when someone is added to a team dashboard (e.g.
 * the Onboarding team) their earlier calls and interactions sit only on the
 * dashboard they were on before (Sales). This copies them over: the same
 * intranet account, or the same report name not linked to anyone else.
 *
 * Idempotent — only fills gaps: a call field the target row already has and
 * an interaction day the target already has are left alone.
 */
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { internalAction, internalMutation, internalQuery, userAction } from "../functions";
import { monthBounds, shiftYm } from "./lib/kpi";
import { todayBerlin, toISODate } from "./lib/workdays";

const CALL_FIELDS = [
  "callsToday",
  "callsAnswered",
  "callsOutbound",
  "talkAvgSec",
  "talkTotalSec",
  "loginSec",
] as const;

/** How far back the copy reaches. */
const MONTHS_BACK = 18;

interface Pair {
  target: Id<"performanceEmployees">;
  sources: Id<"performanceEmployees">[];
}

/** Each roster row of the dashboard with its counterparts elsewhere. */
export const pairs = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<Pair[]> => {
    const [own, companies] = await Promise.all([
      ctx.db
        .query("performanceEmployees")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect(),
      ctx.db.query("companies").collect(),
    ]);
    const out: Pair[] = [];
    for (const e of own) {
      const sources = new Set<Id<"performanceEmployees">>();
      const take = (o: Doc<"performanceEmployees">) => {
        if (o._id !== e._id && o.companyId && o.companyId !== companyId) sources.add(o._id);
      };
      if (e.userId) {
        const linked = await ctx.db
          .query("performanceEmployees")
          .withIndex("by_userId", (q) => q.eq("userId", e.userId))
          .collect();
        linked.forEach(take);
      }
      for (const c of companies) {
        if (c._id === companyId) continue;
        const same = await ctx.db
          .query("performanceEmployees")
          .withIndex("by_company_name", (q) => q.eq("companyId", c._id).eq("name", e.name))
          .collect();
        same.filter((o) => !o.userId || !e.userId || o.userId === e.userId).forEach(take);
      }
      if (sources.size > 0) out.push({ target: e._id, sources: [...sources] });
    }
    return out;
  },
});

/** One person, one month: call figures and interactions from `source`. */
export const copyMonth = internalMutation({
  args: {
    target: v.id("performanceEmployees"),
    source: v.id("performanceEmployees"),
    ym: v.string(),
  },
  handler: async (ctx, { target, source, ym }): Promise<{ days: number; interactions: number }> => {
    const targetDoc = await ctx.db.get(target);
    if (!targetDoc?.companyId) return { days: 0, interactions: 0 };
    const companyId = targetDoc.companyId;
    const { start, end } = monthBounds(ym);

    const reports = (employeeId: Id<"performanceEmployees">) =>
      ctx.db
        .query("performanceReports")
        .withIndex("by_employee_date", (q) =>
          q.eq("employeeId", employeeId).gte("reportDate", start).lte("reportDate", end),
        )
        .collect();
    const interactionsOf = (employeeId: Id<"performanceEmployees">) =>
      ctx.db
        .query("performanceInteractions")
        .withIndex("by_employee_date", (q) =>
          q.eq("employeeId", employeeId).gte("date", start).lte("date", end),
        )
        .collect();

    // Daily call figures.
    let days = 0;
    const [srcReports, ownReports] = await Promise.all([reports(source), reports(target)]);
    const ownByDate = new Map(ownReports.map((r) => [r.reportDate, r]));
    for (const r of srcReports) {
      const fields: Partial<Record<(typeof CALL_FIELDS)[number], number>> = {};
      const have = ownByDate.get(r.reportDate);
      for (const f of CALL_FIELDS) {
        if (r[f] !== undefined && have?.[f] === undefined) fields[f] = r[f];
      }
      if (Object.keys(fields).length === 0) continue;
      days++;
      if (have) await ctx.db.patch(have._id, fields);
      else {
        await ctx.db.insert("performanceReports", {
          employeeId: target,
          companyId,
          reportDate: r.reportDate,
          ...fields,
          sourceFile: r.sourceFile,
          uploadedAt: r.uploadedAt,
        });
      }
    }

    // Single interactions, by whole days.
    let interactions = 0;
    const [srcInter, ownInter] = await Promise.all([
      interactionsOf(source),
      interactionsOf(target),
    ]);
    const ownDays = new Set(ownInter.map((i) => i.date));
    for (const i of srcInter) {
      if (ownDays.has(i.date)) continue;
      await ctx.db.insert("performanceInteractions", {
        employeeId: target,
        companyId,
        date: i.date,
        startedAt: i.startedAt,
        durationSec: i.durationSec,
        ...(i.direction !== undefined ? { direction: i.direction } : {}),
        sourceFile: i.sourceFile,
        uploadedAt: i.uploadedAt,
      });
      interactions++;
    }
    return { days, interactions };
  },
});

async function adopt(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  companyId: Id<"companies">,
): Promise<{ people: number; days: number; interactions: number }> {
  const list: Pair[] = await ctx.runQuery(internal.performance.callHistory.pairs, { companyId });
  const now = toISODate(todayBerlin()).slice(0, 7);
  const months = Array.from({ length: MONTHS_BACK }, (_, i) => shiftYm(now, -i));
  let days = 0;
  let interactions = 0;
  for (const p of list) {
    for (const source of p.sources) {
      for (const ym of months) {
        const r: { days: number; interactions: number } = await ctx.runMutation(
          internal.performance.callHistory.copyMonth,
          { target: p.target, source, ym },
        );
        days += r.days;
        interactions += r.interactions;
      }
    }
  }
  return { people: list.length, days, interactions };
}

/** Scheduled after a calls dashboard's settings change (roster may grow). */
export const adoptInternal = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await adopt(ctx, companyId);
  },
});

/** "Call-Historie übernehmen" in Einstellungen. */
export const adoptForDashboard = userAction({
  role: "admin",
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => adopt(ctx, companyId),
});
