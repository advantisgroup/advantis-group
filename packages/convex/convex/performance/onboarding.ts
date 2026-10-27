/**
 * Onboarding-Cockpit (/onboarding-cockpit, its own sidebar entry next to
 * Performance; data lives beside Performance's): the onboarding team works through
 * UTA new customers from the Salesforce report — prio first, follow-ups,
 * a contact log per customer. Pure helpers in `lib/onboarding.ts`.
 *
 * Access (decisions 10/2026): admins (incl. the team lead Chrisi) see and
 * distribute all cases and import reports; everyone else sees only the
 * cases assigned to them. Until the Convex env `ONBOARDING_MODE` is `live`
 * the cockpit is admins-only.
 *
 * Each case has three onboarding steps (cards ordered, first fuelling,
 * two-month check); its stage follows from how many are done.
 *
 * The intranet owns steps, assignee, prio and follow-up — a re-import
 * refreshes only the report columns, and customers that drop out of the
 * report stay (flagged `inReport: false`) until an admin archives them.
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { type Caller } from "../lib/caller";
import { displayName } from "../lib/users";
import {
  isClosedStatus,
  isContactAttempt,
  isOnboardingStatus,
  MAX_REPORT_FIELDS,
  ONBOARDING_STEPS,
  STEP_FIELD,
  type StepState,
  customerKey,
  statusFromReport,
  statusFromSteps,
  stepsFromStatus,
  stepsOf,
} from "./lib/onboarding";

type Ctx = QueryCtx | MutationCtx;

const forbidden = (message = "Kein Zugriff auf das Onboarding-Cockpit.") =>
  new ConvexError({ code: "forbidden", message });
const notFound = () => new ConvexError({ code: "not_found", message: "Fall nicht gefunden." });
const invalid = (message: string) => new ConvexError({ code: "validation", message });

/** Rollout switch, like `PERFORMANCE_MODE`: set `ONBOARDING_MODE=live` in
 * the Convex dashboard to open the cockpit to the team (no deploy needed). */
export function onboardingIsLive(): boolean {
  return process.env.ONBOARDING_MODE === "live";
}

interface CockpitAccess {
  /** Sees all cases, assigns, imports, archives. */
  canManage: boolean;
  userId: Id<"users">;
  name: string;
}

function cockpitAccess(caller: Caller): CockpitAccess | null {
  const base = { userId: caller.user._id, name: displayName(caller.user) };
  if (caller.isAdmin) return { canManage: true, ...base };
  if (onboardingIsLive()) return { canManage: false, ...base };
  return null;
}

function requireAccess(caller: Caller): CockpitAccess {
  const access = cockpitAccess(caller);
  if (!access) throw forbidden();
  return access;
}

function requireManage(caller: Caller): CockpitAccess {
  const access = requireAccess(caller);
  if (!access.canManage) throw forbidden("Nur Admins können das.");
  return access;
}

/** The case, if the person may see it: managers all, others their own. */
async function loadCase(
  ctx: Ctx,
  access: CockpitAccess,
  caseId: Id<"onboardingCases">,
): Promise<Doc<"onboardingCases">> {
  const row = await ctx.db.get(caseId);
  if (!row) throw notFound();
  if (!access.canManage && row.assigneeUserId !== access.userId) throw notFound();
  return row;
}

async function log(
  ctx: MutationCtx,
  access: CockpitAccess,
  caseId: Id<"onboardingCases">,
  entry: { kind: string; note?: string; fromValue?: string; toValue?: string },
): Promise<void> {
  await ctx.db.insert("onboardingContacts", {
    caseId,
    ...entry,
    at: Date.now(),
    byUserId: access.userId,
    byName: access.name,
  });
}

const isoDate = (value: string, label: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid(`${label}: Datum im Format JJJJ-MM-TT.`);
  return value;
};

/** The step timestamps for `next`, keeping the time a step was first
 * ticked. Writes all three, so a case from before the steps existed (stage
 * only) gets its implied steps materialised on its first change. */
