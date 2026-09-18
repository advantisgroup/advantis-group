import { mutation } from "../functions";
/**
 * CRUD for Performance "topics" — admin-set monthly goals/todos for an
 * employee. Ported from the reference script's `topic_save`/`topic_delete`/
 * `topic_status` routes.
 *
 * Creating, editing, and deleting a topic is admin-only; the employee
 * themself may only change its status (matches `topic_status` being
 * `login_required` rather than `admin_required` in the source).
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import {
  requireCanViewEmployee as requireCanView,
  requirePermission,
  requireSessionLogin as requireLogin,
} from "./lib/auth";

async function getEmployeeOrThrow(
  ctx: MutationCtx,
  employeeId: Id<"performanceEmployees">,
): Promise<Doc<"performanceEmployees">> {
  const employee = await ctx.db.get(employeeId);
  if (!employee) {
    throw new ConvexError({
      code: "not_found",
      message: "Employee not found.",
    });
  }
  return employee;
}

const TOPIC_STATUSES = ["offen", "erreicht", "nicht_erreicht"] as const;
const statusValidator = v.union(
  v.literal("offen"),
  v.literal("erreicht"),
  v.literal("nicht_erreicht"),
);

async function getOwnTopic(
  ctx: MutationCtx,
  id: Id<"performanceTopics">,
  employeeId: Id<"performanceEmployees">,
): Promise<Doc<"performanceTopics">> {
  const topic = await ctx.db.get(id);
  if (!topic || topic.employeeId !== employeeId) {
    throw new ConvexError({ code: "not_found", message: "Topic not found." });
  }
  return topic;
}

/** Create a new topic, or edit an existing one when `id` is given. */
export const saveTopic = mutation({
  args: {
    token: v.string(),
    employeeId: v.id("performanceEmployees"),
    id: v.optional(v.id("performanceTopics")),
    ym: v.string(),
    topic: v.string(),
    todo: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args): Promise<{ id: Id<"performanceTopics"> }> => {
    const login = await requireLogin(ctx, args.token);
    const employee = await getEmployeeOrThrow(ctx, args.employeeId);
    await requirePermission(ctx, login, "manage_roster", employee.companyId);

    const topic = args.topic.trim();
    if (!topic) {
      throw new ConvexError({
        code: "validation",
        message: "Bitte ein Topic eintragen.",
      });
    }
    const todo = args.todo?.trim() || undefined;
    const endDate = args.endDate?.trim() || undefined;
    const status = args.status && TOPIC_STATUSES.includes(args.status) ? args.status : "offen";
    const now = Date.now();

    if (args.id) {
      const existing = await getOwnTopic(ctx, args.id, args.employeeId);
      await ctx.db.patch(existing._id, {
        topic,
        todo,
        endDate,
        status,
        updatedAt: now,
      });
      return { id: existing._id };
    }
    const id = await ctx.db.insert("performanceTopics", {
      employeeId: args.employeeId,
      ym: args.ym,
      topic,
      todo,
      endDate,
      status,
      createdBy: login.name,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const deleteTopic = mutation({
  args: {
    token: v.string(),
    employeeId: v.id("performanceEmployees"),
    id: v.id("performanceTopics"),
  },
  handler: async (ctx, { token, employeeId, id }): Promise<{ ok: true }> => {
    const login = await requireLogin(ctx, token);
    const employee = await getEmployeeOrThrow(ctx, employeeId);
    await requirePermission(ctx, login, "manage_roster", employee.companyId);
    const existing = await getOwnTopic(ctx, id, employeeId);
    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

/** Set a topic's status — the employee themself may do this too, not just
 * an admin. */
export const setTopicStatus = mutation({
  args: {
    token: v.string(),
    employeeId: v.id("performanceEmployees"),
    id: v.id("performanceTopics"),
    status: statusValidator,
  },
  handler: async (ctx, { token, employeeId, id, status }): Promise<{ ok: true }> => {
    const login = await requireLogin(ctx, token);
    const employee = await getEmployeeOrThrow(ctx, employeeId);
    await requireCanView(ctx, login, employee);
    const existing = await getOwnTopic(ctx, id, employeeId);
    await ctx.db.patch(existing._id, { status, updatedAt: Date.now() });
    return { ok: true };
  },
});
