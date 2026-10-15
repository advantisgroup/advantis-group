import { Elysia, t } from "elysia";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";

import { getConvex, getConvexServerKey } from "../../lib/convex.js";
import {
  MailAuthError,
  assertMailAvailable,
  collectNewMessages,
  decryptMailPassword,
} from "../../lib/mail.js";
import { requireServerKey } from "../../lib/middleware.js";
import { MAX_CV_BYTES, startCvExtract } from "../applicants.js";

type ImportRow = {
  uid: number;
  from: string;
  subject: string;
  receivedAt: number | null;
  status: "started" | "no_pdf" | "too_large" | "failed" | "from_applicant";
  fileName: string | null;
  runId: string | null;
  error: string | null;
};

/**
 * POST /internal/hr-mailbox/poll — server-key gated, called by Convex's HR
 * mailbox cron (hr/mailbox.ts). Reads what arrived since the last position
 * and starts a CV import for each mail with a PDF, as the HR member who set
 * the mailbox up. Answers the new position and what happened to each mail;
 * nothing in the mailbox is changed.
 */
export const internalHrMailboxRoute = new Elysia().post(
  "/internal/hr-mailbox/poll",
  async ({ request, body }) => {
    requireServerKey(request);
    assertMailAvailable();
    const head = { updatedAt: body.updatedAt };
    let collected;
    try {
      collected = await collectNewMessages(
        { email: body.email, password: decryptMailPassword(body.passwordEnc) },
        { uidValidity: body.uidValidity, uidNext: body.uidNext },
        { maxPdfBytes: MAX_CV_BYTES },
      );
    } catch (error) {
      if (error instanceof MailAuthError) return { ...head, ok: false as const, error: "auth" };
      console.warn(`[hr-mailbox] ${body.email}: ${(error as Error).message}`);
      return { ...head, ok: false as const, error: "connect" };
    }

    const imports: ImportRow[] = [];
    for (const message of collected.messages) {
      const row: ImportRow = {
        uid: message.uid,
        from: message.from,
        subject: message.subject,
        receivedAt: message.date,
        status: "no_pdf",
        fileName: null,
        runId: null,
        error: null,
      };
      // A reply from someone already in the list (e.g. to an invitation sent
      // from this mailbox) is not a new application, PDF or not.
      const known = message.fromAddress
        ? await getConvex().query(api.hr.applicants.apiFindDuplicateByContact, {
            serverKey: getConvexServerKey(),
            email: message.fromAddress,
          })
        : null;
      if (known) {
        row.status = "from_applicant";
        row.fileName = message.pdf?.filename ?? null;
      } else if (message.pdfTooLarge) {
        row.status = "too_large";
      } else if (message.pdf) {
        row.fileName = message.pdf.filename;
        try {
          const { runId } = await startCvExtract({
            clerkUserId: body.clerkUserId,
            createdByUserId: body.userId as Id<"users">,
            bytes: new Uint8Array(message.pdf.content),
            fileName: message.pdf.filename,
            fromMailbox: true,
          });
          row.status = "started";
          row.runId = runId;
        } catch (error) {
          // E.g. the day's AI allowance is used up: logged for HR, the mail
          // stays in the inbox to be imported by hand.
          row.status = "failed";
          row.error = (error as { code?: string }).code ?? (error as Error).message ?? "unknown";
          console.warn(`[hr-mailbox] import of uid ${message.uid} failed`, error);
        }
      }
      imports.push(row);
    }
    return {
      ...head,
      ok: true as const,
      uidValidity: collected.uidValidity,
      uidNext: collected.uidNext,
      imports,
    };
  },
  {
    body: t.Object({
      email: t.String(),
      passwordEnc: t.String(),
      updatedAt: t.Number(),
      uidValidity: t.Union([t.String(), t.Null()]),
      uidNext: t.Union([t.Number(), t.Null()]),
      clerkUserId: t.String(),
      userId: t.String(),
    }),
  },
);