function stepTimestamps(
  row: Doc<"onboardingCases"> | null,
  next: StepState,
  now: number,
): Pick<Doc<"onboardingCases">, "cardsOrderedAt" | "fuelledAt" | "twoMonthCheckAt"> {
  const out: Pick<Doc<"onboardingCases">, "cardsOrderedAt" | "fuelledAt" | "twoMonthCheckAt"> = {};
  for (const step of ONBOARDING_STEPS) {
    const field = STEP_FIELD[step];
    out[field] = next[step] ? (row?.[field] ?? now) : undefined;
  }
  return out;
}

/** Applies a new step state to `patch`: step timestamps, the stage that
 * follows from them (a finished case loses its follow-up) and one log line
 * per changed step. */
async function applySteps(
  ctx: MutationCtx,
  access: CockpitAccess,
  row: Doc<"onboardingCases">,
  next: StepState,
  patch: Partial<Doc<"onboardingCases">>,
): Promise<void> {
  const before = stepsOf(row);
  const changed = ONBOARDING_STEPS.filter((s) => before[s] !== next[s]);
  if (changed.length === 0) return;
  Object.assign(patch, stepTimestamps(row, next, Date.now()));
  const status = statusFromSteps(next);
  patch.status = status;
  if (isClosedStatus(status)) patch.nextFollowUp = undefined;
  for (const step of changed) {
    await log(ctx, access, row._id, {
      kind: "step",
      fromValue: step,
      toValue: next[step] ? "1" : "0",
    });
  }
}

/** The fields every case view shares (list rows and the detail). */
function caseFields(r: Doc<"onboardingCases">) {
  return {
    _id: r._id,
    customerNumber: r.customerNumber,
    name: r.name,
    status: r.status,
    steps: stepsOf(r),
    subStatus: r.subStatus ?? null,
    note: r.note ?? null,
    accountStatus: r.accountStatus ?? null,
    closeDate: r.closeDate ?? null,
    reportStatus: r.reportStatus ?? null,
    reportOwner: r.reportOwner ?? null,
    reportDate: r.reportDate ?? null,
    assigneeUserId: r.assigneeUserId ?? null,
    prio: r.prio,
    nextFollowUp: r.nextFollowUp ?? null,
    inReport: r.inReport,
    manual: !!r.manual,
    archived: !!r.archivedAt,
  };
}

// ------------------------------------------------------------------ reads

/** Whether the cockpit shows for the caller (nav link) and what they may do. */
export const me = userQuery({
  args: {},
  handler: async (ctx) => {
    const access = cockpitAccess(ctx.caller);
    return {
      access: !!access,
      canManage: access?.canManage ?? false,
      live: onboardingIsLive(),
    };
  },
});

/** All cases for managers, the own ones for everyone else (archived ones
 * only with `archived: true`). Small table — a few thousand rows at most. */
export const list = userQuery({
  args: { archived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = requireAccess(ctx.caller);
    const rows = access.canManage
      ? await ctx.db.query("onboardingCases").collect()
      : await ctx.db
          .query("onboardingCases")
          .withIndex("by_assignee", (q) => q.eq("assigneeUserId", access.userId))
          .collect();
    const visible = rows.filter((r) => !!r.archivedAt === !!args.archived);

    const names = new Map<Id<"users">, string>();
    for (const id of new Set(visible.map((r) => r.assigneeUserId).filter((x) => !!x))) {
      names.set(id!, displayName(await ctx.db.get(id!)));
    }
    return visible.map((r) => ({
      ...caseFields(r),
      assigneeName: r.assigneeUserId ? (names.get(r.assigneeUserId) ?? null) : null,
      lastContactAt: r.lastContactAt ?? null,
      lastContactKind: r.lastContactKind ?? null,
      contactAttempts: r.contactAttempts ?? 0,
    }));
  },
});

