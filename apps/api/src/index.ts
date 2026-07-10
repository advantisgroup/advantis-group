import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { isAllowedOrigin, PORT } from "./lib/env.js";
import { ApiError } from "./lib/errors.js";
import { activityRoute } from "./routes/activity.js";
import { applicantsRoute } from "./routes/applicants.js";
import { onedriveRoute } from "./routes/onedrive.js";
import { wikiChatRoute } from "./routes/wiki-chat.js";
import { internalClockodoImportRoute } from "./routes/internal/clockodo.js";
import { internalNotificationsRoute } from "./routes/internal/notifications.js";
import { internalOnedriveRoute } from "./routes/internal/onedrive.js";
import { meRoute } from "./routes/me.js";
import { unfurlRoute } from "./routes/unfurl.js";
import { clerkWebhookRoute } from "./routes/webhooks/clerk.js";
import { clockodoWebhookRoute } from "./routes/webhooks/clockodo.js";
import { onedriveWebhookRoute } from "./routes/webhooks/onedrive.js";

export const app = new Elysia()
  .use(
    cors({
      origin: request => {
        const origin = request.headers.get("origin");
        if (!origin) return false;
        return isAllowedOrigin(origin);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Cookie",
        "x-convex-server-key",
      ],
    })
  )
  .onError(({ error, set }) => {
    if (error instanceof ApiError) {
      set.status = error.status;
      return { error: error.message, code: error.code };
    }
    // Validation errors from Elysia carry their own status.
    const status = (error as { status?: number }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return { error: (error as Error).message, code: "bad_request" };
    }
    console.error("[api] unhandled error:", error);
    set.status = 500;
    return { error: "Something went wrong", code: "internal" };
  })
  .get("/", () => ({ name: "Advantis Intranet API", version: "1.0.0" }))
  .get("/health", () => ({ status: "ok", timestamp: Date.now() }))
  .use(meRoute)
  .use(unfurlRoute)
  .use(clerkWebhookRoute)
  .use(clockodoWebhookRoute)
  .use(onedriveWebhookRoute)
  .use(internalNotificationsRoute)
  .use(internalClockodoImportRoute)
  .use(internalOnedriveRoute)
  .use(activityRoute)
  .use(onedriveRoute)
  .use(wikiChatRoute)
  .use(applicantsRoute);

export type App = typeof app;

// Start the server only when run directly (Bun). On serverless platforms the
// exported `app` / `app.fetch` is used instead.
if (import.meta.main) {
  app.listen(PORT);
  console.warn(`🦊 Advantis API listening on http://localhost:${PORT}`);
}

export default app;
