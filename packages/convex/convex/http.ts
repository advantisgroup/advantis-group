import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";

import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ingestPayloadSchema, type ActivitySample } from "./activity/lib/contracts";
import { z } from "zod";
import { verifyPassword } from "./lib/crypto";
import { DEBUG_PASSWORD_SETTING_KEY } from "./activity/settings";

/** True for the ConvexError a feature-gated function throws (see `functions.ts`). */
function isFeatureDisabledError(err: unknown): boolean {
  return (
    err instanceof ConvexError &&
    typeof err.data === "object" &&
    err.data !== null &&
    (err.data as { code?: unknown }).code === "feature_disabled"
  );
}

/**
 * ActivityTrack desktop-agent HTTP endpoints, served on the Convex `.site`
 * domain. These preserve the exact paths/contract the deployed agents already
 * use (device-token authenticated) so they keep working through the cutover —
 * only the agent's base URL is repointed. Enrollment/poll + the activity
 * heartbeat live in the Elysia `apps/api` layer (see apps/api).
 */

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_PAST_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const http = httpRouter();

function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

const unauthorized = (): Response => new Response("unauthorized", { status: 401 });
const badRequest = (): Response => new Response("bad request", { status: 400 });

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function logBackendEvent(
  ctx: ActionCtx,
  event: {
    severity: "info" | "warning" | "error" | "critical";
    code: string;
    message: string;
    deviceId?: string;
    hostname?: string;
    context?: string;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.activity.events.record, {
      source: "backend",
      ...event,
    });
  } catch {
    // diagnostic side-channel; must never take down ingest/enrollment
  }
}

async function authenticateDevice(
  ctx: ActionCtx,
  request: Request,
): Promise<{ deviceId: string } | null> {
  const token = bearerToken(request);
  if (!token) return null;
  return await ctx.runQuery(internal.activity.deviceAuth.validateInternal, {
    token,
  });
}

/** POST /ingest — authenticated by per-device key. */
http.route({
  path: "/ingest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const deviceAuth = await authenticateDevice(ctx, request);
    if (!deviceAuth) return unauthorized();

    const body = await readJson(request);
    if (body === undefined) {
      await logBackendEvent(ctx, {
        severity: "warning",
        code: "ingest.bad_payload",
        message: "Ingest rejected: request body was not valid JSON.",
        deviceId: deviceAuth.deviceId,
      });
      return badRequest();
    }

    const parsed = ingestPayloadSchema.safeParse(body);
    if (!parsed.success) {
      await logBackendEvent(ctx, {
        severity: "warning",
        code: "ingest.bad_payload",
        message: "Ingest rejected: payload failed schema validation.",
        deviceId: deviceAuth.deviceId,
        context: JSON.stringify(parsed.error.issues.slice(0, 5)),
      });
      return badRequest();
    }

    const now = Date.now();
    const accepted = parsed.data.samples.filter((s: ActivitySample) => {
      if (s.deviceId !== deviceAuth.deviceId) return false;
      const ahead = s.capturedAt - now;
      if (ahead > MAX_FUTURE_SKEW_MS) return false;
      if (now - s.capturedAt > MAX_PAST_AGE_MS) return false;
      return true;
    });

    let inserted = 0;
    if (accepted.length > 0) {
      try {
        const result = await ctx.runMutation(internal.activity.ingest.recordSamples, {
          samples: accepted,
        });
        inserted = result.inserted;
        if (result.throttled && inserted === 0) {
          return new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "30" },
          });
        }
      } catch (err) {
        // ActivityTrack disabled: recordSamples is feature-gated (see
        // functions.ts) and throws instead of persisting. The agent has
        // no concept of this flag, so answer exactly like an accepted-but-
        // empty batch instead of surfacing a 500.
        if (!isFeatureDisabledError(err)) throw err;
      }
    }

    return jsonResponse(200, {
      ok: true,
      received: parsed.data.samples.length,
      inserted,
      dropped: parsed.data.samples.length - accepted.length,
    });
  }),
});

const agentEventSchema = z.object({
  severity: z.enum(["info", "warning", "error", "critical"]),
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  hostname: z.string().max(255).optional(),
});

/** POST /agent/event — the tracker reports its own operational problems. */
http.route({
  path: "/agent/event",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const deviceAuth = await authenticateDevice(ctx, request);
    if (!deviceAuth) return unauthorized();

    const body = await readJson(request);
    if (body === undefined) return badRequest();
    const parsed = agentEventSchema.safeParse(body);
    if (!parsed.success) return badRequest();

    await ctx.runMutation(internal.activity.events.record, {
      source: "tracker",
      severity: parsed.data.severity,
      code: parsed.data.code,
      message: parsed.data.message,
      deviceId: deviceAuth.deviceId,
      hostname: parsed.data.hostname,
    });

    return jsonResponse(200, { ok: true });
  }),
});

/** POST /agent/verify-password — tray-app debug login. */
http.route({
  path: "/agent/verify-password",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const deviceAuth = await authenticateDevice(ctx, request);
    if (!deviceAuth) return unauthorized();

    const body = (await readJson(request)) as { password?: unknown } | undefined;
    if (!body || typeof body.password !== "string") return badRequest();

    const row = await ctx.runQuery(internal.activity.settings.getByKey, {
      key: DEBUG_PASSWORD_SETTING_KEY,
    });
    if (!row) return jsonResponse(503, { ok: false, reason: "unset" });

    const passwordOk = await verifyPassword(body.password, row.value);
    return jsonResponse(passwordOk ? 200 : 401, { ok: passwordOk });
  }),
});

const durationBeaconSchema = z.object({
  pageviewId: z.string().min(1).max(64),
  durationMs: z.number(),
});

/**
 * POST /analytics/duration — a `navigator.sendBeacon` from `pagehide` on the
 * marketing site, filling in how long the visit lasted. Unauthenticated by
 * design (anonymous visitor, no Clerk session): validated and bounds-checked
 * instead, same as everywhere else public input reaches this file. No CORS
 * headers because `sendBeacon` doesn't read the response — it only needs the
 * request to land.
 */
http.route({
  path: "/analytics/duration",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await readJson(request);
    if (body === undefined) return badRequest();
    const parsed = durationBeaconSchema.safeParse(body);
    if (!parsed.success) return badRequest();

    await ctx.runMutation(internal.marketing.analytics.applyDuration, {
      pageviewId: parsed.data.pageviewId as Id<"analyticsPageviews">,
      durationMs: parsed.data.durationMs,
    });

    return jsonResponse(200, { ok: true });
  }),
});

export default http;
