import { api } from "@advantis/convex/api";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { Elysia, t } from "elysia";

const submissionSchema = t.Object({
  _id: t.String(),
  _creationTime: t.Number(),
  messageId: t.Optional(t.String()),
  firstName: t.String(),
  lastName: t.String(),
  email: t.String(),
  phone: t.Optional(t.String()),
  subject: t.String(),
  message: t.String(),
  company: t.Optional(t.String()),
  submissionType: t.Union([
    t.Literal("message"),
    t.Literal("callback"),
    t.Literal("other"),
  ]),
  topic: t.Optional(t.String()),
  desiredDateTime: t.Optional(t.String()),
  notes: t.Optional(t.String()),
  accountEmail: t.String(),
  accountName: t.String(),
  clerkUserId: t.String(),
  sentAt: t.Number(),
  status: t.Union([t.Literal("sent"), t.Literal("failed")]),
  error: t.Optional(t.String()),
});

const errorSchema = t.Object({
  error: t.String(),
  code: t.Optional(t.String()),
  detail: t.Optional(t.String()),
});

export const submissions = new Elysia().get(
  "/submissions",
  async ({ set }) => {
    const user = await currentUser();
    const accountEmail = user?.primaryEmailAddress?.emailAddress;

    if (!accountEmail) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

    if (!convexUrl) {
      set.status = 500;
      return {
        error: "Server configuration error.",
        code: "convex_not_configured",
        detail:
          "NEXT_PUBLIC_CONVEX_URL is missing, so submissions cannot be loaded.",
      };
    }

    const convex = new ConvexHttpClient(convexUrl);

    try {
      const submissions = await convex.query(
        api.emails.listEmailsByAccountEmail,
        {
          accountEmail,
        }
      );
      if (!submissions) {
        set.status = 404;
        return {
          error: "Failed to get submissions.",
          code: "convex_query_null",
        };
      }
      return { submissions };
    } catch (error) {
      console.error("[submissions] Convex error:", error);
      set.status = 500;
      return {
        error: "Failed to load submissions.",
        code: "convex_query_failed",
        detail:
          error instanceof Error
            ? error.message
            : "Unknown Convex query error.",
      };
    }
  },
  {
    response: {
      200: t.Object({
        submissions: t.Array(submissionSchema),
      }),
      401: errorSchema,
      404: errorSchema,
      500: errorSchema,
    },
  }
);
