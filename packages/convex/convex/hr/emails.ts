import { ConvexError, v } from "convex/values";

import { serverUserMutation, serverUserQuery, userMutation, userQuery } from "../functions";
import { recordUnifiedAudit } from "../lib/auditLogWrite";
import { emailKategorieValidator } from "../lib/validators";
import { DEFAULT_EMAIL_SIGNATURE } from "./settings";

/**
 * Mails HR sends to applicants from the HR mailbox (bewerbung@): editable
 * templates, and the two calls apps/api makes around the actual send — one
 * for the recipient and mailbox, one to log what went out in the
 * applicant's mail history.
 */

const MAX_SUBJECT = 300;
const MAX_BODY = 20_000;

/** Starting drafts — HR rewrites them in the Vorlagen tab. */
const DEFAULT_TEMPLATES = [
  {
    name: "Einladung zum Gespräch",
    kategorie: "einladung" as const,
    subject: "Einladung zum Kennenlernen – advantis GmbH",
    body: [
      "Hallo {Vorname},",
      "",
      "vielen Dank für deine Bewerbung als {Position} bei der advantis GmbH. Wir würden dich gern kennenlernen und laden dich zu einem Gespräch ein:",
      "",
      "{Termin} um {Uhrzeit} Uhr ({Art})",
      "",
      "Bitte gib uns kurz Bescheid, ob der Termin für dich passt.",
      "",
      "Viele Grüße",
      "advantis GmbH",
    ].join("\n"),
  },
  {
    name: "Telefonisch nicht erreicht",
    kategorie: "telefonisch_nicht_erreicht" as const,
    subject: "Deine Bewerbung bei der advantis GmbH",
    body: [
      "Hallo {Vorname},",
      "",
      "vielen Dank für deine Bewerbung bei der advantis GmbH. Wir haben versucht, dich telefonisch zu erreichen – leider ohne Erfolg.",
      "",
      "Bitte melde dich kurz mit einem Zeitraum, in dem wir dich gut erreichen, oder ruf uns zurück.",
      "",
      "Viele Grüße",
      "advantis GmbH",
    ].join("\n"),
  },
  {
    name: "Absage",
    kategorie: "absage" as const,
    subject: "Deine Bewerbung bei der advantis GmbH",
    body: [
      "Hallo {Vorname},",
      "",
      "vielen Dank für dein Interesse an der advantis GmbH und die Zeit, die du in deine Bewerbung gesteckt hast. Nach sorgfältiger Prüfung haben wir uns für andere Bewerberinnen und Bewerber entschieden.",
      "",
      "Für deinen weiteren Weg wünschen wir dir alles Gute.",
      "",
      "Viele Grüße",
      "advantis GmbH",
    ].join("\n"),
  },
];

function clean(value: string, max: number, what: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ConvexError({ code: "validation", message: `${what} fehlt.` });
  if (trimmed.length > max) {
    throw new ConvexError({ code: "validation", message: `${what} ist zu lang.` });
  }
  return trimmed;
}

export const listTemplates = userQuery({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("applicantEmailTemplates").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

export const saveTemplate = userMutation({
  applicant: "access",
  args: {
    templateId: v.optional(v.id("applicantEmailTemplates")),
    name: v.string(),
    kategorie: emailKategorieValidator,
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { templateId, ...input }) => {
    const fields = {
      name: clean(input.name, 120, "Name"),
      kategorie: input.kategorie,
      subject: clean(input.subject, MAX_SUBJECT, "Betreff"),
      body: clean(input.body, MAX_BODY, "Text"),
      updatedBy: ctx.caller.id,
      updatedAt: Date.now(),
    };
    if (templateId) {
      if (!(await ctx.db.get(templateId))) {
        throw new ConvexError({ code: "not_found", message: "Vorlage nicht gefunden." });
      }
      await ctx.db.patch(templateId, fields);
      return templateId;
    }
    return await ctx.db.insert("applicantEmailTemplates", fields);
  },
});

export const removeTemplate = userMutation({
  applicant: "access",
  args: { templateId: v.id("applicantEmailTemplates") },
  handler: async (ctx, { templateId }) => {
    await ctx.db.delete(templateId);
  },
});

/** Fills an empty template list with the starting drafts. Does nothing once
 *  any template exists, so it can't overwrite HR's own texts. */
export const createDefaultTemplates = userMutation({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("applicantEmailTemplates").first()) return { created: 0 };
    const now = Date.now();
    for (const template of DEFAULT_TEMPLATES) {
      await ctx.db.insert("applicantEmailTemplates", {
        ...template,
        updatedBy: ctx.caller.id,
        updatedAt: now,
      });
    }
    return { created: DEFAULT_TEMPLATES.length };
  },
});

/** apps/api, before sending: who it goes to and the mailbox it goes from. */
export const apiSendContext = serverUserQuery({
  applicant: "access",
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const applicant = await ctx.db.get(applicantId);
    if (!applicant || applicant.deletedAt) {
      throw new ConvexError({ code: "not_found", message: "Bewerber nicht gefunden." });
    }
    const mailbox = await ctx.db.query("hrMailbox").first();
    const settings = await ctx.db.query("hrSettings").first();
    const sender = await ctx.db.get(ctx.caller.id);
    const senderName =
      [sender?.firstName, sender?.lastName].filter(Boolean).join(" ").trim() ||
      sender?.email ||
      "advantis GmbH";
    return {
      to: applicant.email?.trim() || null,
      name: applicant.name,
      mailbox: mailbox ? { email: mailbox.email, passwordEnc: mailbox.passwordEnc } : null,
      senderName,
      signature: settings?.emailSignature ?? DEFAULT_EMAIL_SIGNATURE,
    };
  },
});

/** apps/api, after IONOS accepted the mail: log it in the applicant's mail
 *  history like a hand-logged entry, with what was actually sent. */
export const apiRecordSent = serverUserMutation({
  applicant: "access",
  args: {
    applicantId: v.id("applicants"),
    kategorie: emailKategorieValidator,
    subject: v.string(),
    body: v.string(),
    sentFrom: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { applicantId, kategorie, subject, body, sentFrom, to }) => {
    const now = Date.now();
    const datum = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    await ctx.db.insert("applicantEmails", {
      applicantId,
      datum,
      kategorie,
      subject: subject.slice(0, MAX_SUBJECT),
      notiz: body.slice(0, MAX_BODY),
      sentFrom,
      sentBy: ctx.caller.id,
      createdAt: now,
    });
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: ctx.caller.id,
      action: "applicant_email_sent",
      target: to,
      detail: subject.slice(0, 120),
      at: now,
    });
  },
});
