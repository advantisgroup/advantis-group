/**
 * Read-only export query for Performance — apps/api turns this into a
 * downloadable .xlsx (port of the reference script's `employee_export`).
 * Same client/server split as the upload pipeline: Convex returns plain
 * data, apps/api owns the actual spreadsheet I/O via `xlsx`.
 */
import { v } from "convex/values";

import { serverQuery } from "../functions";
import { teamTotals } from "./queries";

export interface ExportRow {
  name: string;
  leadsCreated: number;
  workableCreated: number;
  leadsAnalysis: number;
  leadsDetailsIdent: number;
  oppsOpen: number;
  oppsClose7d: number;
  oppsPending: number;
  wonMonth: number;
  overduesAnalysis: number;
  overduesOpps: number;
  oppsOver30: number;
  leadsNoAction14: number;
  oppsNoAction14: number;
  workableRate: number | null;
  hitrate: number | null;
  fc1: number | null;
  unqualifiedReasons: string;
}

/** Per-employee KPI export for one month. */
export const apiExportTeam = serverQuery({
  args: { companyId: v.id("companies"), ym: v.string() },
  handler: async (ctx, { companyId, ym }): Promise<ExportRow[]> => {
    const { snaps } = await teamTotals(ctx, companyId, ym);
    return snaps.map((s) => ({
      name: s.name,
      leadsCreated: s.leadsCreated ?? 0,
      workableCreated: s.workableCreated ?? 0,
      leadsAnalysis: s.leadsAnalysis ?? 0,
      leadsDetailsIdent: s.leadsDetailsIdent ?? 0,
      oppsOpen: s.oppsOpen ?? 0,
      oppsClose7d: s.oppsClose7d ?? 0,
      oppsPending: s.oppsPending ?? 0,
      wonMonth: s.wonMonth ?? 0,
      overduesAnalysis: s.overduesAnalysis ?? 0,
      overduesOpps: s.overduesOpps ?? 0,
      oppsOver30: s.oppsOver30 ?? 0,
      leadsNoAction14: s.leadsNoAction14 ?? 0,
      oppsNoAction14: s.oppsNoAction14 ?? 0,
      workableRate: s.workableRate ?? null,
      hitrate: s.hitrate ?? null,
      fc1: s.fc1 ?? null,
      unqualifiedReasons: s.unqualifiedReasons ?? "",
    }));
  },
});