/** One case with its report columns and the contact log, newest first. */
export const get = userQuery({
  args: { caseId: v.id("onboardingCases") },
  handler: async (ctx, args) => {
    const access = requireAccess(ctx.caller);
    const row = await loadCase(ctx, access, args.caseId);
    const contacts = await ctx.db
      .query("onboardingContacts")
      .withIndex("by_case", (q) => q.eq("caseId", row._id))
      .order("desc")
      .take(200);
    const assignee = row.assigneeUserId ? await ctx.db.get(row.assigneeUserId) : null;
    return {
      ...caseFields(row),
      reportFields: row.reportFields ?? [],
      assigneeName: assignee ? displayName(assignee) : null,
      canManage: access.canManage,
      contacts: contacts.map((c) => ({
        _id: c._id,
        kind: c.kind,
        note: c.note ?? null,
        fromValue: c.fromValue ?? null,
        toValue: c.toValue ?? null,
        at: c.at,
        byName: c.byName,
      })),
    };
  },
});

/** People a case can be assigned to: active intranet members. */
export const assignees = userQuery({
  args: {},
  handler: async (ctx) => {
    requireManage(ctx.caller);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return users
      .map((u) => ({ userId: u._id, name: displayName(u) }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

/** The last imports, newest first. */
export const imports = userQuery({
  args: {},
  handler: async (ctx) => {
    requireManage(ctx.caller);
    const rows = await ctx.db.query("onboardingImports").order("desc").take(10);
    return rows.map((r) => ({
      _id: r._id,
      kind: r.kind,
      fileName: r.fileName,
      byName: r.byName,
      startedAt: r.startedAt,
      finished: r.finishedAt !== undefined,
      rows: r.rows,
      created: r.created,
      updated: r.updated,
      missing: r.missing,
      prioHits: r.prioHits,
    }));
  },
});

// ----------------------------------------------------------------- writes

const stepsValidator = v.object({
  cards: v.optional(v.boolean()),
  fuel: v.optional(v.boolean()),
  twoMonth: v.optional(v.boolean()),
});

/** Steps, assignee (managers only), prio, follow-up, substatus and note of
 * one case. `null` clears assignee or follow-up. `status` sets the steps it
 * implies. Step and assignee changes are written to the contact log. */
export const update = userMutation({
  args: {
    caseId: v.id("onboardingCases"),
    steps: v.optional(stepsValidator),
    status: v.optional(v.string()),
    assigneeUserId: v.optional(v.union(v.id("users"), v.null())),
    prio: v.optional(v.boolean()),
    nextFollowUp: v.optional(v.union(v.string(), v.null())),
    subStatus: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = requireAccess(ctx.caller);
    const row = await loadCase(ctx, access, args.caseId);
    const patch: Partial<Doc<"onboardingCases">> = {};

    if (args.status !== undefined && args.status !== row.status) {
      if (!isOnboardingStatus(args.status)) throw invalid("Unbekannter Status.");
      await applySteps(ctx, access, row, stepsFromStatus(args.status), patch);
    } else if (args.steps) {
      await applySteps(ctx, access, row, { ...stepsOf(row), ...stripUndefined(args.steps) }, patch);
    }
    if (args.subStatus !== undefined)
      patch.subStatus = args.subStatus.trim().slice(0, 20) || undefined;
    if (args.note !== undefined) patch.note = args.note.trim().slice(0, 2000) || undefined;

    if (args.assigneeUserId !== undefined) {
      const next = args.assigneeUserId ?? undefined;
      if (next !== row.assigneeUserId) {
        if (!access.canManage) throw forbidden("Fälle verteilen nur Admins.");
        const user = next ? await ctx.db.get(next) : null;
        if (next && (!user || user.status !== "active")) throw invalid("Person nicht gefunden.");
        patch.assigneeUserId = next;
        const before = row.assigneeUserId ? await ctx.db.get(row.assigneeUserId) : null;
        await log(ctx, access, row._id, {
          kind: "assign",
          fromValue: before ? displayName(before) : undefined,
          toValue: user ? displayName(user) : undefined,
        });
      }
    }

    if (args.prio !== undefined) patch.prio = args.prio;
    if (args.nextFollowUp !== undefined) {
      patch.nextFollowUp =
        args.nextFollowUp === null ? undefined : isoDate(args.nextFollowUp, "Wiedervorlage");
      if (isClosedStatus(patch.status ?? row.status)) patch.nextFollowUp = undefined;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now() });
    }
  },
});

/** Logs a call, mail or note, optionally setting the next follow-up and
 * status in the same step. */
export const addContact = userMutation({
  args: {
    caseId: v.id("onboardingCases"),
    kind: v.union(
      v.literal("reached"),
      v.literal("not_reached"),
      v.literal("email"),
      v.literal("note"),
    ),
    note: v.optional(v.string()),
    nextFollowUp: v.optional(v.union(v.string(), v.null())),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = requireAccess(ctx.caller);
    const row = await loadCase(ctx, access, args.caseId);
    const note = args.note?.trim().slice(0, 4000) || undefined;
    if (args.kind === "note" && !note) throw invalid("Bitte eine Notiz eintragen.");

    const now = Date.now();
    await log(ctx, access, row._id, { kind: args.kind, note });
    const patch: Partial<Doc<"onboardingCases">> = { updatedAt: now };
    if (isContactAttempt(args.kind)) {
      patch.lastContactAt = now;
      patch.lastContactKind = args.kind;
      patch.contactAttempts = (row.contactAttempts ?? 0) + 1;
    }
    if (args.nextFollowUp !== undefined) {
      patch.nextFollowUp =
        args.nextFollowUp === null ? undefined : isoDate(args.nextFollowUp, "Wiedervorlage");
    }
    if (args.status !== undefined && args.status !== row.status) {
      if (!isOnboardingStatus(args.status)) throw invalid("Unbekannter Status.");
      await applySteps(ctx, access, row, stepsFromStatus(args.status), patch);
    }
    await ctx.db.patch(row._id, patch);
  },
});

/** A customer entered by hand (not from a report). Managers may assign it;
 * everyone else creates it for themselves. A customer number that already
 * has a case is refused. */
export const create = userMutation({
  args: {
    customerNumber: v.string(),
    name: v.optional(v.string()),
    assigneeUserId: v.optional(v.union(v.id("users"), v.null())),
    accountStatus: v.optional(v.string()),
    closeDate: v.optional(v.string()),
    note: v.optional(v.string()),
    prio: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = requireAccess(ctx.caller);
    const number = args.customerNumber.trim().slice(0, 60);
    const key = customerKey(number);
    if (!key) throw invalid("Bitte eine Kundennummer eintragen.");
    // Customer names aren't kept in the intranet; optional for old callers.
    const name = args.name?.trim().slice(0, 200) ?? "";
    const existing = await ctx.db
      .query("onboardingCases")
      .withIndex("by_key", (q) => q.eq("customerKey", key))
      .first();
    if (existing) {
      throw new ConvexError({ code: "conflict", message: "Diese Kundennummer gibt es schon." });
    }
    let assignee: Id<"users"> | undefined = access.canManage
      ? (args.assigneeUserId ?? undefined)
      : access.userId;
    if (assignee) {
      const user = await ctx.db.get(assignee);
      if (!user || user.status !== "active") assignee = undefined;
    }
    const now = Date.now();
    const id = await ctx.db.insert("onboardingCases", {
      customerKey: key,
      customerNumber: number,
      name,
      status: "fresh",
      accountStatus: args.accountStatus?.trim().slice(0, 120) || undefined,
      closeDate: args.closeDate ? isoDate(args.closeDate, "Close Date") : undefined,
      note: args.note?.trim().slice(0, 2000) || undefined,
      assigneeUserId: assignee,
      prio: !!args.prio,
      inReport: true,
      manual: true,
      createdAt: now,
      updatedAt: now,
    });
    await log(ctx, access, id, { kind: "created" });
    return id;
  },
});

/** Assigns several cases at once (`null` = unassigned). */
export const assignMany = userMutation({
  args: {
    caseIds: v.array(v.id("onboardingCases")),
    assigneeUserId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args) => {
    const access = requireManage(ctx.caller);
    if (args.caseIds.length > 500) throw invalid("Höchstens 500 Fälle auf einmal.");
    const user = args.assigneeUserId ? await ctx.db.get(args.assigneeUserId) : null;
    if (args.assigneeUserId && (!user || user.status !== "active")) {
      throw invalid("Person nicht gefunden.");
    }
    const next = args.assigneeUserId ?? undefined;
    let changed = 0;
    for (const id of args.caseIds) {
      const row = await ctx.db.get(id);
      if (!row || row.assigneeUserId === next) continue;
      const before = row.assigneeUserId ? await ctx.db.get(row.assigneeUserId) : null;
      await ctx.db.patch(id, { assigneeUserId: next, updatedAt: Date.now() });
      await log(ctx, access, id, {
        kind: "assign",
        fromValue: before ? displayName(before) : undefined,
        toValue: user ? displayName(user) : undefined,
      });
      changed++;
    }
    return { changed };
  },
});

/** Archives cases (e.g. no longer in the report) or brings them back. */
export const setArchived = userMutation({
  args: { caseIds: v.array(v.id("onboardingCases")), archived: v.boolean() },
  handler: async (ctx, args) => {
    requireManage(ctx.caller);
    if (args.caseIds.length > 500) throw invalid("Höchstens 500 Fälle auf einmal.");
    const now = Date.now();
    for (const id of args.caseIds) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      await ctx.db.patch(id, { archivedAt: args.archived ? now : undefined, updatedAt: now });
    }
  },
});

// ----------------------------------------------------------------- import
//
// The browser parses the file (xlsx/csv) and sends the rows in chunks:
// `importStart` → `importReportChunk` / `importPrioChunk` … → `importFinish`.

const MAX_CHUNK = 250;

/** Opens an import. A prio list with `resetPrio` first clears every prio
 * mark, so the new list replaces the old one. */
export const importStart = userMutation({
  args: {
    kind: v.union(v.literal("report"), v.literal("prio")),
    fileName: v.string(),
    resetPrio: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = requireManage(ctx.caller);
    if (args.kind === "prio" && args.resetPrio) {
      const all = await ctx.db.query("onboardingCases").collect();
      for (const row of all) {
        if (row.prio) await ctx.db.patch(row._id, { prio: false, updatedAt: Date.now() });
      }
    }
    return await ctx.db.insert("onboardingImports", {
      kind: args.kind,
      fileName: args.fileName.slice(0, 200),
      byUserId: access.userId,
      byName: access.name,
      startedAt: Date.now(),
      rows: 0,
      created: 0,
      updated: 0,
      missing: 0,
      prioHits: 0,
      resetPrio: args.resetPrio,
    });
  },
});

async function openImport(
  ctx: MutationCtx,
  importId: Id<"onboardingImports">,
  kind: "report" | "prio",
): Promise<Doc<"onboardingImports">> {
  const imp = await ctx.db.get(importId);
  if (!imp || imp.kind !== kind || imp.finishedAt !== undefined) {
    throw invalid("Import nicht gefunden oder schon abgeschlossen.");
  }
  return imp;
}

const fieldValidator = v.object({ label: v.string(), value: v.string() });

/** Up to 250 report rows: new customers become cases (status guessed from
 * the report), known ones get fresh report columns — status, assignee,
 * prio and follow-up stay as they are. */
export const importReportChunk = userMutation({
  args: {
    importId: v.id("onboardingImports"),
    rows: v.array(
      v.object({
        customerNumber: v.string(),
        name: v.optional(v.string()),
        reportStatus: v.optional(v.string()),
        reportOwner: v.optional(v.string()),
        reportDate: v.optional(v.string()),
        accountStatus: v.optional(v.string()),
        closeDate: v.optional(v.string()),
        fields: v.optional(v.array(fieldValidator)),
      }),
    ),
  },
  handler: async (ctx, args) => {
    requireManage(ctx.caller);
    if (args.rows.length > MAX_CHUNK) throw invalid(`Höchstens ${MAX_CHUNK} Zeilen je Teil.`);
    const imp = await openImport(ctx, args.importId, "report");
    const now = Date.now();
    let created = 0;
    let updated = 0;
    for (const r of args.rows) {
      const key = customerKey(r.customerNumber);
      if (!key) continue;
      const report = {
        reportStatus: r.reportStatus?.trim() || undefined,
        reportOwner: r.reportOwner?.trim() || undefined,
        reportDate: r.reportDate?.trim() || undefined,
        accountStatus: r.accountStatus?.trim() || undefined,
        closeDate: r.closeDate?.trim() || undefined,
        reportFields: (r.fields ?? []).slice(0, MAX_REPORT_FIELDS),
        inReport: true,
        lastImportId: imp._id,
        updatedAt: now,
      };
      const existing = await ctx.db
        .query("onboardingCases")
        .withIndex("by_key", (q) => q.eq("customerKey", key))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          ...report,
          customerNumber: r.customerNumber.trim() || existing.customerNumber,
          name: r.name?.trim() || existing.name,
        });
        updated++;
      } else {
        const status = statusFromReport(r.reportStatus);
        await ctx.db.insert("onboardingCases", {
          ...report,
          customerKey: key,
          customerNumber: r.customerNumber.trim(),
          name: r.name?.trim() || "",
          ...stepTimestamps(null, stepsFromStatus(status), now),
          status,
          prio: false,
          createdAt: now,
        });
        created++;
      }
    }
    await ctx.db.patch(imp._id, {
      rows: imp.rows + args.rows.length,
      created: imp.created + created,
      updated: imp.updated + updated,
    });
    return { created, updated };
  },
});

