import { api } from "@advantis/convex/api";
import { Elysia } from "elysia";

import { runEncryptionKey } from "../lib/ai.js";
import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { decrypt } from "../lib/crypto.js";
import { Errors } from "../lib/errors.js";
import { authed } from "../lib/middleware.js";

/** Runs that read a CV hold applicant data, so reading them back needs the
 *  same access and unlocked vault as the rest of Applicant Management. */
const APPLICANT_KINDS = new Set(["cvExtract", "cvRescan"]);

/**
 * The readable half of a run. Status comes to the browser live from Convex;
 * this hands over the decrypted text whenever that status moves.
 */
export const aiRunsRoute = new Elysia().use(authed).get(
  "/ai/runs/:id",
  async ({ caller, params }) => {
    const { clerkUserId } = caller;
    const convex = getConvex();
    const serverKey = getConvexServerKey();
    const run = await convex.query(api.aiRuns.apiGet, {
      serverKey,
      clerkUserId,
      runId: params.id,
    });
    if (!run) throw Errors.notFound("Run not found");
    if (APPLICANT_KINDS.has(run.kind)) {
      const access = await convex.query(api.hr.applicants.apiCheckAccess, {
        serverKey,
        clerkUserId,
      });
      if (!access?.hasAccess) throw Errors.forbidden();
    }
    return {
      status: run.status,
      outputChars: run.outputChars,
      output: run.output ? decrypt(run.output, runEncryptionKey(run.kind)) : null,
    };
  },
  { signedIn: true },
);
