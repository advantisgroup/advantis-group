import { Elysia, t } from "elysia";

import { api } from "@advantis/convex/api";

import { getAbsence, getUserEmail } from "../../lib/clockodo.js";
import { getConvex, getConvexServerKey } from "../../lib/convex.js";

interface ClockodoWebhookBody {
  event_name?: string;
  token?: string;
  payload?: { absence?: { id?: number } };
  // validation handshake fields are arbitrary
  [key: string]: unknown;
}

/**
 * POST /webhooks/clockodo — primary absence ingest. Clockodo transmits only the
 * entity id, so we fetch the full absence + coworker email and upsert a
 * read-only mirror into Convex. Verified by a shared token.
 */
export const clockodoWebhookRoute = new Elysia().post(
  "/webhooks/clockodo",
  async ({ body, set }) => {
    const payload = body as ClockodoWebhookBody;
    const expectedToken = process.env.CLOCKODO_WEBHOOK_TOKEN;
    // Also accept the ActivityTrack webhook secret so a single Clockodo webhook
    // configuration can cover both the absence-sync and time-entry flows.
    const altToken = process.env.ACTIVITYTRACK_WEBHOOK_SECRET;

    // URL-ownership handshake: Clockodo POSTs a confirmation secret with no
    // event_name when (re)registering. Log it and ack so setup can proceed.
    if (!payload.event_name) {
      console.warn(
        "[clockodo/webhook] handshake received:",
        JSON.stringify(payload)
      );
      return { ok: true, handshake: true };
    }

    const hasToken = expectedToken || altToken;
    const tokenValid =
      !hasToken ||
      payload.token === expectedToken ||
      payload.token === altToken;

    if (!tokenValid) {
      console.warn(
        `[clockodo/webhook] 401 token mismatch — event: ${payload.event_name}, received token present: ${!!payload.token}`
      );
      set.status = 401;
      return { ok: false, error: "invalid token" };
    }

    // Non-absence events (e.g. time-entry clock-in/out) reach this URL when a
    // single webhook is registered in Clockodo for all events. Acknowledge them
    // without attempting to parse an absence payload.
    if (!payload.event_name.startsWith("absence.")) {
      console.log(
        `[clockodo/webhook] 200 ignored non-absence event: ${payload.event_name}`
      );
      return { ok: true, ignored: true };
    }

    const absenceId = payload.payload?.absence?.id;
    if (typeof absenceId !== "number") {
      console.warn(
        `[clockodo/webhook] 400 missing absence id — event: ${payload.event_name}, payload: ${JSON.stringify(payload.payload)}`
      );
      set.status = 400;
      return { ok: false, error: "missing absence id" };
    }

    const convex = getConvex();
    const serverKey = getConvexServerKey();

    if (payload.event_name === "absence.deleted") {
      console.log(
        `[clockodo/webhook] 200 deleting absence externalId=${absenceId}`
      );
      await convex.mutation(api.clockodoSync.deleteAbsenceByExternalId, {
        serverKey,
        externalId: String(absenceId),
      });
      return { ok: true };
    }

    // created / updated / approved → fetch + mirror.
    console.log(
      `[clockodo/webhook] 200 upserting absence externalId=${absenceId} event=${payload.event_name}`
    );
    const absence = await getAbsence(absenceId);
    const email = await getUserEmail(absence.users_id);
    await convex.mutation(api.clockodoSync.upsertAbsenceFromClockodo, {
      serverKey,
      externalId: String(absence.id),
      clockodoUserId: absence.users_id,
      email,
      dateSince: absence.date_since,
      dateUntil: absence.date_until,
      clockodoType: absence.type,
      clockodoStatus: absence.status,
      countDays: absence.count_days ?? undefined,
      note: absence.note ?? undefined,
    });
    return { ok: true };
  },
  {
    body: t.Any(),
  }
);
