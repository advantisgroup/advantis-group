import { ConvexHttpClient } from "convex/browser";
import { Elysia, t } from "elysia";

import { api } from "@/../convex/_generated/api";

const convex = process.env.NEXT_PUBLIC_CONVEX_URL
  ? new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)
  : null;

export const notify = new Elysia()
  .post(
    "/notify",
    async ({ body, set }) => {
      const allowSubmissions = process.env.ALLOW_SUBMISSIONS === "true";

      if (allowSubmissions) {
        set.status = 400;
        return {
          error:
            "Submissions are currently open — use the contact form directly.",
        };
      }

      if (!convex) {
        set.status = 500;
        return { error: "Server configuration error." };
      }

      try {
        const result = await convex.mutation(api.emails.saveNotifyEmail, {
          email: body.email.trim().toLowerCase(),
        });

        const duplicate =
          (result as { duplicate: boolean } | null)?.duplicate ?? false;

        return {
          ok: true,
          duplicate,
        };
      } catch (err) {
        console.error("[notify] Convex error:", err);
        set.status = 500;
        return { error: "Failed to save email. Please try again." };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
      }),
      response: {
        200: t.Object({
          ok: t.Boolean(),
          duplicate: t.Boolean(),
        }),
        400: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
    }
  )
  .delete(
    "/notify/:email",
    async ({ params, set }) => {
      if (!convex) {
        set.status = 500;
        return { error: "Server configuration error." };
      }

      const decodedEmail = decodeURIComponent(params.email)
        .trim()
        .toLowerCase();

      if (!decodedEmail) {
        set.status = 400;
        return { error: "Email parameter is required." };
      }

      try {
        const result = (await convex.mutation(api.emails.deleteNotifyEmail, {
          email: decodedEmail,
        })) as { deleted: boolean; email: string | null; error: string | null };

        if (!result.deleted) {
          if (!result.email) {
            set.status = 404;
            return { error: "Email not found." };
          }

          console.error("[notify] Delete error:", result.error);
          set.status = 500;
          return { error: "Failed to delete email. Please try again." };
        }

        return {
          ok: true,
          email: result.email,
        };
      } catch (err) {
        console.error("[notify] Convex error:", err);
        set.status = 500;
        return { error: "Failed to delete email. Please try again." };
      }
    },
    {
      params: t.Object({
        email: t.String(),
      }),
      response: {
        200: t.Object({
          ok: t.Boolean(),
          email: t.Nullable(t.String()),
        }),
        400: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
    }
  );