/** Up to 250 customer numbers from a prio list: matching cases get the
 * prio mark, numbers without a case are counted as missing. */
export const importPrioChunk = userMutation({
  args: { importId: v.id("onboardingImports"), customerNumbers: v.array(v.string()) },
  handler: async (ctx, args) => {
    requireManage(ctx.caller);
    if (args.customerNumbers.length > MAX_CHUNK) {
      throw invalid(`Höchstens ${MAX_CHUNK} Nummern je Teil.`);
    }
    const imp = await openImport(ctx, args.importId, "prio");
    let hits = 0;
    let missing = 0;
    for (const key of new Set(args.customerNumbers.map(customerKey).filter(Boolean))) {
      const row = await ctx.db
        .query("onboardingCases")
        .withIndex("by_key", (q) => q.eq("customerKey", key))
        .first();
      if (!row) {
        missing++;
        continue;
      }
      if (!row.prio) await ctx.db.patch(row._id, { prio: true, updatedAt: Date.now() });
      hits++;
    }
    await ctx.db.patch(imp._id, {
      rows: imp.rows + args.customerNumbers.length,
      prioHits: imp.prioHits + hits,
      missing: imp.missing + missing,
    });
    return { hits, missing };
  },
});

/** Closes an import. After a report, open cases it didn't list are flagged
 * "nicht mehr im Report" (kept, not deleted). */
