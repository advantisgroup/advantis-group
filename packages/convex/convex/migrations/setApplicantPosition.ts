/**
 * One-time fix for the Indeed import (Oct 2026): the CV import took the
 * position from the CV — the person's last job — instead of the job they
 * applied to. Files every applicant created since `since` under `position`
 * and keeps the job from the CV in the notes ("Laut Lebenslauf: …"). Also
 * saves `position` as the advertised job, so new imports do the same.
 *
 * Run once from the Convex dashboard (Functions →
 * `migrations/setApplicantPosition:run`), first with `dryRun: true`:
 *   { "position": "Callcenter-Mitarbeiter (m/w/d)", "since": "2026-10-15", "actorEmail": "you@…", "dryRun": true }
 * `since` is a Berlin calendar day; applicants created before it are left alone.
 */
import { ConvexError, v } from "convex/values";

import { internalMutation } from "../functions";
import { recordUnifiedAudit } from "../lib/auditLogWrite";

const CV_NOTE = "Laut Lebenslauf:";

/** Midnight in Berlin at the start of `day` ("YYYY-MM-DD"). */
function berlinMidnight(day: string): number {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(utcMidnight)) {
    throw new ConvexError({ code: "bad_request", message: "since must be YYYY-MM-DD" });
  }
  const berlinHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(utcMidnight),
  );
  return utcMidnight - berlinHour * 60 * 60 * 1000;
}

/** Notes are plain text or, once edited in the intranet, HTML. */
function prependNote(notes: string, note: string): string {
  if (!notes) return note;
  if (!notes.includes("<")) return `${note}\n\n${notes}`;
  const escaped = note.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${escaped}</p>${notes}`;
}

export const run = internalMutation({
  args: {
    position: v.string(),
    since: v.string(),
    actorEmail: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const position = args.position.trim();
    if (!position) throw new ConvexError({ code: "bad_request", message: "No position given" });
    const actor = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.actorEmail.trim().toLowerCase()))
      .unique();
    if (!actor) return { applied: false, notFound: args.actorEmail };

    const from = berlinMidnight(args.since);
    const applicants = await ctx.db
      .query("applicants")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", from))
      .collect();
    const changed = applicants.filter((a) => !a.deletedAt && a.position !== position);
    if (args.dryRun) {
      return { applied: false, matched: applicants.length, wouldChange: changed.length };
    }

    for (const applicant of changed) {
      const old = applicant.position?.trim();
      const notes = applicant.notizen?.trim() ?? "";
      const note = old && !notes.includes(CV_NOTE) ? `${CV_NOTE} ${old}` : null;
      await ctx.db.patch(applicant._id, {
        position,
        notizen: note ? prependNote(notes, note) : applicant.notizen,
      });
    }

    const now = Date.now();
    const settings = await ctx.db.query("hrSettings").first();
    const fields = { openPosition: position, updatedBy: actor._id, updatedAt: now };
    if (settings) await ctx.db.patch(settings._id, fields);
    else await ctx.db.insert("hrSettings", fields);
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: actor._id,
      action: "hr_applicant_position_backfill",
      detail: `${changed.length} → ${position}`,
      at: now,
    });
    return { applied: true, changed: changed.length };
  },
});
