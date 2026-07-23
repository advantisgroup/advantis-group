import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  ampelValidator,
  emailKategorieValidator,
  kontaktArtValidator,
  terminArtValidator,
  terminTypValidator,
} from "./schema";
import { getUserByClerkId, requireApplicantAccess } from "./lib/auth";

/**
 * Bewerbermanagement (Applicant Management). Everything below is gated by
 * `requireApplicantAccess` (admin, or a user granted `applicantAccess`)
 * except the `api*` functions, which are server-key gated and only called by
 * the Elysia API's PDF-extraction route — see `apps/api/src/routes/applicants.ts`.
 */

function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

async function requireApplicant(
  ctx: QueryCtx | MutationCtx,
  applicantId: Id<"applicants">
): Promise<Doc<"applicants">> {
  const applicant = await ctx.db.get(applicantId);
  if (!applicant) {
    throw new ConvexError({
      code: "not_found",
      message: "Applicant not found",
    });
  }
  return applicant;
}

/** Maps a Termin's `art` to the Kontakt `art` it becomes once converted. */
function kontaktArtFromTerminArt(
  art: Doc<"applicantAppointments">["art"]
): Doc<"applicantContacts">["art"] {
  if (art === "teams") return "video";
  if (art === "vor_ort") return "persoenlich";
  return "telefon";
}

// ===========================================================================
// Skill profiles
// ===========================================================================

