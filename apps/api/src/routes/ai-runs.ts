import { api } from "@advantis/convex/api";
import { Elysia, t } from "elysia";

import { type AiTranscript, runEncryptionKey } from "../lib/ai.js";
import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { decrypt } from "../lib/crypto.js";
import { Errors } from "../lib/errors.js";
import { authed } from "../lib/middleware.js";

/** Runs that read a CV hold applicant data, so reading them back needs the
 *  same access and unlocked vault as the rest of Applicant Management. */
const APPLICANT_KINDS = new Set(["cvExtract", "cvRescan"]);

/** The caller's own run, with the same applicant gate the rest of Applicant
 * Management has for anything that read a CV. */
async function readableRun(clerkUserId: string, runId: string) {
  const convex = getConvex();
  const serverKey = getConvexServerKey();
  const run = await convex.query(api.aiRuns.apiGet, {
    serverKey,
    clerkUserId,
    runId,
  });
  if (!run) throw Errors.notFound("Run not found");
  if (APPLICANT_KINDS.has(run.kind)) {
    const access = await convex.query(api.hr.applicants.apiCheckAccess, {
      serverKey,
      clerkUserId,
    });
    if (!access?.hasAccess) throw Errors.forbidden();
  }
  return run;
}

/**
 * The readable half of a run. Status comes to the browser live from Convex;
 * this hands over the decrypted text whenever that status moves, and the
 * transcript of what was sent when someone asks to see it.
 */
export const aiRunsRoute = new Elysia()
  .use(authed)
  .get(
    "/ai/runs/:id",
    async ({ caller, params }) => {
      const run = await readableRun(caller.clerkUserId, params.id);
      const key = runEncryptionKey(run.kind);
      return {
        status: run.status,
        outputChars: run.outputChars,
        output: run.output ? decrypt(run.output, key) : null,
        title: run.title ? decrypt(run.title, key) : null,
      };
    },
    { signedIn: true },
  )
  .post(
    "/ai/runs/titles",
    async ({ caller, body }) => {
      const { clerkUserId } = caller;
      const convex = getConvex();
      const serverKey = getConvexServerKey();
      const rows = await convex.query(api.aiRuns.apiTitles, {
        serverKey,
        clerkUserId,
        runIds: body.ids,
      });
      let applicantAccess: boolean | null = null;
      const titles: Record<string, string> = {};
      for (const row of rows) {
        if (APPLICANT_KINDS.has(row.kind)) {
          applicantAccess ??= !!(
            await convex.query(api.hr.applicants.apiCheckAccess, { serverKey, clerkUserId })
          )?.hasAccess;
          if (!applicantAccess) continue;
        }
        titles[row._id] = decrypt(row.title, runEncryptionKey(row.kind));
      }
      return { titles };
    },
    { signedIn: true, body: t.Object({ ids: t.Array(t.String(), { maxItems: 50 }) }) },
  )
  .get(
    "/ai/runs/:id/transcript",
    async ({ caller, params }) => {
      const run = await readableRun(caller.clerkUserId, params.id);
      const row = await getConvex().query(api.aiRuns.apiTranscript, {
        serverKey: getConvexServerKey(),
        clerkUserId: caller.clerkUserId,
        runId: params.id,
      });
      if (!row) return { transcript: null };
      const transcript = JSON.parse(decrypt(row.data, runEncryptionKey(run.kind))) as AiTranscript;
      return { transcript };
    },
    { signedIn: true },
  );
