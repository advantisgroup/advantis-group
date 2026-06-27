import { Elysia } from "elysia";

import { api } from "@advantis/convex/api";

import { getConvex } from "../lib/convex.js";

/**
 * ActivityTrack desktop-agent + integration ingestion, ported from the old
 * ActivityTrack web app's Elysia layer into the shared Advantis API service.
 *
 * Paths are preserved verbatim so the deployed desktop agents keep working after
 * their base URL is repointed at this service during cutover:
 *   POST /api/agent/register      (unauthenticated; one-time pairing nonce)
 *   POST /api/agent/poll          (approval poll; returns the device token once)
 *   POST /api/activity/update     (device-token-authenticated workstation beat)
 *
 * The device-token-authenticated firehose (/ingest, /agent/event,
 * /agent/verify-password) stays on the Convex `.site` HTTP router (see
 * packages/convex/convex/http.ts). Genesys/Clockodo relays are integration
 * webhooks with configured URLs, so they live under /api/integrations/*.
 *
 * Auth model mirrors `state.pushSignal`: this server holds
 * ACTIVITYTRACK_SIGNAL_SECRET and attaches it to every Convex write; the agent
 * itself carries no shared secret.
 */

function signalSecret(): string {
  const s = process.env.ACTIVITYTRACK_SIGNAL_SECRET;
  if (!s) throw new Error("ACTIVITYTRACK_SIGNAL_SECRET is not configured");
  return s;
}

const webhookSecret = () => process.env.ACTIVITYTRACK_WEBHOOK_SECRET;

function bearer(headers: Record<string, string | undefined>): string | null {
  const h = headers["authorization"];
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

function keyMatches(
  provided: string | null | undefined,
  expected: string | undefined
): boolean {
  return !!expected && !!provided && provided === expected;
}

function str(body: unknown, key: string): string | null {
  const v = (body as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

const ok = (body: Record<string, unknown> = {}) => ({ ok: true, ...body });
const fail = (set: { status?: number | string }, status: number, error: string) => {
  set.status = status;
  return { ok: false, error };
};

export const activityRoute = new Elysia()
  // --- Desktop agent --------------------------------------------------------
  .post("/api/agent/register", async ({ body, set }) => {
    const deviceId = str(body, "deviceId");
    const hostname = str(body, "hostname");
    const windowsUser = str(body, "windowsUser");
    const agentVersion = str(body, "agentVersion");
    const claimNonce = str(body, "claimNonce");
    if (!deviceId || !hostname || !windowsUser || !agentVersion || !claimNonce) {
      return fail(set, 400, "bad_request");
    }
    const { status } = await getConvex().mutation(
      api.activity.devices.requestEnrollment,
      { secret: signalSecret(), deviceId, hostname, windowsUser, agentVersion, claimNonce }
    );
    return ok({ status });
  })
  .post("/api/agent/poll", async ({ body, set }) => {
    const deviceId = str(body, "deviceId");
    const claimNonce = str(body, "claimNonce");
    if (!deviceId || !claimNonce) return fail(set, 400, "bad_request");
    const result = await getConvex().mutation(api.activity.devices.claimToken, {
      secret: signalSecret(),
      deviceId,
      claimNonce,
    });
    return ok(result);
  })
  .post("/api/activity/update", async ({ body, headers, set }) => {
    const token = bearer(headers);
    if (!token) return fail(set, 401, "unauthorized");
    const valid = await getConvex().mutation(api.activity.deviceAuth.validate, {
      secret: signalSecret(),
      token,
    });
    if (!valid) return fail(set, 401, "unauthorized");

    const b = (body ?? {}) as Record<string, unknown>;
    const employeeId = typeof b.employeeId === "string" ? b.employeeId : null;
    const deviceIdle = typeof b.deviceIdle === "boolean" ? b.deviceIdle : null;
    const idleSeconds = typeof b.idleSeconds === "number" ? b.idleSeconds : null;
    if (employeeId === null || deviceIdle === null || idleSeconds === null) {
      return fail(set, 400, "bad_request");
    }
    const { finalState } = await getConvex().mutation(
      api.activity.state.pushSignal,
      {
        secret: signalSecret(),
        employeeId,
        source: "agent",
        deviceIdle,
        idleSeconds,
      }
    );
    return ok({ finalState });
  })
  // --- Genesys relay --------------------------------------------------------
  .post("/api/integrations/genesys/notify", async ({ body, headers, set }) => {
    if (!keyMatches(bearer(headers), webhookSecret())) {
      return fail(set, 401, "unauthorized");
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const employeeId = typeof b.employeeId === "string" ? b.employeeId : null;
    if (!employeeId) return fail(set, 400, "bad_request");
    const { finalState } = await getConvex().mutation(
      api.activity.state.pushSignal,
      {
        secret: signalSecret(),
        employeeId,
        source: "genesys",
        genesysRoutingStatus: b.routingStatus as never,
        genesysPresence: b.presence as never,
        genesysWrapUp:
          typeof b.wrapUp === "boolean" ? (b.wrapUp as boolean) : undefined,
      }
    );
    return ok({ finalState });
  })
  .post("/api/integrations/genesys/sync", async ({ body, headers, set }) => {
    if (!keyMatches(bearer(headers), webhookSecret())) {
      return fail(set, 401, "unauthorized");
    }
    const b = (body ?? {}) as { employeeId?: string; genesysUserId?: string };
    if (!b?.employeeId || !b?.genesysUserId) return fail(set, 400, "bad_request");
    const result = await getConvex().action(api.activity.genesys.syncGenesys, {
      secret: signalSecret(),
      employeeId: b.employeeId,
      genesysUserId: b.genesysUserId,
    });
    return result;
  })
  // --- Clockodo relay (activity-specific; distinct from intranet absences) --
  .post(
    "/api/integrations/clockodo/webhook",
    async ({ body, headers, query, set }) => {
      const b = (body ?? {}) as Record<string, unknown>;

      // A. Validation handshake — surface the secret and acknowledge.
      if (typeof b.secret === "string" && !b.event_name && !b.employeeId) {
        console.warn(`[activity/clockodo] webhook validation secret: ${b.secret}`);
        return ok();
      }

      // B. Native Clockodo event.
      if (typeof b.event_name === "string") {
        const token = typeof b.token === "string" ? b.token : null;
        const tokenOk =
          keyMatches(token, process.env.CLOCKODO_WEBHOOK_TOKEN) ||
          keyMatches(token, process.env.ACTIVITYTRACK_WEBHOOK_SECRET);
        if (!tokenOk) return fail(set, 401, "unauthorized");
        const payload = (b.payload ?? {}) as { entry?: { id?: number | string } };
        const entryId = payload.entry?.id;
        if (entryId == null) return ok({ ignored: true });
        return await getConvex().action(
          api.activity.clockodo.refreshClockodoByEntry,
          { secret: signalSecret(), entryId: String(entryId), eventName: b.event_name }
        );
      }

      // C. Legacy adapter shapes.
      const secret = bearer(headers) ?? (query as Record<string, string>)?.secret ?? null;
      if (!keyMatches(secret, process.env.ACTIVITYTRACK_WEBHOOK_SECRET)) {
        return fail(set, 401, "unauthorized");
      }
      const raw = b as { employeeId?: string; clockodoUserId?: string };
      if (raw.employeeId && raw.clockodoUserId) {
        return await getConvex().action(api.activity.clockodo.refreshClockodo, {
          secret: signalSecret(),
          employeeId: raw.employeeId,
          clockodoUserId: raw.clockodoUserId,
        });
      }
      return fail(set, 400, "bad_request");
    }
  );
