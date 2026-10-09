import { Elysia } from "elysia";

import { type ApiErrorEnvelope } from "@advantis/api-contract";

import { dynamicCors } from "./lib/cors.js";
import { PORT } from "./lib/env.js";
import { ApiError, isFeatureDisabledError, reportApiFailure } from "./lib/errors.js";
import { getRequestContext } from "./lib/request-context.js";
import { aiRunsRoute } from "./routes/ai-runs.js";
import { applicantsRoute } from "./routes/applicants.js";
import { askRoute } from "./routes/ask.js";
import { clockodoAbsencesRoute } from "./routes/clockodo-absences.js";
import { dailyBriefRoute } from "./routes/daily-brief.js";
import { inquiryAiRoute } from "./routes/inquiry-ai.js";
import { mailRoute } from "./routes/mail.js";
import { navigateRoute } from "./routes/navigate.js";
import { onedriveRoute } from "./routes/onedrive.js";
import { performanceRoute } from "./routes/performance.js";
import { passkeysRoute } from "./routes/passkeys.js";
import { salesCoachEvRoute } from "./routes/sales-coach-ev.js";
import { secondaryEmailsRoute } from "./routes/secondaryEmails.js";
import { stepUpRoute } from "./routes/stepUp.js";
import { totpRoute } from "./routes/totp.js";
import { wikiChatRoute } from "./routes/wiki-chat.js";
import { wikiFormatAssistRoute } from "./routes/wiki-format-assist.js";
import { wikiImportRoute } from "./routes/wiki-import.js";
import { internalBackupsRoute } from "./routes/internal/backups.js";
import { internalDigestRoute } from "./routes/internal/digest.js";
import { internalMailRoute } from "./routes/internal/mail.js";
import { internalNotificationsRoute } from "./routes/internal/notifications.js";
import { internalOnedriveRoute } from "./routes/internal/onedrive.js";
import { internalPushRoute } from "./routes/internal/push.js";
import { internalUpdatesRoute } from "./routes/internal/updates.js";
import { meRoute } from "./routes/me.js";
import { unfurlRoute } from "./routes/unfurl.js";
import { clerkWebhookRoute } from "./routes/webhooks/clerk.js";
import { onedriveWebhookRoute } from "./routes/webhooks/onedrive.js";
import { resendWebhookRoute } from "./routes/webhooks/resend.js";

function errorEnvelope(error: ApiError, requestId: string): ApiErrorEnvelope {
  return { error: error.message, code: error.code, requestId };
}

export const app = new Elysia()
  .use(dynamicCors())
  .onError(async ({ error, request, set }) => {
    const context = getRequestContext(request);
    if (isFeatureDisabledError(error)) {
      const failure = await reportApiFailure(
        new ApiError(503, "feature_disabled", "This feature is currently unavailable."),
        context,
      );
      set.status = failure.status;
      return errorEnvelope(failure, context.requestId);
    }

    // Elysia's own 4xx (a body that fails validation) carries a status but no
    // code of ours; an ApiError already says exactly what went wrong.
    const status = (error as { status?: number }).status;
    const failure = await reportApiFailure(
      !(error instanceof ApiError) && typeof status === "number" && status >= 400 && status < 500
        ? new ApiError(
            status,
            "bad_request",
            "Some of the details look off. Please check and try again.",
            (error as Error).message,
          )
        : error,
      context,
    );
    set.status = failure.status;
    return errorEnvelope(failure, context.requestId);
  })
  .get("/", () => ({ name: "Advantis Intranet API", version: "1.0.0" }))
  .get("/health", () => ({ status: "ok", timestamp: Date.now() }))
  .use(meRoute)
  .use(unfurlRoute)
  .use(clerkWebhookRoute)
  .use(onedriveWebhookRoute)
  .use(resendWebhookRoute)
  .use(internalBackupsRoute)
  .use(internalNotificationsRoute)
  .use(internalDigestRoute)
  .use(internalMailRoute)
  .use(internalOnedriveRoute)
  .use(internalPushRoute)
  .use(internalUpdatesRoute)
  .use(aiRunsRoute)
  .use(askRoute)
  .use(dailyBriefRoute)
  .use(inquiryAiRoute)
  .use(mailRoute)
  .use(navigateRoute)
  .use(clockodoAbsencesRoute)
  .use(onedriveRoute)
  .use(performanceRoute)
  .use(passkeysRoute)
  .use(salesCoachEvRoute)
  .use(secondaryEmailsRoute)
  .use(stepUpRoute)
  .use(totpRoute)
  .use(wikiChatRoute)
  .use(wikiFormatAssistRoute)
  .use(wikiImportRoute)
  .use(applicantsRoute);

export type App = typeof app;

// Start the server only when run directly (Bun). On serverless platforms the
// exported `app` / `app.fetch` is used instead.
if (import.meta.main) {
  app.listen(PORT);
  console.warn(`🦊 Advantis API listening on http://localhost:${PORT}`);
}

export default app;
