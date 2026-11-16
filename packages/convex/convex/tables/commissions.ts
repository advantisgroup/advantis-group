import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commissionTables = {
  /** Provisionen (Organisation → Provisionen): what an admin changed by hand
   * for one employee and month. The page still works everything out from the
   * Performance reports; a row here only overrides Closed Won / hitrate and
   * records whether the sick-free bonus was paid out (which also restarts
   * the 3-month count). One row per dashboard, month and report name. */
  commissionAdjustments: defineTable({
    companyId: v.id("companies"),
    ym: v.string(),
    employeeId: v.id("performanceEmployees"),
    wonOverride: v.optional(v.number()),
    hitrateOverride: v.optional(v.number()),
    healthyPaid: v.optional(v.boolean()),
    note: v.optional(v.string()),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_company_ym", ["companyId", "ym"])
    .index("by_employee_ym", ["employeeId", "ym"]),
};
