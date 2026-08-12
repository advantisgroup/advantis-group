import { Elysia } from "elysia";

import { dynamicCors } from "./lib/cors.js";
import { PORT } from "./lib/env.js";
import { ApiError } from "./lib/errors.js";
import { activityRoute } from "./routes/activity.js";
import { applicantsRoute } from "./routes/applicants.js";
import { clockodoAbsencesRoute } from "./routes/clockodo-absences.js";
import { clockodoEntriesRoute } from "./routes/clockodo-entries.js";
import { onedriveRoute } from "./routes/onedrive.js";
import { performanceRoute } from "./routes/performance.js";
import { salesCoachEvRoute } from "./routes/sales-coach-ev.js";
import { wikiChatRoute } from "./routes/wiki-chat.js";
import { internalClockodoRoute } from "./routes/internal/clockodo.js";
import { internalNotificationsRoute } from "./routes/internal/notifications.js";
import { internalOnedriveRoute } from "./routes/internal/onedrive.js";
import { internalUpdatesRoute } from "./routes/internal/updates.js";
import { meRoute } from "./routes/me.js";
import { unfurlRoute } from "./routes/unfurl.js";
import { clerkWebhookRoute } from "./routes/webhooks/clerk.js";
import { onedriveWebhookRoute } from "./routes/webhooks/onedrive.js";
import { resendWebhookRoute } from "./routes/webhooks/resend.js";

export const app = new Elysia()
  .use(dynamicCors())
  .onError(({ error, request, set }) => {
    if (error instanceof ApiError) {
      console.error(
        `[api] ${request.method} ${new URL(request.url).pathname} -> ${error.status} ${error.code}: ${error.message}`
      );
      set.status = error.status;
      return { error: error.message, code: error.code };
    }
    // Validation errors from Elysia carry their own status.
    const status = (error as { status?: number }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      console.error(
        `[api] ${request.method} ${new URL(request.url).pathname} -> ${status}: ${(error as Error).message}`
      );
      return { error: (error as Error).message, code: "bad_request" };
    }
    console.error(
      `[api] ${request.method} ${new URL(request.url).pathname} -> unhandled error:`,
      error
    );
    set.status = 500;
    return { error: "Something went wrong", code: "internal" };
  })
  .get("/", () => ({ name: "Advantis Intranet API", version: "1.0.0" }))
  .get("/health", () => ({ status: "ok", timestamp: Date.now() }))
  .use(meRoute)
  .use(unfurlRoute)
  .use(clerkWebhookRoute)
  .use(onedriveWebhookRoute)
  .use(resendWebhookRoute)
  .use(internalNotificationsRoute)
  .use(internalClockodoRoute)
  .use(internalOnedriveRoute)
  .use(internalUpdatesRoute)
  .use(activityRoute)
  .use(clockodoAbsencesRoute)
  .use(clockodoEntriesRoute)
  .use(onedriveRoute)
  .use(performanceRoute)
  .use(salesCoachEvRoute)
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
