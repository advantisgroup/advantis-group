import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

function toFlowSummary(flow: Doc<"salesCockpitFlows">) {
  return {
    _id: flow._id,
    titel: flow.titel,
    projectId: flow.projectId,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
  };
}

function toNode(node: Doc<"salesCockpitFlowNodes">) {
  return {
    _id: node._id,
    parentId: node.parentId,
    branchLabel: node.branchLabel,
    title: node.title,
    body: node.body,
    x: node.x,
    y: node.y,
  };
}

export const listFlows = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const flows = await ctx.db.query("salesCockpitFlows").withIndex("by_createdAt").collect();
    const projects = await ctx.db.query("salesCockpitProjects").collect();
    const projectTitleById = new Map(projects.map((p) => [p._id, p.titel]));
    const withCounts = await Promise.all(
      flows
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (flow) => {
          const nodes = await ctx.db
            .query("salesCockpitFlowNodes")
            .withIndex("by_flow", (q) => q.eq("flowId", flow._id))
            .collect();
          return {
            ...toFlowSummary(flow),
            projectTitel: flow.projectId ? (projectTitleById.get(flow.projectId) ?? null) : null,
            nodeCount: nodes.length,
          };
        }),
    );
    return withCounts;
  },
});

export const getFlow = query({
  args: { flowId: v.id("salesCockpitFlows") },
  handler: async (ctx, { flowId }) => {
    await requireUser(ctx);
    const flow = await ctx.db.get(flowId);
    if (!flow) throw new ConvexError({ code: "not_found", message: "Flow nicht gefunden" });
    const project = flow.projectId ? await ctx.db.get(flow.projectId) : null;
    const nodes = await ctx.db
      .query("salesCockpitFlowNodes")
      .withIndex("by_flow", (q) => q.eq("flowId", flowId))
      .collect();
    return {
      ...toFlowSummary(flow),
      projectTitel: project?.titel ?? null,
      nodes: nodes.map(toNode),
    };
  },
});

export const createFlow = mutation({
  args: { titel: v.string(), projectId: v.optional(v.id("salesCockpitProjects")) },
  handler: async (ctx, { titel, projectId }) => {
    const user = await requireUser(ctx);
    const trimmed = titel.trim();
    if (!trimmed)
      throw new ConvexError({ code: "bad_request", message: "Bitte einen Titel eingeben" });
    const now = Date.now();
    const flowId = await ctx.db.insert("salesCockpitFlows", {
      titel: trimmed,
      projectId,
      createdByUserId: user._id,
      createdAt: now,
    });
    // `salesCockpitProjects.flowId` is what project surfaces (the Projekte
    // list, the Cockpit view) actually read to decide "is a flow linked" —
    // picking a project here needs to write that side too, or a flow
    // created from this tab with a project attached would be invisible
    // from every project-facing view until someone re-links it by hand.
    if (projectId) {
      await ctx.db.patch(projectId, { flowId, updatedAt: now });
    }
    const rootId = await ctx.db.insert("salesCockpitFlowNodes", {
      flowId,
      title: "Start",
      body: "",
      x: 0,
      y: 0,
      createdAt: now,
    });
    return { id: flowId, rootId };
  },
});

export const renameFlow = mutation({
  args: { flowId: v.id("salesCockpitFlows"), titel: v.string() },
  handler: async (ctx, { flowId, titel }) => {
    await requireUser(ctx);
    const trimmed = titel.trim();
    if (!trimmed)
      throw new ConvexError({ code: "bad_request", message: "Bitte einen Titel eingeben" });
    const flow = await ctx.db.get(flowId);
    if (!flow) throw new ConvexError({ code: "not_found", message: "Flow nicht gefunden" });
    await ctx.db.patch(flowId, { titel: trimmed, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const removeFlow = mutation({
  args: { flowId: v.id("salesCockpitFlows") },
  handler: async (ctx, { flowId }) => {
    await requireUser(ctx);
    const nodes = await ctx.db
      .query("salesCockpitFlowNodes")
      .withIndex("by_flow", (q) => q.eq("flowId", flowId))
      .collect();
    await Promise.all(nodes.map((n) => ctx.db.delete(n._id)));
    await ctx.db.delete(flowId);
    return { ok: true };
  },
});

export const upsertNode = mutation({
  args: {
    flowId: v.id("salesCockpitFlows"),
    nodeId: v.optional(v.id("salesCockpitFlowNodes")),
    parentId: v.optional(v.id("salesCockpitFlowNodes")),
    branchLabel: v.optional(v.string()),
    title: v.string(),
    body: v.string(),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, { flowId, nodeId, parentId, branchLabel, title, body, x, y }) => {
    await requireUser(ctx);
    const flow = await ctx.db.get(flowId);
    if (!flow) throw new ConvexError({ code: "not_found", message: "Flow nicht gefunden" });
    const now = Date.now();
    if (nodeId) {
      const existing = await ctx.db.get(nodeId);
      if (!existing || existing.flowId !== flowId) {
        throw new ConvexError({ code: "not_found", message: "Knoten nicht gefunden" });
      }
      // `branchLabel` only means anything on a non-root node — always
      // written (never left out of the patch) so a caller that doesn't pass
      // it can't accidentally wipe an existing label; the root stays
      // label-less no matter what a caller sends.
      await ctx.db.patch(nodeId, {
        title,
        body,
        x,
        y,
        branchLabel: existing.parentId ? branchLabel : undefined,
        updatedAt: now,
      });
      return { id: nodeId };
    }
    if (!parentId) {
      throw new ConvexError({
        code: "bad_request",
        message: "Neue Knoten brauchen einen übergeordneten Knoten",
      });
    }
    const parent = await ctx.db.get(parentId);
    if (!parent || parent.flowId !== flowId) {
      throw new ConvexError({ code: "not_found", message: "Übergeordneter Knoten nicht gefunden" });
    }
    const id = await ctx.db.insert("salesCockpitFlowNodes", {
      flowId,
      parentId,
      branchLabel,
      title,
      body,
      x,
      y,
      createdAt: now,
    });
    return { id };
  },
});

export const moveNode = mutation({
  args: { nodeId: v.id("salesCockpitFlowNodes"), x: v.number(), y: v.number() },
  handler: async (ctx, { nodeId, x, y }) => {
    await requireUser(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) return { ok: false };
    await ctx.db.patch(nodeId, { x, y });
    return { ok: true };
  },
});

/** Deletes `nodeId` and every descendant beneath it (the whole subtree a
 *  branch hangs off of) — never the flow's own root, which has no
 *  `parentId` to remove a branch label from; deleting the last conversation
 *  starting point is a "delete flow" action instead. */
async function deleteSubtree(ctx: MutationCtx, nodeId: Id<"salesCockpitFlowNodes">) {
  const children = await ctx.db
    .query("salesCockpitFlowNodes")
    .withIndex("by_parent", (q) => q.eq("parentId", nodeId))
    .collect();
  await Promise.all(children.map((child) => deleteSubtree(ctx, child._id)));
  await ctx.db.delete(nodeId);
}

export const removeNode = mutation({
  args: { nodeId: v.id("salesCockpitFlowNodes") },
  handler: async (ctx, { nodeId }) => {
    await requireUser(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) return { ok: false };
    if (!node.parentId) {
      throw new ConvexError({
        code: "bad_request",
        message: "Der Startknoten kann nicht gelöscht werden — Flow stattdessen löschen",
      });
    }
    await deleteSubtree(ctx, nodeId);
    return { ok: true };
  },
});
