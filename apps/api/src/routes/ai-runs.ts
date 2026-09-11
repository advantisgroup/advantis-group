import { api } from "@advantis/convex/api";
import { Elysia } from "elysia";

import { runEncryptionKey } from "../lib/ai.js";
import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { decrypt } from "../lib/crypto.js";
import { Errors } from "../lib/errors.js";
import { requireAuth } from "../lib/middleware.js";

/**
 * The readable half of a run. Status comes to the browser live from Convex;
 * this hands over the decrypted text whenever that status moves.
 */
export const aiRunsRoute = new Elysia().get("/ai/runs/:id", async ({ request, params }) => {
  const { clerkUserId } = await requireAuth(request);
  const run = await getConvex().query(api.aiRuns.apiGet, {
    serverKey: getConvexServerKey(),
    clerkUserId,
    runId: params.id,
  });
  if (!run) throw Errors.notFound("Run not found");
  return {
    status: run.status,
    outputChars: run.outputChars,
    output: run.output ? decrypt(run.output, runEncryptionKey(run.kind)) : null,
  };
});