export const listProfiles = query({
  args: {},
  handler: async ctx => {
    await requireApplicantAccess(ctx);
    const profiles = await ctx.db.query("applicantSkillProfiles").collect();
    return profiles.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createProfile = mutation({
  args: { name: v.string(), skills: v.array(v.string()) },
  handler: async (ctx, { name, skills }) => {
    const user = await requireApplicantAccess(ctx);
    const trimmed = name.trim();
    const existing = await ctx.db.query("applicantSkillProfiles").collect();
    if (existing.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new ConvexError({
        code: "conflict",
        message: "A skill profile with this name already exists",
      });
    }
    return ctx.db.insert("applicantSkillProfiles", {
      name: trimmed,
      skills,
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const updateProfile = mutation({
  args: {
    profilId: v.id("applicantSkillProfiles"),
    name: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { profilId, name, skills }) => {
    await requireApplicantAccess(ctx);
    await ctx.db.patch(profilId, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(skills !== undefined ? { skills } : {}),
    });
    return { ok: true };
  },
});

export const removeProfile = mutation({
  args: { profilId: v.id("applicantSkillProfiles") },
  handler: async (ctx, { profilId }) => {
    await requireApplicantAccess(ctx);
    const linked = await ctx.db
      .query("applicants")
      .withIndex("by_profil", q => q.eq("profilId", profilId))
      .collect();
    for (const applicant of linked) {
      await ctx.db.patch(applicant._id, { profilId: undefined });
    }
    await ctx.db.delete(profilId);
    return { ok: true };
  },
});

// ===========================================================================
// Applicants
// ===========================================================================

/**
 * Just the "new" pipeline count — the overview's admin quick-stats widget.
 * Same access gate as `list`, but skips the per-applicant document/interview
 * fan-out since only the count is needed here.
 */
export const pipelineCount = query({
  args: {},
  handler: async ctx => {
    await requireApplicantAccess(ctx);
    const applicants = await ctx.db.query("applicants").collect();
    const contacts = await ctx.db.query("applicantContacts").collect();
    const contactedIds = new Set(contacts.map(c => c.applicantId));
    const open = applicants.filter(a => !contactedIds.has(a._id)).length;
    return { open, total: applicants.length };
  },
});

export const list = query({
  args: {},
  handler: async ctx => {
    await requireApplicantAccess(ctx);
    const applicants = await ctx.db
      .query("applicants")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
    return Promise.all(
      applicants.map(async a => {
        const [kontakte, emails, interviews, termine, documents] =
          await Promise.all([
            ctx.db
              .query("applicantContacts")
              .withIndex("by_applicant", q => q.eq("applicantId", a._id))
              .collect(),
            ctx.db
              .query("applicantEmails")
              .withIndex("by_applicant", q => q.eq("applicantId", a._id))
              .collect(),
            ctx.db
              .query("applicantInterviews")
              .withIndex("by_applicant", q => q.eq("applicantId", a._id))
              .collect(),
            ctx.db
              .query("applicantAppointments")
              .withIndex("by_applicant", q => q.eq("applicantId", a._id))
              .collect(),
            ctx.db
              .query("applicantDocuments")
              .withIndex("by_applicant", q => q.eq("applicantId", a._id))
              .collect(),
          ]);

        // Earliest appointment that hasn't been converted to a contact yet —
        // the applicant's "next thing to happen" (may be in the past, in
        // which case the UI shows it as overdue).
        const nextOpenTermin =
          termine
            .filter(tm => !tm.uebernommen)
            .sort((x, y) =>
              (x.datum + x.uhrzeit).localeCompare(y.datum + y.uhrzeit)
            )[0] ?? null;

        // Latest logged touchpoint of any kind (ISO date string compare).
        const lastActivity =
          [...kontakte, ...emails, ...interviews]
            .map(e => e.datum)
            .sort()
            .at(-1) ?? null;

        return {
          ...a,
          status: kontakte.length > 0 ? ("pool" as const) : ("neu" as const),
          documentsCount: documents.length,
          lastActivity,
          nextOpenTermin: nextOpenTermin
            ? {
                datum: nextOpenTermin.datum,
                uhrzeit: nextOpenTermin.uhrzeit,
                typ: nextOpenTermin.typ,
              }
            : null,
        };
      })
    );
  },
});

export const get = query({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    await requireApplicantAccess(ctx);
    const applicant = await requireApplicant(ctx, applicantId);
    const [kontakte, emails, interviews, termine, documents] =
      await Promise.all([
        ctx.db
          .query("applicantContacts")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
        ctx.db
          .query("applicantEmails")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
        ctx.db
          .query("applicantInterviews")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
        ctx.db
          .query("applicantAppointments")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
        ctx.db
          .query("applicantDocuments")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
      ]);
    const documentsWithUrl = await Promise.all(
      documents.map(async d => ({
        ...d,
        url: await ctx.storage.getUrl(d.storageId),
      }))
    );
    return {
      ...applicant,
      status: kontakte.length > 0 ? ("pool" as const) : ("neu" as const),
      kontakte,
      emails,
      interviews,
      termine,
      documents: documentsWithUrl,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    telefon: v.optional(v.string()),
    adresse: v.optional(v.string()),
    geburtsdatum: v.optional(v.string()),
    position: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    ausbildung: v.optional(v.string()),
    berufserfahrung: v.optional(v.string()),
    zusammenfassung: v.optional(v.string()),
    profilId: v.optional(v.id("applicantSkillProfiles")),
    notizen: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApplicantAccess(ctx);
    return ctx.db.insert("applicants", {
      ...args,
      name: args.name.trim(),
      skills: args.skills ?? [],
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    applicantId: v.id("applicants"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    telefon: v.optional(v.string()),
    adresse: v.optional(v.string()),
    geburtsdatum: v.optional(v.string()),
    position: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    ausbildung: v.optional(v.string()),
    berufserfahrung: v.optional(v.string()),
    zusammenfassung: v.optional(v.string()),
    rating: v.optional(v.union(ampelValidator, v.null())),
    profilId: v.optional(v.union(v.id("applicantSkillProfiles"), v.null())),
    notizen: v.optional(v.string()),
  },
  handler: async (ctx, { applicantId, rating, profilId, ...rest }) => {
    await requireApplicantAccess(ctx);
    await requireApplicant(ctx, applicantId);
    await ctx.db.patch(applicantId, {
      ...rest,
      ...(rating !== undefined ? { rating: rating ?? undefined } : {}),
      ...(profilId !== undefined ? { profilId: profilId ?? undefined } : {}),
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    await requireApplicantAccess(ctx);
    await requireApplicant(ctx, applicantId);

    const [kontakte, emails, interviews, termine, documents] =
      await Promise.all([
        ctx.db
          .query("applicantContacts")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
        ctx.db
          .query("applicantEmails")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
        ctx.db
          .query("applicantInterviews")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
        ctx.db
          .query("applicantAppointments")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
        ctx.db
          .query("applicantDocuments")
          .withIndex("by_applicant", q => q.eq("applicantId", applicantId))
          .collect(),
      ]);

    for (const doc of documents) await ctx.storage.delete(doc.storageId);
    for (const rows of [kontakte, emails, interviews, termine, documents]) {
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(applicantId);
    return { ok: true };
  },
});

// --- Kontakte / E-Mails / Interviews -----------------------------------------

export const addKontakt = mutation({
  args: {
    applicantId: v.id("applicants"),
    datum: v.string(),
    art: kontaktArtValidator,
    notiz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireApplicantAccess(ctx);
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantContacts", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const removeKontakt = mutation({
  args: { kontaktId: v.id("applicantContacts") },
  handler: async (ctx, { kontaktId }) => {
    await requireApplicantAccess(ctx);
    await ctx.db.delete(kontaktId);
    return { ok: true };
  },
});

export const addEmail = mutation({
  args: {
    applicantId: v.id("applicants"),
    datum: v.string(),
    kategorie: emailKategorieValidator,
    notiz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireApplicantAccess(ctx);
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantEmails", { ...args, createdAt: Date.now() });
  },
});

export const removeEmail = mutation({
  args: { emailId: v.id("applicantEmails") },
  handler: async (ctx, { emailId }) => {
    await requireApplicantAccess(ctx);
    await ctx.db.delete(emailId);
    return { ok: true };
  },
});

export const addInterview = mutation({
  args: {
    applicantId: v.id("applicants"),
    datum: v.string(),
    interviewer: v.string(),
    notiz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireApplicantAccess(ctx);
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantInterviews", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const removeInterview = mutation({
  args: { interviewId: v.id("applicantInterviews") },
  handler: async (ctx, { interviewId }) => {
    await requireApplicantAccess(ctx);
    await ctx.db.delete(interviewId);
    return { ok: true };
  },
});

// --- Documents ---------------------------------------------------------------

export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await requireApplicantAccess(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const addDocument = mutation({
  args: {
    applicantId: v.id("applicants"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireApplicantAccess(ctx);
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantDocuments", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const removeDocument = mutation({
  args: { documentId: v.id("applicantDocuments") },
  handler: async (ctx, { documentId }) => {
    await requireApplicantAccess(ctx);
    const doc = await ctx.db.get(documentId);
    if (!doc) return { ok: true };
    await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(documentId);
    return { ok: true };
  },
});

// --- Termine (appointments) ---------------------------------------------------

export const createTermin = mutation({
  args: {
    applicantId: v.id("applicants"),
    datum: v.string(),
    uhrzeit: v.string(),
    art: terminArtValidator,
    typ: terminTypValidator,
    notiz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireApplicantAccess(ctx);
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantAppointments", {
      ...args,
      uebernommen: false,
      createdAt: Date.now(),
    });
  },
});

export const listTermine = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    await requireApplicantAccess(ctx);
    const termine = await ctx.db
      .query("applicantAppointments")
      .withIndex("by_datum", q => q.gte("datum", from).lte("datum", to))
      .collect();
    const applicants = await ctx.db.query("applicants").take(5000);
    const nameById = new Map(applicants.map(a => [a._id, a.name]));
    return termine
      .map(t => ({ ...t, applicantName: nameById.get(t.applicantId) ?? null }))
      .sort((a, b) => (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit));
  },
});

export const removeTermin = mutation({
  args: { terminId: v.id("applicantAppointments") },
  handler: async (ctx, { terminId }) => {
    await requireApplicantAccess(ctx);
    await ctx.db.delete(terminId);
    return { ok: true };
  },
});

/** Converts a past/current Termin into a Kontakt entry (and an Interview entry when typ === "interview"). */
export const convertTermin = mutation({
  args: { terminId: v.id("applicantAppointments") },
  handler: async (ctx, { terminId }) => {
    await requireApplicantAccess(ctx);
    const termin = await ctx.db.get(terminId);
    if (!termin) {
      throw new ConvexError({ code: "not_found", message: "Termin not found" });
    }
    if (termin.uebernommen) {
      throw new ConvexError({
        code: "conflict",
        message: "Termin was already converted",
      });
    }
    const notizSuffix = termin.notiz ? ` – ${termin.notiz}` : "";
    await ctx.db.insert("applicantContacts", {
      applicantId: termin.applicantId,
      datum: termin.datum,
      art: kontaktArtFromTerminArt(termin.art),
      notiz: `${termin.typ}${termin.uhrzeit ? ` um ${termin.uhrzeit} Uhr` : ""} (${termin.art})${notizSuffix}`,
      createdAt: Date.now(),
    });
    if (termin.typ === "interview") {
      await ctx.db.insert("applicantInterviews", {
        applicantId: termin.applicantId,
        datum: termin.datum,
        interviewer: "",
        notiz:
          termin.notiz ||
          "Übernommen aus dem Terminkalender – Notizen ergänzen.",
        createdAt: Date.now(),
      });
    }
    await ctx.db.patch(terminId, { uebernommen: true });
    return { ok: true };
  },
});

// ===========================================================================
// Server-key gated — called by the Elysia API's PDF-extraction route
// ===========================================================================

/** Resolve a Clerk identity's Applicant Management access, for the API's auth check.
 * Also requires the vault to be unlocked — CV extraction writes real applicant
 * data, so it shouldn't be reachable while the feature is locked, even via
 * the server-key-gated API path. */
export const apiCheckAccess = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  handler: async (ctx, { serverKey, clerkUserId }) => {
    assertServerKey(serverKey);
    const user = await getUserByClerkId(ctx, clerkUserId);
    if (!user || user.status !== "active") return null;
    const roleOk = user.role === "admin" || user.applicantAccess === true;
    if (!roleOk) return { userId: user._id, hasAccess: false };
    const unlock = await ctx.db
      .query("applicantVaultUnlocks")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .unique();
    const vaultUnlocked = !!unlock && unlock.expiresAt > Date.now();
    return { userId: user._id, hasAccess: vaultUnlocked };
  },
});

/**
 * Finds an existing applicant matching by normalized email or phone, for the
 * API's duplicate-detection step on CV upload. Requires at least one usable
 * signal (a non-empty email, or a phone number with enough digits to avoid
 * false positives on short numbers).
 */
export const apiFindDuplicateByContact = query({
  args: {
    serverKey: v.string(),
    email: v.optional(v.string()),
    telefon: v.optional(v.string()),
  },
  handler: async (ctx, { serverKey, email, telefon }) => {
    assertServerKey(serverKey);
    const mailNeu = (email ?? "").trim().toLowerCase();
    const telNeu = (telefon ?? "").replace(/\D/g, "");
    if (!mailNeu && telNeu.length < 6) return null;
    const applicants = await ctx.db.query("applicants").take(5000);
    const match = applicants.find(a => {
      const mailMatch =
        mailNeu && (a.email ?? "").trim().toLowerCase() === mailNeu;
      const telMatch =
        telNeu.length >= 6 && (a.telefon ?? "").replace(/\D/g, "") === telNeu;
      return mailMatch || telMatch;
    });
    if (!match) return null;
    const matchedOn =
      mailNeu && (match.email ?? "").trim().toLowerCase() === mailNeu
        ? ("email" as const)
        : ("telefon" as const);
    return { applicantId: match._id, name: match.name, matchedOn };
  },
});

/** Skill profiles for the API's auto-profile-matching step. */
export const apiListProfiles = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    return ctx.db.query("applicantSkillProfiles").collect();
  },
});

/** A one-shot URL the API POSTs the staged CV bytes to (Convex file storage). */
export const apiGenerateStagingUrl = mutation({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    return ctx.storage.generateUploadUrl();
  },
});

/** Create a new "Neue Bewerber" record from the API's Claude extraction result. */
export const apiCreateFromExtraction = mutation({
  args: {
    serverKey: v.string(),
    createdByUserId: v.id("users"),
    name: v.string(),
    email: v.optional(v.string()),
    telefon: v.optional(v.string()),
    adresse: v.optional(v.string()),
    geburtsdatum: v.optional(v.string()),
    position: v.optional(v.string()),
    skills: v.array(v.string()),
    ausbildung: v.optional(v.string()),
    berufserfahrung: v.optional(v.string()),
    zusammenfassung: v.optional(v.string()),
    profilId: v.optional(v.id("applicantSkillProfiles")),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const applicantId = await ctx.db.insert("applicants", {
      name: args.name,
      email: args.email,
      telefon: args.telefon,
      adresse: args.adresse,
      geburtsdatum: args.geburtsdatum,
      position: args.position,
      skills: args.skills,
      ausbildung: args.ausbildung,
      berufserfahrung: args.berufserfahrung,
      zusammenfassung: args.zusammenfassung,
      profilId: args.profilId,
      createdByUserId: args.createdByUserId,
      createdAt: Date.now(),
    });
    await ctx.db.insert("applicantDocuments", {
      applicantId,
      storageId: args.storageId,
      fileName: args.fileName,
      createdAt: Date.now(),
    });
    return { applicantId };
  },
});
