import { Elysia, t } from "elysia";

import {
  MailAuthError,
  assertMailAvailable,
  collectNewMessages,
  decryptMailPassword,
  readMessage,
} from "../../lib/mail.js";
import { requireServerKey } from "../../lib/middleware.js";
import { type PriceTable, isPriceListSubject, parsePriceTable } from "../../lib/price-list.js";

/**
 * POST /internal/price-mailbox/poll — server-key gated, called by Convex's
 * Preislisten-Cron (wiki/priceMailbox.ts). Reads what arrived since the last
 * position, picks the newest mail with the daily price list and answers its
 * table; the wiki entry is written on the Convex side. Nothing in the
 * mailbox is changed.
 */
export const internalPriceMailboxRoute = new Elysia().post(
  "/internal/price-mailbox/poll",
  async ({ request, body }) => {
    requireServerKey(request);
    assertMailAvailable();
    const head = { updatedAt: body.updatedAt };
    const creds = { email: body.email, password: decryptMailPassword(body.passwordEnc) };
    let collected;
    try {
      // Anhänge werden nicht gebraucht: mit 0 Bytes lädt der Helfer keine PDFs.
      collected = await collectNewMessages(
        creds,
        { uidValidity: body.uidValidity, uidNext: body.uidNext },
        { maxPdfBytes: 0 },
      );
    } catch (error) {
      if (error instanceof MailAuthError) return { ...head, ok: false as const, error: "auth" };
      console.warn(`[price-mailbox] ${body.email}: ${(error as Error).message}`);
      return { ...head, ok: false as const, error: "connect" };
    }

    const matching = collected.messages
      .filter((m) => isPriceListSubject(m.subject))
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0) || b.uid - a.uid);
    let table: (PriceTable & { receivedAt: number }) | null = null;
    // Die neueste Mail zählt; ist ihre Tabelle unlesbar, die nächstältere.
    for (const message of matching) {
      try {
        const full = await readMessage(creds, message.uid);
        const parsed = full.text ? parsePriceTable(full.text) : null;
        if (parsed) {
          table = { ...parsed, receivedAt: message.date ?? Date.now() };
          break;
        }
      } catch (error) {
        console.warn(`[price-mailbox] uid ${message.uid}: ${(error as Error).message}`);
      }
    }
    return {
      ...head,
      ok: true as const,
      uidValidity: collected.uidValidity,
      uidNext: collected.uidNext,
      matched: matching.length,
      table,
    };
  },
  {
    body: t.Object({
      email: t.String(),
      passwordEnc: t.String(),
      updatedAt: t.Number(),
      uidValidity: t.Union([t.String(), t.Null()]),
      uidNext: t.Union([t.Number(), t.Null()]),
    }),
  },
);
