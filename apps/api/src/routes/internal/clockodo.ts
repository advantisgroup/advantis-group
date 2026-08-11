import { Elysia, t } from "elysia";

import { listAbsences, listCurrentAbsences } from "../../lib/clockodo.js";
import { requireServerKey } from "../../lib/middleware.js";

/**
 * Server-to-server only — called by Convex's ActivityTrack poller
 * (`activity/clockodo.ts`) so the raw Clockodo absences fetch lives in one
 * place (this app) instead of being duplicated in Convex's Node runtime too.
 * Unfiltered/unmapped: the caller (an internal poller, not a browser) needs
 * the raw `status`/`users_id`/date fields, not the coarse type/status this
 * app maps for the org calendar's own public endpoints.
 */
export const internalClockodoRoute = new Elysia().get(
  "/internal/clockodo/absences",
  async ({ request, query }) => {
    requireServerKey(request);
    // Omit `year` for "current" (this year, plus last year's tail in
    // January); pass it for a specific historical day — the admin "Deep
    // sanitize" troubleshooting tool can target any past day.
    const absences = query.year ? await listAbsences(Number(query.year)) : await listCurrentAbsences();
    return {
      absences: absences.map((a) => ({
        users_id: a.users_id,
        status: a.status,
        date_since: a.date_since,
        date_until: a.date_until,
      })),
    };
  },
  { query: t.Object({ year: t.Optional(t.String()) }) },
);
