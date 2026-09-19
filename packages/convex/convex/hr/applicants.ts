import { serverMutation, serverQuery, userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import {
  ampelValidator,
  emailKategorieValidator,
  kontaktArtValidator,
  terminArtValidator,
  terminTypValidator,
} from "../schema";
import { batchUserSummaries, toUserSummary } from "../lib/users";
import { getServerCaller } from "../lib/caller";

/**
 * Bewerbermanagement (Applicant Management). Everything below is gated by
 * `requireApplicantAccess` (admin, or a user granted `applicantAccess`)
 * except the `api*` functions, which are server-key gated and only called by
 * the Elysia API's PDF-extraction route — see `apps/api/src/routes/applicants.ts`.
 */

async function requireApplicant(
  ctx: QueryCtx | MutationCtx,
  applicantId: Id<"applicants">,
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
  art: Doc<"applicantAppointments">["art"],
): Doc<"applicantContacts">["art"] {
  if (art === "teams") return "video";
  if (art === "vor_ort") return "persoenlich";
  return "telefon";
}

// ===========================================================================
// Skill profiles
// ===========================================================================

export const listProfiles = userQuery({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("applicantSkillProfiles").collect();
    return profiles.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createProfile = userMutation({
  applicant: "access",
  args: { name: v.string(), skills: v.array(v.string()) },
  handler: async (ctx, { name, skills }) => {
    const user = ctx.caller.user;
    const trimmed = name.trim();
    const existing = await ctx.db.query("applicantSkillProfiles").collect();
    if (existing.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
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

export const updateProfile = userMutation({
  applicant: "access",
  args: {
    profilId: v.id("applicantSkillProfiles"),
    name: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { profilId, name, skills }) => {
    await ctx.db.patch(profilId, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(skills !== undefined ? { skills } : {}),
    });
    return { ok: true };
  },
});

export const removeProfile = userMutation({
  applicant: "access",
  args: { profilId: v.id("applicantSkillProfiles") },
  handler: async (ctx, { profilId }) => {
    const linked = await ctx.db
      .query("applicants")
      .withIndex("by_profil", (q) => q.eq("profilId", profilId))
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
export const pipelineCount = userQuery({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    // Both tables are still fully scanned here — there's no aggregate/
    // counter table backing applicant counts, so a true index-only count
    // isn't available yet. Flagged as a follow-up (would need a maintained
    // counter document or a Convex aggregate component); left as-is since
    // this is a low-traffic overview widget, not a hot path.
    const applicants = await ctx.db.query("applicants").collect();
    const contacts = await ctx.db.query("applicantContacts").collect();
    const contactedIds = new Set(contacts.map((c) => c.applicantId));
    const active = applicants.filter((a) => !a.archivedAt);
    const open = active.filter((a) => !contactedIds.has(a._id)).length;
    return { open, total: active.length };
  },
});

// Safety ceiling for `list` — the applicant tracker is org-scoped (not
// expected to reach this), but an unbounded `.collect()` risks scanning an
// ever-growing table. A true `.paginate()` conversion would ripple through
// every intranet caller's data-fetching (SkillProfilePanel,
// ApplicantListView, TerminCalendar, CommandPalette, the [id] layout) since
// they all currently expect a flat array from `useQuery` — left as a
// follow-up rather than done here to keep this pass's UI-side blast radius
// minimal, per the "minimal mechanical caller updates only" constraint.
const LIST_HARD_CAP = 2000;

export const list = userQuery({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    const applicants = await ctx.db
      .query("applicants")
      .withIndex("by_createdAt")
      .order("desc")
      .take(LIST_HARD_CAP);

    // Batch-fetch each child table once instead of firing 5 indexed queries
    // per applicant (was 5*N round trips for N applicants).
    const activeApplicants = applicants.filter((a) => !a.archivedAt);
    const applicantIds = new Set(activeApplicants.map((a) => a._id));
    const [allKontakte, allEmails, allInterviews, allTermine, allDocuments] = await Promise.all([
      ctx.db.query("applicantContacts").collect(),
      ctx.db.query("applicantEmails").collect(),
      ctx.db.query("applicantInterviews").collect(),
      ctx.db.query("applicantAppointments").collect(),
      ctx.db.query("applicantDocuments").collect(),
    ]);

    const groupByApplicant = <T extends { applicantId: Id<"applicants"> }>(rows: T[]) => {
      const map = new Map<Id<"applicants">, T[]>();
      for (const row of rows) {
        if (!applicantIds.has(row.applicantId)) continue;
        const bucket = map.get(row.applicantId);
        if (bucket) bucket.push(row);
        else map.set(row.applicantId, [row]);
      }
      return map;
    };

    const kontakteByApplicant = groupByApplicant(allKontakte);
    const emailsByApplicant = groupByApplicant(allEmails);
    const interviewsByApplicant = groupByApplicant(allInterviews);
    const termineByApplicant = groupByApplicant(allTermine);
    const documentsByApplicant = groupByApplicant(allDocuments);
    const creatorsById = await batchUserSummaries(
      ctx,
      activeApplicants.map((a) => a.createdByUserId),
    );

    return activeApplicants.map((a) => {
      const kontakte = kontakteByApplicant.get(a._id) ?? [];
      const emails = emailsByApplicant.get(a._id) ?? [];
      const interviews = interviewsByApplicant.get(a._id) ?? [];
      const termine = termineByApplicant.get(a._id) ?? [];
      const documents = documentsByApplicant.get(a._id) ?? [];

      // Earliest appointment that hasn't been converted to a contact yet —
      // the applicant's "next thing to happen" (may be in the past, in
      // which case the UI shows it as overdue).
      const nextOpenTermin =
        termine
          .filter((tm) => !tm.uebernommen)
          .sort((x, y) => (x.datum + x.uhrzeit).localeCompare(y.datum + y.uhrzeit))[0] ?? null;

      // Latest logged touchpoint of any kind (ISO date string compare).
      const lastActivity =
        [...kontakte, ...emails, ...interviews]
          .map((e) => e.datum)
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
        // Additive — `createdByUserId` was previously only exposed as a raw
        // id (see Group 8 of the QoL backlog).
        createdByUser: creatorsById.get(a.createdByUserId) ?? null,
      };
    });
  },
});

export const get = userQuery({
  applicant: "access",
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const applicant = await requireApplicant(ctx, applicantId);
    const createdByUser = toUserSummary(await ctx.db.get(applicant.createdByUserId));
    const [kontakte, emails, interviews, termine, documents] = await Promise.all([
      ctx.db
        .query("applicantContacts")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
      ctx.db
        .query("applicantEmails")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
      ctx.db
        .query("applicantInterviews")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
      ctx.db
        .query("applicantAppointments")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
      ctx.db
        .query("applicantDocuments")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
    ]);
    const documentsWithUrl = await Promise.all(
      documents.map(async (d) => ({
        ...d,
        url: await ctx.storage.getUrl(d.storageId),
      })),
    );
    return {
      ...applicant,
      status: kontakte.length > 0 ? ("pool" as const) : ("neu" as const),
      kontakte,
      emails,
      interviews,
      termine,
      documents: documentsWithUrl,
      createdByUser,
    };
  },
});

export const create = userMutation({
  applicant: "access",
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
    const user = ctx.caller.user;
    return ctx.db.insert("applicants", {
      ...args,
      name: args.name.trim(),
      skills: args.skills ?? [],
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const update = userMutation({
  applicant: "access",
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
    await requireApplicant(ctx, applicantId);
    await ctx.db.patch(applicantId, {
      ...rest,
      ...(rating !== undefined ? { rating: rating ?? undefined } : {}),
      ...(profilId !== undefined ? { profilId: profilId ?? undefined } : {}),
    });
    return { ok: true };
  },
});

export const remove = userMutation({
  applicant: "access",
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    await requireApplicant(ctx, applicantId);

    const [kontakte, emails, interviews, termine, documents] = await Promise.all([
      ctx.db
        .query("applicantContacts")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
      ctx.db
        .query("applicantEmails")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
      ctx.db
        .query("applicantInterviews")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
      ctx.db
        .query("applicantAppointments")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
        .collect(),
      ctx.db
        .query("applicantDocuments")
        .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
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

export const addKontakt = userMutation({
  applicant: "access",
  args: {
    applicantId: v.id("applicants"),
    datum: v.string(),
    art: kontaktArtValidator,
    notiz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantContacts", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const removeKontakt = userMutation({
  applicant: "access",
  args: { kontaktId: v.id("applicantContacts") },
  handler: async (ctx, { kontaktId }) => {
    await ctx.db.delete(kontaktId);
    return { ok: true };
  },
});

export const addEmail = userMutation({
  applicant: "access",
  args: {
    applicantId: v.id("applicants"),
    datum: v.string(),
    kategorie: emailKategorieValidator,
    notiz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantEmails", { ...args, createdAt: Date.now() });
  },
});

export const removeEmail = userMutation({
  applicant: "access",
  args: { emailId: v.id("applicantEmails") },
  handler: async (ctx, { emailId }) => {
    await ctx.db.delete(emailId);
    return { ok: true };
  },
});

export const addInterview = userMutation({
  applicant: "access",
  args: {
    applicantId: v.id("applicants"),
    datum: v.string(),
    interviewer: v.string(),
    notiz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantInterviews", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const removeInterview = userMutation({
  applicant: "access",
  args: { interviewId: v.id("applicantInterviews") },
  handler: async (ctx, { interviewId }) => {
    await ctx.db.delete(interviewId);
    return { ok: true };
  },
});

// --- Documents ---------------------------------------------------------------

export const generateUploadUrl = userMutation({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

/** The CV a rescan run staged, so its review can show the PDF again after a
 * refresh — by then the File picked in the browser is gone. */
export const stagedFileUrl = userQuery({
  applicant: "access",
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

export const addDocument = userMutation({
  applicant: "access",
  args: {
    applicantId: v.id("applicants"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantDocuments", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const removeDocument = userMutation({
  applicant: "access",
  args: { documentId: v.id("applicantDocuments") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc) return { ok: true };
    await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(documentId);
    return { ok: true };
  },
});

// --- Termine (appointments) ---------------------------------------------------

export const createTermin = userMutation({
  applicant: "access",
  args: {
    applicantId: v.id("applicants"),
    datum: v.string(),
    uhrzeit: v.string(),
    art: terminArtValidator,
    typ: terminTypValidator,
    notiz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireApplicant(ctx, args.applicantId);
    return ctx.db.insert("applicantAppointments", {
      ...args,
      uebernommen: false,
      createdAt: Date.now(),
    });
  },
});

export const listTermine = userQuery({
  applicant: "access",
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const termine = await ctx.db
      .query("applicantAppointments")
      .withIndex("by_datum", (q) => q.gte("datum", from).lte("datum", to))
      .collect();
    // Only resolve names for the applicants actually referenced in this
    // date range, instead of scanning the whole applicants table.
    const uniqueApplicantIds = [...new Set(termine.map((t) => t.applicantId))];
    const applicants = await Promise.all(uniqueApplicantIds.map((id) => ctx.db.get(id)));
    const nameById = new Map(
      applicants.filter((a): a is NonNullable<typeof a> => a !== null).map((a) => [a._id, a.name]),
    );
    return termine
      .map((t) => ({ ...t, applicantName: nameById.get(t.applicantId) ?? null }))
      .sort((a, b) => (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit));
  },
});

export const removeTermin = userMutation({
  applicant: "access",
  args: { terminId: v.id("applicantAppointments") },
  handler: async (ctx, { terminId }) => {
    await ctx.db.delete(terminId);
    return { ok: true };
  },
});

/** Converts a past/current Termin into a Kontakt entry (and an Interview entry when typ === "interview"). */
export const convertTermin = userMutation({
  applicant: "access",
  args: { terminId: v.id("applicantAppointments") },
  handler: async (ctx, { terminId }) => {
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
        notiz: termin.notiz || "Übernommen aus dem Terminkalender – Notizen ergänzen.",
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
export const apiCheckAccess = serverQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const caller = await getServerCaller(ctx, clerkUserId);
    if (!caller) return null;
    const user = caller.user;
    if (!caller.hasApplicantAccess) return { userId: user._id, hasAccess: false };
    const unlock = await ctx.db
      .query("applicantVaultUnlocks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
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
export const apiFindDuplicateByContact = serverQuery({
  args: {
    email: v.optional(v.string()),
    telefon: v.optional(v.string()),
  },
  handler: async (ctx, { email, telefon }) => {
    const mailNeu = (email ?? "").trim().toLowerCase();
    const telNeu = (telefon ?? "").replace(/\D/g, "");
    if (!mailNeu && telNeu.length < 6) return null;

    // Prefer the indexed exact-email lookup (case-sensitive) — the common
    // case, since applicant emails are stored as entered. Only fall back to
    // a bounded full scan for case-insensitive email matches or phone-only
    // matches (no phone index exists, and numbers need normalization).
    let match = mailNeu
      ? await ctx.db
          .query("applicants")
          .withIndex("by_email", (q) => q.eq("email", mailNeu))
          .first()
      : null;

    if (!match && (mailNeu || telNeu.length >= 6)) {
      const applicants = (await ctx.db.query("applicants").take(5000)).filter((a) => !a.archivedAt);
      match =
        applicants.find((a) => {
          const mailMatch = mailNeu && (a.email ?? "").trim().toLowerCase() === mailNeu;
          const telMatch = telNeu.length >= 6 && (a.telefon ?? "").replace(/\D/g, "") === telNeu;
          return mailMatch || telMatch;
        }) ?? null;
    }
    if (!match) return null;
    const matchedOn =
      mailNeu && (match.email ?? "").trim().toLowerCase() === mailNeu
        ? ("email" as const)
        : ("telefon" as const);
    return { applicantId: match._id, name: match.name, matchedOn };
  },
});

/** Skill profiles for the API's auto-profile-matching step. */
export const apiListProfiles = serverQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("applicantSkillProfiles").collect();
  },
});

/** A one-shot URL the API POSTs the staged CV bytes to (Convex file storage). */
export const apiGenerateStagingUrl = serverMutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

/** Create a new "Neue Bewerber" record from the API's Claude extraction result. */
export const apiCreateFromExtraction = serverMutation({
  args: {
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
