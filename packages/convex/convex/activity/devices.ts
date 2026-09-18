import { gatedMutation, mutation, query } from "../functions";
import { v } from "convex/values";

import { requireUser, requireManager, requireAdmin } from "../lib/auth";
import { writeAudit } from "./lib/audit";
import { appError } from "../lib/errors";
import { assertSignalSecret, issueDeviceToken, invalidateDeviceToken } from "./lib/deviceAuth";
import { hashNonce, safeEqual } from "./lib/crypto";

/** All devices with their linked person's name (if any). Any signed-in user. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const devices = await ctx.db.query("devices").take(2000);

    const personIds = [...new Set(devices.flatMap((d) => (d.personId ? [d.personId] : [])))];
    const peopleById = new Map(
      (await Promise.all(personIds.map((id) => ctx.db.get(id)))).flatMap((p) =>
        p ? [[p._id, p] as const] : [],
      ),
    );

    return devices.map((d) => ({
      ...d,
      personName: d.personId ? (peopleById.get(d.personId)?.name ?? null) : null,
    }));
  },
});

/** Devices awaiting approval (the registration queue). */
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db
      .query("devices")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

/**
 * Approve a device so it can claim its token and its data counts. Manager+.
 * Clears `tokenIssued` so a freshly approved (or re-approved after disable)
 * device mints a new token on its next poll — see `claimToken`.
 */
export const approve = mutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, { deviceId }) => {
    const actor = await requireManager(ctx);
    const device = await ctx.db.get(deviceId);
    if (!device) throw appError("notFound.device", "Device not found");
    await ctx.db.patch(deviceId, {
      status: "active",
      tokenIssued: false,
      tokenHash: undefined,
    });
    await writeAudit(ctx, actor._id, "device.approve", device.hostname);
  },
});

/** Disable a device, revoking its token immediately. Admin (destructive). */
export const disable = mutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, { deviceId }) => {
    const actor = await requireAdmin(ctx);
    const device = await ctx.db.get(deviceId);
    if (!device) throw appError("notFound.device", "Device not found");
    await ctx.db.patch(deviceId, { status: "disabled" });
    await invalidateDeviceToken(ctx, deviceId);
    await writeAudit(ctx, actor._id, "device.disable", device.hostname);
  },
});

/** Permanently delete a device. Admin (destructive, irreversible). */
export const remove = mutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, { deviceId }) => {
    const actor = await requireAdmin(ctx);
    const device = await ctx.db.get(deviceId);
    if (!device) throw appError("notFound.device", "Device not found");
    await ctx.db.delete(deviceId);
    await writeAudit(ctx, actor._id, "device.remove", device.hostname);
  },
});

/** Link a device to a coworker (or pass null to unlink). Manager+. */
export const link = mutation({
  args: {
    deviceId: v.id("devices"),
    personId: v.union(v.id("people"), v.null()),
  },
  handler: async (ctx, { deviceId, personId }) => {
    const actor = await requireManager(ctx);
    const device = await ctx.db.get(deviceId);
    if (!device) throw appError("notFound.device", "Device not found");
    if (personId) {
      const person = await ctx.db.get(personId);
      if (!person) throw appError("notFound.person", "Person not found");
    }
    await ctx.db.patch(deviceId, { personId: personId ?? undefined });
    await writeAudit(ctx, actor._id, "device.link", `${device.hostname} -> ${personId ?? "none"}`);
  },
});

/**
 * Self-registration from the desktop agent, called server-to-server from the
 * Elysia API layer (POST /api/agent/register). Idempotent (one row per
 * deviceId); lands in the pending queue for a manager to approve.
 */
export const requestEnrollment = gatedMutation("activitytrack")({
  args: {
    secret: v.string(),
    deviceId: v.string(),
    hostname: v.string(),
    windowsUser: v.string(),
    agentVersion: v.string(),
    claimNonce: v.string(),
  },
  handler: async (ctx, { secret, deviceId, hostname, windowsUser, agentVersion, claimNonce }) => {
    assertSignalSecret(secret);
    const now = Date.now();
    const claimNonceHash = await hashNonce(claimNonce);
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .unique();

    if (!existing) {
      await ctx.db.insert("devices", {
        deviceId,
        hostname,
        lastWindowsUser: windowsUser,
        agentVersion,
        status: "pending",
        lastSeen: now,
        claimNonceHash,
        tokenIssued: false,
      });
      return { status: "pending" as const };
    }

    if (existing.status === "active" && existing.tokenIssued) {
      await ctx.db.patch(existing._id, {
        hostname,
        lastWindowsUser: windowsUser,
        agentVersion,
        lastSeen: now,
      });
      return { status: "active" as const };
    }

    await ctx.db.patch(existing._id, {
      hostname,
      lastWindowsUser: windowsUser,
      agentVersion,
      lastSeen: now,
      claimNonceHash,
    });
    return { status: existing.status };
  },
});

/**
 * The agent polls this (server-to-server via Elysia, POST /api/agent/poll) with
 * its deviceId + pairing nonce until a manager approves it. On the first poll
 * after approval we mint the device's token and return it ONCE.
 */
export const claimToken = gatedMutation("activitytrack")({
  args: { secret: v.string(), deviceId: v.string(), claimNonce: v.string() },
  handler: async (ctx, { secret, deviceId, claimNonce }) => {
    assertSignalSecret(secret);
    const device = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .unique();
    if (!device) return { status: "unknown" as const };

    const claimNonceHash = await hashNonce(claimNonce);
    if (!device.claimNonceHash || !safeEqual(device.claimNonceHash, claimNonceHash)) {
      return { status: "denied" as const };
    }

    if (device.status === "pending") return { status: "pending" as const };
    if (device.status === "disabled") return { status: "disabled" as const };

    // Approved. Mint exactly once; a lost token requires disable + re-approve.
    if (device.tokenIssued) {
      return { status: "active" as const, token: null };
    }
    const token = await issueDeviceToken(ctx, device._id);
    await ctx.db.patch(device._id, { lastSeen: Date.now() });
    return { status: "active" as const, token };
  },
});
