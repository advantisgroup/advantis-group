import { defineTable } from "convex/server";
import { v } from "convex/values";

import {
  ampelValidator,
  emailKategorieValidator,
  kontaktArtValidator,
  onboardingItemValidator,
  terminArtValidator,
  terminTypValidator,
} from "../lib/validators";

export const hrTables = {
  // --- Applicant Management (Bewerbermanagement) ---------------------------

  /** One skill profile per position (e.g. "Buchhalter"), for skill matching. */
  applicantSkillProfiles: defineTable({
    name: v.string(),
    skills: v.array(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }),

  applicants: defineTable({
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
    rating: v.optional(ampelValidator),
    profilId: v.optional(v.id("applicantSkillProfiles")),
    notizen: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    /** The applicant agreed to stay in the talent pool until then; see
     *  hr/retention.ts. */
    poolConsentUntil: v.optional(v.number()),
    convertedEmployeeProfileId: v.optional(v.id("employeeProfiles")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_profil", ["profilId"])
    .index("by_email", ["email"])
    .index("by_archivedAt", ["archivedAt"]),

  employeeProfiles: defineTable({
    userId: v.optional(v.id("users")),
    sourceApplicantId: v.optional(v.id("applicants")),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    department: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    notes: v.optional(v.string()),
    onboarding: v.optional(v.array(onboardingItemValidator)),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"])
    .index("by_sourceApplicant", ["sourceApplicantId"])
    .index("by_createdAt", ["createdAt"]),

  // Employee documents are OneDrive-backed (Team/HR/<employee>/…), same
  // reasoning as `guidebookAttachments`: Convex only stores the reference,
  // the vault-unlock gate (`requireApplicantAccess`) is what actually
  // protects them. `storageId` is kept optional purely for rows uploaded
  // before this change (Convex-storage-backed) — `humanResources.ts`
  // branches on whichever is present.
  employeeDocuments: defineTable({
    employeeProfileId: v.id("employeeProfiles"),
    storageId: v.optional(v.id("_storage")),
    oneDriveItemId: v.optional(v.string()),
    oneDrivePath: v.optional(v.string()),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    category: v.union(
      v.literal("documents"),
      v.literal("legal"),
      v.literal("payroll"),
      v.literal("contract"),
      v.literal("other"),
    ),
    uploadedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_employee", ["employeeProfileId"])
    .index("by_storageId", ["storageId"]),

  /** Uploaded CV PDFs, stored in Convex file storage. */
  applicantDocuments: defineTable({
    applicantId: v.id("applicants"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    createdAt: v.number(),
  })
    .index("by_applicant", ["applicantId"])
    .index("by_storageId", ["storageId"]),

  /**
   * Kontakte (contact log). An applicant with zero rows here is "Neue
   * Bewerber"; the first row moves them into the "Bewerberpool".
   */
  applicantContacts: defineTable({
    applicantId: v.id("applicants"),
    datum: v.string(),
    art: kontaktArtValidator,
    notiz: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_applicant", ["applicantId"]),

  /** Tracked sent emails — does NOT count as first contact. */
  applicantEmails: defineTable({
    applicantId: v.id("applicants"),
    datum: v.string(),
    kategorie: emailKategorieValidator,
    notiz: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_applicant", ["applicantId"]),

  applicantInterviews: defineTable({
    applicantId: v.id("applicants"),
    datum: v.string(),
    interviewer: v.string(),
    notiz: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_applicant", ["applicantId"]),

  /**
   * Termine (appointments). `uebernommen` flips to true once "converted" into
   * an `applicantContacts` row (and an `applicantInterviews` row when
   * `typ === "interview"`).
   */
  applicantAppointments: defineTable({
    applicantId: v.id("applicants"),
    datum: v.string(),
    uhrzeit: v.string(),
    art: terminArtValidator,
    typ: terminTypValidator,
    notiz: v.optional(v.string()),
    uebernommen: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_applicant", ["applicantId"])
    .index("by_datum", ["datum"]),

  // Append-only audit of Applicant Management access grants/revocations.
  applicantAuditLog: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    target: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  /**
   * Applicant Management "vault": a secondary password gating the whole
   * feature on top of the normal applicantAccess/delegate checks —
   * defense-in-depth against a leaked or unattended session, not a
   * replacement for those checks. Each member sets their own password (no
   * shared secret); the row is deleted when their applicant access/delegate
   * status is revoked, or when an admin resets it, forcing a fresh setup
   * next visit.
   */
  applicantVaultPasswords: defineTable({
    userId: v.id("users"),
    hash: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Per-user vault unlock, expiring so the password must be re-entered
   * periodically rather than once ever. Rotating or resetting the password
   * (above) deletes the corresponding row here. */
  applicantVaultUnlocks: defineTable({
    userId: v.id("users"),
    unlockedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_user", ["userId"]),
};
