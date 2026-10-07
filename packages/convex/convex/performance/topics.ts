/**
 * CRUD for Performance "topics" — admin-set monthly goals/todos for an
 * employee. Ported from the reference script's `topic_save`/`topic_delete`/
 * `topic_status` routes.
 *
 * Creating, editing, and deleting a topic is for admins and the
 * dashboard's team lead; the employee themself may only change its status.
 */
import { ConvexError, v } from "convex/values";

import { userMutation } from "../functions";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { canViewEmployee, loadViewer, type PerformanceViewer } from "./lib/access";

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

/** Admins and leads of the employee's dashboard may set goals. */
function requireCanManageTopics(viewer: PerformanceViewer, employee: Doc<"performanceEmployees">) {
  const lead = viewer.dashboards.some((d) => d.companyId === employee.companyId && d.canViewTeam);
  if (!viewer.isAdmin && !lead) {
    throw new ConvexError({
      code: "forbidden",
      message: "Topics anlegen dürfen nur Teamleitung und Admins.",
    });
  }
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
export const saveTopic = userMutation({
  args: {
    employeeId: v.id("performanceEmployees"),
    id: v.optional(v.id("performanceTopics")),
    ym: v.string(),
    topic: v.string(),
    todo: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args): Promise<{ id: Id<"performanceTopics"> }> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const employee = await getEmployeeOrThrow(ctx, args.employeeId);
    requireCanManageTopics(viewer, employee);

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
      createdBy: viewer.name,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const deleteTopic = userMutation({
  args: {
    employeeId: v.id("performanceEmployees"),
    id: v.id("performanceTopics"),
  },
  handler: async (ctx, { employeeId, id }): Promise<{ ok: true }> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const employee = await getEmployeeOrThrow(ctx, employeeId);
    requireCanManageTopics(viewer, employee);
    const existing = await getOwnTopic(ctx, id, employeeId);
    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

/** Set a topic's status — the employee themself may do this too, not just
 * an admin. */
export const setTopicStatus = userMutation({
  args: {
    employeeId: v.id("performanceEmployees"),
    id: v.id("performanceTopics"),
    status: statusValidator,
  },
  handler: async (ctx, { employeeId, id, status }): Promise<{ ok: true }> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const employee = await getEmployeeOrThrow(ctx, employeeId);
    if (!canViewEmployee(viewer, employee)) {
      throw new ConvexError({ code: "forbidden", message: "Kein Zugriff." });
    }
    const existing = await getOwnTopic(ctx, id, employeeId);
    await ctx.db.patch(existing._id, { status, updatedAt: Date.now() });
    return { ok: true };
  },
});
