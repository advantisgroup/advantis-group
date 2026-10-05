import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { z } from "zod";

/** HTTP endpoints served on the Convex `.site` domain. */

const http = httpRouter();

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
