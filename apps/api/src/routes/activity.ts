import { Elysia } from "elysia";

import { api } from "@advantis/convex/api";

import { logClockodoWebhookDelivery } from "../lib/clockodoWebhookLog.js";
import { getConvex } from "../lib/convex.js";

/**
 * ActivityTrack desktop-agent + integration ingestion, ported from the old
 * ActivityTrack web app's Elysia layer into the shared Advantis API service.
 *
 * Routes (no /api prefix — base URL is api.advantisgroup.de):
 *   POST /agent/register               unauthenticated; one-time pairing nonce
 *   POST /agent/poll                   approval poll; returns device token once
 *   POST /activity/update              device-token-authenticated heartbeat
 *   POST /integrations/genesys/notify  Genesys routing-status relay
 *   POST /integrations/genesys/sync    on-demand single-user Genesys pull
 *   POST /integrations/clockodo/webhook  time-entry webhook (distinct from
 *                                        /webhooks/clockodo absence-sync route)
 *
 * Auth model: this server holds ACTIVITYTRACK_SIGNAL_SECRET and attaches it
 * to every Convex write; agents carry no shared secret.
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
const fail = (
  set: { status?: number | string },
  status: number,
  error: string
) => {
  set.status = status;
  return { ok: false, error };
};

export const activityRoute = new Elysia()
  // --- Desktop agent --------------------------------------------------------
  .post("/agent/register", async ({ body, set }) => {
    const deviceId = str(body, "deviceId");
    const hostname = str(body, "hostname");
    const windowsUser = str(body, "windowsUser");
    const agentVersion = str(body, "agentVersion");
    const claimNonce = str(body, "claimNonce");
    if (
      !deviceId ||
      !hostname ||
      !windowsUser ||
      !agentVersion ||
      !claimNonce
    ) {
      return fail(set, 400, "bad_request");
    }
    const { status } = await getConvex().mutation(
      api.activity.devices.requestEnrollment,
      {
        secret: signalSecret(),
        deviceId,
        hostname,
        windowsUser,
        agentVersion,
        claimNonce,
      }
    );
    return ok({ status });
  })
  .post("/agent/poll", async ({ body, set }) => {
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
  .post("/activity/update", async ({ body, headers, set }) => {
    const token = bearer(headers);
    if (!token) return fail(set, 401, "unauthorized");
    const valid = await getConvex().query(api.activity.deviceAuth.validate, {
      secret: signalSecret(),
      token,
    });
    if (!valid) return fail(set, 401, "unauthorized");

    const b = (body ?? {}) as Record<string, unknown>;
    const employeeId = typeof b.employeeId === "string" ? b.employeeId : null;
    const deviceIdle = typeof b.deviceIdle === "boolean" ? b.deviceIdle : null;
    const idleSeconds =
      typeof b.idleSeconds === "number" ? b.idleSeconds : null;
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
  .post("/integrations/genesys/notify", async ({ body, headers, set }) => {
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
  .post("/integrations/genesys/sync", async ({ body, headers, set }) => {
    if (!keyMatches(bearer(headers), webhookSecret())) {
      return fail(set, 401, "unauthorized");
    }
    const b = (body ?? {}) as { employeeId?: string; genesysUserId?: string };
    if (!b?.employeeId || !b?.genesysUserId)
      return fail(set, 400, "bad_request");
    const result = await getConvex().action(api.activity.genesys.syncGenesys, {
      secret: signalSecret(),
      employeeId: b.employeeId,
      genesysUserId: b.genesysUserId,
    });
    return result;
  })
  // --- Clockodo relay (time entries; distinct from /webhooks/clockodo absence-sync) ---
  .post(
    "/integrations/clockodo/webhook",
    async ({ body, headers, query, set }) => {
      const b = (body ?? {}) as Record<string, unknown>;

      // A. Validation handshake — surface the secret and acknowledge.
      if (typeof b.secret === "string" && !b.event_name && !b.employeeId) {
        console.warn(
          `[activity/clockodo] webhook validation secret: ${b.secret}`
        );
        logClockodoWebhookDelivery({
          endpoint: "integrations/clockodo/webhook",
          ok: true,
          reason: "handshake",
          token: b.secret,
        });
        return ok();
      }

      // B. Native Clockodo event.
      if (typeof b.event_name === "string") {
        const token = typeof b.token === "string" ? b.token : null;
        const tokenOk =
          keyMatches(token, process.env.CLOCKODO_WEBHOOK_TOKEN) ||
          keyMatches(token, process.env.ACTIVITYTRACK_WEBHOOK_SECRET);
        if (!tokenOk) {
          console.warn(
            `[activity/clockodo] 401 token mismatch — event: ${b.event_name}, received token present: ${!!token}`
          );
          logClockodoWebhookDelivery({
            endpoint: "integrations/clockodo/webhook",
            eventName: b.event_name,
            ok: false,
            reason: "token_mismatch",
            token,
          });
          return fail(set, 401, "unauthorized");
        }
        const payload = (b.payload ?? {}) as {
          entry?: { id?: number | string; users_id?: number | string };
        };
        const entryId = payload.entry?.id;
        if (entryId == null) {
          console.log(
            `[activity/clockodo] 200 ignored event with no entry id — event: ${b.event_name}`
          );
          logClockodoWebhookDelivery({
            endpoint: "integrations/clockodo/webhook",
            eventName: b.event_name,
            ok: true,
            reason: "ignored_no_entry_id",
            token,
          });
          return ok({ ignored: true });
        }
        console.log(
          `[activity/clockodo] 200 processing entry event — event: ${b.event_name}, entryId: ${entryId}`
        );
        logClockodoWebhookDelivery({
          endpoint: "integrations/clockodo/webhook",
          eventName: b.event_name,
          ok: true,
          reason: "processed",
          token,
          resourceId: String(entryId),
        });
        // users_id rides along so deleted entries (which can no longer be
        // fetched) still resolve to a user for the day recompute.
        const payloadUsersId = payload.entry?.users_id;
        return await getConvex().action(
          api.activity.clockodo.refreshClockodoByEntry,
          {
            secret: signalSecret(),
            entryId: String(entryId),
            eventName: b.event_name,
            usersId:
              payloadUsersId != null ? String(payloadUsersId) : undefined,
          }
        );
      }

      // C. Legacy adapter shapes.
      const secret =
        bearer(headers) ?? (query as Record<string, string>)?.secret ?? null;
      if (!keyMatches(secret, process.env.ACTIVITYTRACK_WEBHOOK_SECRET)) {
        console.warn("[activity/clockodo] 401 legacy secret mismatch");
        logClockodoWebhookDelivery({
          endpoint: "integrations/clockodo/webhook",
          ok: false,
          reason: "legacy_secret_mismatch",
          token: secret,
        });
        return fail(set, 401, "unauthorized");
      }
      const raw = b as { employeeId?: string; clockodoUserId?: string };
      if (raw.employeeId && raw.clockodoUserId) {
        console.log(
          `[activity/clockodo] 200 legacy refresh — employeeId: ${raw.employeeId}, clockodoUserId: ${raw.clockodoUserId}`
        );
        return await getConvex().action(api.activity.clockodo.refreshClockodo, {
          secret: signalSecret(),
          employeeId: raw.employeeId,
          clockodoUserId: raw.clockodoUserId,
        });
      }
      return fail(set, 400, "bad_request");
    }
  );