export const importFinish = userMutation({
  args: { importId: v.id("onboardingImports") },
  handler: async (ctx, args) => {
    requireManage(ctx.caller);
    const imp = await ctx.db.get(args.importId);
    if (!imp || imp.finishedAt !== undefined) {
      throw invalid("Import nicht gefunden oder schon abgeschlossen.");
    }
    let missing = imp.missing;
    if (imp.kind === "report") {
      if (imp.rows === 0) throw invalid("Der Report enthielt keine Fälle.");
      missing = 0;
      const all = await ctx.db.query("onboardingCases").collect();
      for (const row of all) {
        if (row.lastImportId === imp._id || row.archivedAt) continue;
        // Entered by hand and never in a report: nothing to miss.
        if (row.manual && !row.lastImportId) continue;
        if (row.inReport) await ctx.db.patch(row._id, { inReport: false, updatedAt: Date.now() });
        missing++;
      }
    }
    await ctx.db.patch(imp._id, { finishedAt: Date.now(), missing });
    const fresh = await ctx.db.get(imp._id);
    return {
      kind: imp.kind,
      rows: fresh!.rows,
      created: fresh!.created,
      updated: fresh!.updated,
      missing,
      prioHits: fresh!.prioHits,
    };
  },
});

function stripUndefined<T extends Record<string, boolean | undefined>>(o: T): Partial<StepState> {
  const out: Partial<StepState> = {};
  for (const step of ONBOARDING_STEPS) {
    const value = o[step];
    if (value !== undefined) out[step] = value;
  }
  return out;
}
