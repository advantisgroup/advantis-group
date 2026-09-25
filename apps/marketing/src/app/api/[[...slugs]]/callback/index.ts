import { createHash } from "node:crypto";

import { api } from "@advantis/convex/api";
import { isWithinCallbackHours } from "@advantis/convex/marketing/inquiry";
import { Elysia, t } from "elysia";

import { convex, serverKey } from "@/lib/convex-server";
import { allow, clientIp, limits } from "@/lib/rate-limit";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * The reschedule/cancel links in a confirmed-callback mail. They work signed
 * out: the token in the link is the proof, and only its hash is stored.
 */
export const callback = new Elysia({ prefix: "/callback" })
  .onBeforeHandle(async ({ headers, set }) => {
    if (!(await allow(limits.callbackToken, clientIp(headers)))) {
      set.status = 429;
      return { error: "Too many requests." };
    }
    if (!convex) {
      set.status = 500;
      return { error: "Server configuration error." };
    }
  })
  .get(
    "/",
    async ({ query, set }) => {
      const details = await convex!.query(api.marketing.inquiries.getByActionToken, {
        serverKey: serverKey(),
        tokenHash: sha256(query.token),
      });
      if (!details) {
        set.status = 404;
        return { error: "invalid" };
      }
      return details;
    },
    { query: t.Object({ token: t.String() }) },
  )
  .post(
    "/cancel",
    async ({ body }) =>
      await convex!.mutation(api.marketing.inquiries.cancelByToken, {
        serverKey: serverKey(),
        tokenHash: sha256(body.token),
      }),
    { body: t.Object({ token: t.String() }) },
  )
  .post(
    "/reschedule",
    async ({ body, set }) => {
      if (body.desiredAt < Date.now() || !isWithinCallbackHours(body.desiredAt)) {
        set.status = 400;
        return { status: "outside_hours" as const };
      }
      return await convex!.mutation(api.marketing.inquiries.rescheduleByToken, {
        serverKey: serverKey(),
        tokenHash: sha256(body.token),
        desiredAt: body.desiredAt,
        timeZone: body.timeZone,
      });
    },
    {
      body: t.Object({
        token: t.String(),
        desiredAt: t.Number(),
        timeZone: t.Optional(t.String()),
      }),
    },
  );
