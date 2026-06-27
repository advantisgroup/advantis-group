import { Elysia, t } from "elysia";

import { api } from "@advantis/convex/api";

import { getUserEmail, listAbsences } from "../../lib/clockodo.js";
import { getConvex, getConvexServerKey } from "../../lib/convex.js";
import { requireServerKey } from "../../lib/middleware.js";

/**
 * POST /internal/clockodo/import — server-key gated backfill. Pulls a year of
 * absences from Clockodo and mirrors them into Convex. Useful for initial sync
 * and reconciliation.
 */
export const internalClockodoImportRoute = new Elysia().post(
  "/internal/clockodo/import",
  async ({ request, body }) => {
    requireServerKey(request);
    const year = body.year ?? new Date().getFullYear();
    const convex = getConvex();
    const serverKey = getConvexServerKey();

    const absences = await listAbsences(year);
    let mirrored = 0;
    let skipped = 0;
    for (const absence of absences) {
      const email = await getUserEmail(absence.users_id);
      const res = await convex.mutation(
        api.clockodoSync.upsertAbsenceFromClockodo,
        {
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
        }
      );
      if (res.status === "skipped") skipped++;
      else mirrored++;
    }
    return { year, total: absences.length, mirrored, skipped };
  },
  {
    body: t.Object({ year: t.Optional(t.Number()) }),
    response: {
      200: t.Object({
        year: t.Number(),
        total: t.Number(),
        mirrored: t.Number(),
        skipped: t.Number(),
      }),
    },
  }
);
