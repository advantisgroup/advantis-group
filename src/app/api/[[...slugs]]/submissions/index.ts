import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { Elysia, t } from "elysia";

import { api } from "@/../convex/_generated/api";

const convex = process.env.NEXT_PUBLIC_CONVEX_URL
  ? new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)
  : null;

export const submissions = new Elysia().get(
  "/submissions",
  async ({ set }) => {
    const { userId } = await auth();

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (!convex) {
      set.status = 500;
      return {
        error: "Server configuration error.",
        code: "convex_not_configured",
        detail:
          "NEXT_PUBLIC_CONVEX_URL is missing, so submissions cannot be loaded.",
      };
    }

    try {
      const submissions = await convex.query(
        api.emails.listEmailsByClerkUserId,
        {
          clerkUserId: userId,
        }
      );
console.log("[submissions] raw result:", JSON.stringify(submissions, null, 2)); 
      return { submissions };
    } catch (error) {
      console.error("[submissions] Convex error:", error);
      set.status = 500;
      return {
        error: "Failed to load submissions.",
        code: "convex_query_failed",
        detail:
          error instanceof Error ? error.message : "Unknown Convex query error.",
      };
    }
  },
  {
    response: {
      200: t.Object({
        submissions: t.Array(
          t.Object({
            _id: t.String(),
            _creationTime: t.Number(),
            messageId: t.Optional(t.String()),
            firstName: t.String(),
            lastName: t.String(),
            email: t.String(),
            phone: t.String(),
            subject: t.String(),
            message: t.String(),
            company: t.String(),
            submissionType: t.String(),
            topic: t.String(),
            desiredDateTime: t.String(),
            notes: t.String(),
            accountEmail: t.String(),
            accountName: t.String(),
            clerkUserId: t.String(),
            sentAt: t.Number(),
            status: t.String(),
            error: t.Optional(t.String()),
          })
        ),
      }),
      401: t.Object({ error: t.String() }),
      500: t.Object({
        error: t.String(),
        code: t.Optional(t.String()),
        detail: t.Optional(t.String()),
      }),
    },
  }
);
