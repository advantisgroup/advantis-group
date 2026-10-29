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
import { onboardingOutcomeValidator } from "../tables/performance";
import {
  activeChildren,
  customerKey,
  DEFAULT_STATUS_CONFIG,
  isClosedStatus,
  isContactAttempt,
  isQuarterHour,
  MAX_REPORT_FIELDS,
  type Milestone,
  MILESTONES,
  milestonesForStatus,
  milestonesOf,
  pathLabel,
  phaseFor,
  resolvePath,
  setMilestone,
  type StatusConfig,
  statusFromReport,
  validateStatusConfig,
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
  /** Sees all cases, distributes, imports, archives: admins and the team
   * leads named in the cockpit's team setup. */
  canManage: boolean;
  /** Intranet admin: also team setup and the "view as" preview. */
  isAdmin: boolean;
  userId: Id<"users">;
  name: string;
}

async function loadSettings(ctx: Ctx): Promise<Doc<"onboardingSettings"> | null> {
  return await ctx.db.query("onboardingSettings").first();
}

/**
 * Who may do what. Admins always; team leads (team setup) manage like an
 * admin, also before the go-live so they can distribute first; everyone
 * else sees their own cases once `ONBOARDING_MODE=live`.
 */
async function cockpitAccess(ctx: Ctx & { caller: Caller }): Promise<CockpitAccess | null> {
  const caller = ctx.caller;
  const base = { userId: caller.user._id, name: displayName(caller.user) };
  if (caller.isAdmin) return { canManage: true, isAdmin: true, ...base };
  const settings = await loadSettings(ctx);
  if (settings?.leadUserIds.includes(caller.user._id)) {
    return { canManage: true, isAdmin: false, ...base };
  }
  // Released (29.10.2026): only the onboarding team set up under
  // "Verteilung → Team" – everyone else keeps not seeing the cockpit.
  if (onboardingIsLive() && settings?.memberUserIds.includes(caller.user._id)) {
    return { canManage: false, isAdmin: false, ...base };
  }
  return null;
}

async function requireAccess(ctx: Ctx & { caller: Caller }): Promise<CockpitAccess> {
  const access = await cockpitAccess(ctx);
  if (!access) throw forbidden();
  return access;
}

async function requireManage(ctx: Ctx & { caller: Caller }): Promise<CockpitAccess> {
  const access = await requireAccess(ctx);
  if (!access.canManage) throw forbidden("Nur Admins und die Teamleitung können das.");
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

/** Follow-up times on the quarter hour only (Vahan, 28.10.). */
const hhmm = (value: string): string => {
  if (!isQuarterHour(value)) throw invalid("Uhrzeit nur in Viertelstunden (z. B. 15:45).");
  return value;
};

/**
 * Sets (or clears) the follow-up date and time on `patch` and logs a move
 * when an existing follow-up changes. `time` undefined keeps the current
 * time when only the date moves; `null` drops it. A closed case never
 * keeps a follow-up.
 */
async function applyFollowUp(
  ctx: MutationCtx,
  access: CockpitAccess,
  row: Doc<"onboardingCases">,
  patch: Partial<Doc<"onboardingCases">>,
  date: string | null | undefined,
  time: string | null | undefined,
): Promise<void> {
  if (date === undefined && time === undefined) return;
  const nextDate =
    date === undefined
      ? row.nextFollowUp
      : date === null
        ? undefined
        : isoDate(date, "Wiedervorlage");
  const nextTime = !nextDate
    ? undefined
    : time === undefined
      ? row.nextFollowUpTime
      : time === null || time === ""
        ? undefined
        : hhmm(time);
  if (isClosedStatus(patch.status ?? row.status)) {
    patch.nextFollowUp = undefined;
    patch.nextFollowUpTime = undefined;
    return;
  }
  patch.nextFollowUp = nextDate;
  patch.nextFollowUpTime = nextTime;
  const before = row.nextFollowUp ? `${row.nextFollowUp} ${row.nextFollowUpTime ?? ""}`.trim() : "";
  const after = nextDate ? `${nextDate} ${nextTime ?? ""}`.trim() : "";
  if (before !== after) {
    await log(ctx, access, row._id, {
      kind: "followUp",
      fromValue: before || undefined,
      toValue: after || undefined,
    });
  }
}

const isoDate = (value: string, label: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid(`${label}: Datum im Format JJJJ-MM-TT.`);
  return value;
};

async function loadStatusConfig(ctx: Ctx): Promise<StatusConfig> {
  const row = await ctx.db.query("onboardingStatusConfig").first();
  return { outcomes: row?.outcomes ?? DEFAULT_STATUS_CONFIG.outcomes };
}

const STATUS_NAMES: Record<string, string> = {
  fresh: "Neu",
  step1: "In Kontakt",
  step2: "Karten bestellt",
  step3: "Getankt",
  done: "Abgeschlossen",
  winback: "Winback",
};

/** "In Kontakt" / "Abgeschlossen" … for the log. */
function statusName(status: string): string {
  return STATUS_NAMES[status] ?? status;
}

/** Whether anyone has dealt with the case yet (then it's no longer "Neu"). */
function contacted(row: Doc<"onboardingCases">): boolean {
  return (
    row.status !== "fresh" || (row.contactAttempts ?? 0) > 0 || (row.outcomePath?.length ?? 0) > 0
  );
}

/**
 * Moves a case to `status` on `patch`; a closed case loses its follow-up
 * and gets `closedAt`. Logs the change. No-op when the status stays.
 */
async function setStatus(
  ctx: MutationCtx,
  access: CockpitAccess,
  row: Doc<"onboardingCases">,
  status: string,
  patch: Partial<Doc<"onboardingCases">>,
): Promise<void> {
  const from = patch.status ?? row.status;
  if (status === from) return;
  patch.status = status;
  if (isClosedStatus(status)) {
    patch.closedAt = Date.now();
    patch.nextFollowUp = undefined;
    patch.nextFollowUpTime = undefined;
  } else {
    patch.closedAt = undefined;
  }
  await log(ctx, access, row._id, {
    kind: "status",
    fromValue: statusName(from),
    toValue: statusName(status),
  });
}

/** The fields every case view shares (list rows and the detail). */
function caseFields(r: Doc<"onboardingCases">) {
  return {
    _id: r._id,
    customerNumber: r.customerNumber,
    name: r.name,
    status: r.status,
    outcomePath: r.outcomePath ?? [],
    outcomeText: r.outcomeText ?? null,
    outcomeAt: r.outcomeAt ?? null,
    outcomeByName: r.outcomeByName ?? null,
    milestones: milestonesOf(r),
    closedAt: r.closedAt ?? null,
    note: r.note ?? null,
    accountStatus: r.accountStatus ?? null,
    closeDate: r.closeDate ?? null,
    reportStatus: r.reportStatus ?? null,
    reportOwner: r.reportOwner ?? null,
    reportDate: r.reportDate ?? null,
    assigneeUserId: r.assigneeUserId ?? null,
    prio: r.prio,
    nextFollowUp: r.nextFollowUp ?? null,
    nextFollowUpTime: r.nextFollowUp ? (r.nextFollowUpTime ?? null) : null,
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
    const access = await cockpitAccess(ctx);
    return {
      access: !!access,
      canManage: access?.canManage ?? false,
      isAdmin: access?.isAdmin ?? false,
      live: onboardingIsLive(),
    };
  },
});

/** All cases for managers, the own ones for everyone else (archived ones
 * only with `archived: true`). Small table — a few thousand rows at most. */
export const list = userQuery({
  args: {
    archived: v.optional(v.boolean()),
    /** "Ansicht als": managers see exactly that person's own list. */
    asUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx);
    if (args.asUserId && !access.canManage) throw forbidden();
    const ownerId = args.asUserId ?? (access.canManage ? null : access.userId);
    const rows = ownerId
      ? await ctx.db
          .query("onboardingCases")
          .withIndex("by_assignee", (q) => q.eq("assigneeUserId", ownerId))
          .collect()
      : await ctx.db.query("onboardingCases").collect();
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
    const access = await requireAccess(ctx);
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
    await requireManage(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const settings = await loadSettings(ctx);
    const members = new Set(settings?.memberUserIds ?? []);
    const leads = new Set(settings?.leadUserIds ?? []);
    const paused = new Set(settings?.pausedUserIds ?? []);
    return users
      .map((u) => ({
        userId: u._id,
        name: displayName(u),
        member: members.has(u._id),
        lead: leads.has(u._id),
        paused: paused.has(u._id),
      }))
      .sort((a, b) => Number(b.member) - Number(a.member) || a.name.localeCompare(b.name, "de"));
  },
});

/** The cockpit's team setup (members, leads, paused). */
export const settings = userQuery({
  args: {},
  handler: async (ctx) => {
    await requireManage(ctx);
    const row = await loadSettings(ctx);
    return {
      memberUserIds: row?.memberUserIds ?? [],
      leadUserIds: row?.leadUserIds ?? [],
      pausedUserIds: row?.pausedUserIds ?? [],
      updatedAt: row?.updatedAt ?? null,
      updatedByName: row?.updatedByName ?? null,
    };
  },
});

/** Team members and paused people: managers. Team leads: admins only
 * (they grant management rights). */
export const saveSettings = userMutation({
  args: {
    memberUserIds: v.array(v.id("users")),
    pausedUserIds: v.array(v.id("users")),
    leadUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const access = await requireManage(ctx);
    if (args.leadUserIds !== undefined && !access.isAdmin) {
      throw forbidden("Teamleitungen legen nur Admins fest.");
    }
    const row = await loadSettings(ctx);
    const members = [...new Set(args.memberUserIds)].slice(0, 100);
    const next = {
      memberUserIds: members,
      pausedUserIds: [...new Set(args.pausedUserIds)].filter((id) => members.includes(id)),
      leadUserIds: [...new Set(args.leadUserIds ?? row?.leadUserIds ?? [])].slice(0, 20),
      updatedAt: Date.now(),
      updatedByName: access.name,
    };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("onboardingSettings", next);
  },
});

/** The last imports, newest first. */
export const imports = userQuery({
  args: {},
  handler: async (ctx) => {
    await requireManage(ctx);
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

/** Milestone tick (moves the phase), closing/reopening, assignee (managers
 * only), prio, follow-up and note of one case. `null` clears assignee or
 * follow-up. Phase, milestone and assignee changes are written to the
 * contact log. */
export const update = userMutation({
  args: {
    caseId: v.id("onboardingCases"),
    /** "winback" / "done" close the case, "open" reopens it in its phase. */
    status: v.optional(v.union(v.literal("winback"), v.literal("done"), v.literal("open"))),
    milestone: v.optional(
      v.object({
        key: v.union(v.literal("cards"), v.literal("fuel"), v.literal("twoMonth")),
        done: v.boolean(),
      }),
    ),
    assigneeUserId: v.optional(v.union(v.id("users"), v.null())),
    prio: v.optional(v.boolean()),
    nextFollowUp: v.optional(v.union(v.string(), v.null())),
    nextFollowUpTime: v.optional(v.union(v.string(), v.null())),
    subStatus: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx);
    const row = await loadCase(ctx, access, args.caseId);
    const patch: Partial<Doc<"onboardingCases">> = {};
    let milestones: Milestone[] = milestonesOf(row);

    if (args.milestone) {
      const { key, done } = args.milestone;
      const next = setMilestone(milestones, key, done);
      for (const m of MILESTONES) {
        if (milestones.includes(m) !== next.includes(m)) {
          await log(ctx, access, row._id, {
            kind: "milestone",
            fromValue: m,
            toValue: next.includes(m) ? "1" : "0",
          });
        }
      }
      milestones = next;
      patch.milestonesDone = next;
      // A winback case keeps its place; everything else follows the ticks.
      if (row.status !== "winback") {
        await setStatus(ctx, access, row, phaseFor(next, true), patch);
      }
    }
    if (args.status === "open") {
      if (isClosedStatus(row.status)) {
        const phase = phaseFor(milestones, true);
        await setStatus(ctx, access, row, phase === "done" ? "step3" : phase, patch);
      }
    } else if (args.status !== undefined) {
      await setStatus(ctx, access, row, args.status, patch);
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
    await applyFollowUp(ctx, access, row, patch, args.nextFollowUp, args.nextFollowUpTime);

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
    nextFollowUpTime: v.optional(v.union(v.string(), v.null())),
    /** Closes the case in the same step. */
    status: v.optional(v.union(v.literal("winback"), v.literal("done"))),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx);
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
      if (row.status === "fresh") await setStatus(ctx, access, row, "step1", patch);
    }
    if (args.status !== undefined) await setStatus(ctx, access, row, args.status, patch);
    await applyFollowUp(ctx, access, row, patch, args.nextFollowUp, args.nextFollowUpTime);
    await ctx.db.patch(row._id, patch);
  },
});

/**
 * Records the situation of a contact ("Lage"): a path through the tree down
 * to an entry without (visible) children, plus free text where it asks for
 * it. Any contact moves a new case to "In Kontakt"; "will cancel" closes
 * it onto the winback list. Reaching or not reaching the customer counts
 * as a contact attempt.
 */
export const setOutcome = userMutation({
  args: {
    caseId: v.id("onboardingCases"),
    path: v.array(v.string()),
    text: v.optional(v.string()),
    /** How the contact happened (default phone). */
    channel: v.optional(v.union(v.literal("phone"), v.literal("email"))),
    nextFollowUp: v.optional(v.union(v.string(), v.null())),
    nextFollowUpTime: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx);
    const row = await loadCase(ctx, access, args.caseId);
    if (isClosedStatus(row.status)) throw invalid("Der Fall ist geschlossen.");
    const config = await loadStatusConfig(ctx);
    const nodes = resolvePath(config, args.path);
    if (!nodes) throw invalid("Diese Lage gibt es nicht.");
    const last = nodes[nodes.length - 1];
    if (nodes.some((n) => n.archived)) throw invalid("Diese Lage ist ausgeblendet.");
    if (activeChildren(last).length > 0) throw invalid("Bitte den Grund genauer auswählen.");
    const text = args.text?.trim().slice(0, 2000) || undefined;
    if (last.freetext && !text) throw invalid("Bitte den Freitext ausfüllen.");

    const now = Date.now();
    const kind = nodes[0].kind ?? "other";
    await log(ctx, access, row._id, {
      kind: "outcome",
      fromValue: args.channel === "email" ? "email" : "phone",
      toValue: pathLabel(config, args.path) ?? undefined,
      note: text,
    });

    const patch: Partial<Doc<"onboardingCases">> = {
      outcomePath: args.path,
      outcomeText: text,
      outcomeAt: now,
      outcomeByName: access.name,
      updatedAt: now,
    };
    if (kind !== "other") {
      patch.lastContactAt = now;
      patch.lastContactKind =
        args.channel === "email" ? "email" : kind === "notReached" ? "not_reached" : "reached";
      patch.contactAttempts = (row.contactAttempts ?? 0) + 1;
    }
    if (kind === "cancel") await setStatus(ctx, access, row, "winback", patch);
    else if (row.status === "fresh") await setStatus(ctx, access, row, "step1", patch);
    await applyFollowUp(ctx, access, row, patch, args.nextFollowUp, args.nextFollowUpTime);
    await ctx.db.patch(row._id, patch);
    return { status: patch.status ?? row.status };
  },
});

// ------------------------------------------------------------ situations

/** The situation tree ("Lage" with reasons) everyone works with. */
export const statusConfig = userQuery({
  args: {},
  handler: async (ctx) => {
    await requireAccess(ctx);
    const row = await ctx.db.query("onboardingStatusConfig").first();
    return {
      outcomes: row?.outcomes ?? DEFAULT_STATUS_CONFIG.outcomes,
      custom: !!row?.outcomes,
      updatedAt: row?.outcomes ? row.updatedAt : null,
      updatedByName: row?.outcomes ? row.updatedByName : null,
    };
  },
});

/** Saves an edited situation tree: admins and team leads. Entries may be
 * renamed, added and hidden, but not deleted (old cases point at them). */
export const saveStatusConfig = userMutation({
  args: { outcomes: v.array(onboardingOutcomeValidator) },
  handler: async (ctx, args) => {
    const access = await requireManage(ctx);
    const previous = await loadStatusConfig(ctx);
    const errors = validateStatusConfig({ outcomes: args.outcomes }, previous);
    if (errors.length > 0) throw invalid(errors.slice(0, 3).join(" "));
    const row = await ctx.db.query("onboardingStatusConfig").first();
    const next = { outcomes: args.outcomes, updatedAt: Date.now(), updatedByName: access.name };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("onboardingStatusConfig", next);
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
    const access = await requireAccess(ctx);
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
    const access = await requireManage(ctx);
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

/** Which open cases a distribution may hand out, best first: prio, then
 * oldest (close date / report date), then number. */
function distributionOrder(a: Doc<"onboardingCases">, b: Doc<"onboardingCases">): number {
  const date = (r: Doc<"onboardingCases">) => r.closeDate ?? r.reportDate ?? "9999";
  return (
    Number(b.prio) - Number(a.prio) ||
    date(a).localeCompare(date(b)) ||
    a.customerNumber.localeCompare(b.customerNumber, "de", { numeric: true })
  );
}

const allocationValidator = v.array(v.object({ userId: v.id("users"), count: v.number() }));

async function checkPeople(ctx: Ctx, ids: Id<"users">[]): Promise<Map<Id<"users">, string>> {
  const names = new Map<Id<"users">, string>();
  for (const id of new Set(ids)) {
    const user = await ctx.db.get(id);
    if (!user || user.status !== "active") throw invalid("Person nicht gefunden.");
    names.set(id, displayName(user));
  }
  return names;
}

/**
 * Hands out unassigned open cases: `count` per person, best cases first
 * and taken in turns so everyone gets a similar mix of prio and old ones.
 * `onlyNew` limits the pool to cases without any step done. Returns how
 * many each person actually got (the pool may be smaller than asked).
 */
export const distribute = userMutation({
  args: { allocations: allocationValidator, onlyNew: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = await requireManage(ctx);
    const wanted = args.allocations
      .map((a) => ({ ...a, count: Math.max(0, Math.floor(a.count)) }))
      .filter((a) => a.count > 0);
    const total = wanted.reduce((sum, a) => sum + a.count, 0);
    if (total === 0) return { assigned: 0, perUser: [] };
    if (total > 2000) throw invalid("Höchstens 2000 Fälle auf einmal.");
    const names = await checkPeople(
      ctx,
      wanted.map((a) => a.userId),
    );

    const pool = (await ctx.db.query("onboardingCases").collect())
      .filter((r) => !r.archivedAt && !r.assigneeUserId && !isClosedStatus(r.status))
      .filter((r) => !args.onlyNew || r.status === "fresh")
      .sort(distributionOrder);

    // Round-robin over whoever still has room, so the best cases spread.
    const left = new Map(wanted.map((a) => [a.userId, a.count]));
    const got = new Map<Id<"users">, number>();
    let i = 0;
    const now = Date.now();
    for (const row of pool) {
      const open = wanted.filter((a) => (left.get(a.userId) ?? 0) > 0);
      if (open.length === 0) break;
      const target = open[i % open.length];
      i++;
      left.set(target.userId, (left.get(target.userId) ?? 0) - 1);
      got.set(target.userId, (got.get(target.userId) ?? 0) + 1);
      await ctx.db.patch(row._id, { assigneeUserId: target.userId, updatedAt: now });
      await log(ctx, access, row._id, {
        kind: "assign",
        toValue: names.get(target.userId),
        note: "Verteilung",
      });
    }
    const perUser = wanted.map((a) => ({ userId: a.userId, count: got.get(a.userId) ?? 0 }));
    return { assigned: perUser.reduce((sum, a) => sum + a.count, 0), perUser };
  },
});

/**
 * Moves cases away from one person (holiday, sick, leaving) and splits
 * them evenly among `toUserIds` — or back to unassigned when the list is
 * empty. `scope`: only cases without any step done ("new"), or all open
 * ones ("open"). `count` caps how many move (default all).
 */
export const reassign = userMutation({
  args: {
    fromUserId: v.id("users"),
    toUserIds: v.array(v.id("users")),
    scope: v.union(v.literal("new"), v.literal("open")),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireManage(ctx);
    const targets = [...new Set(args.toUserIds)].filter((id) => id !== args.fromUserId);
    const names = await checkPeople(ctx, targets);
    const from = await ctx.db.get(args.fromUserId);
    const rows = (
      await ctx.db
        .query("onboardingCases")
        .withIndex("by_assignee", (q) => q.eq("assigneeUserId", args.fromUserId))
        .collect()
    )
      .filter((r) => !r.archivedAt && !isClosedStatus(r.status))
      .filter((r) => args.scope === "open" || r.status === "fresh")
      .sort(distributionOrder)
      .slice(0, args.count === undefined ? undefined : Math.max(0, Math.floor(args.count)));
    const now = Date.now();
    for (const [k, row] of rows.entries()) {
      const to = targets.length ? targets[k % targets.length] : undefined;
      await ctx.db.patch(row._id, { assigneeUserId: to, updatedAt: now });
      await log(ctx, access, row._id, {
        kind: "assign",
        fromValue: from ? displayName(from) : undefined,
        toValue: to ? names.get(to) : undefined,
        note: "Umverteilung",
      });
    }
    return { moved: rows.length };
  },
});

/** Archives cases (e.g. no longer in the report) or brings them back. */
export const setArchived = userMutation({
  args: { caseIds: v.array(v.id("onboardingCases")), archived: v.boolean() },
  handler: async (ctx, args) => {
    await requireManage(ctx);
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
    const access = await requireManage(ctx);
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
    await requireManage(ctx);
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
          status,
          milestonesDone: milestonesForStatus(status),
          ...(isClosedStatus(status) ? { closedAt: now } : {}),
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
    await requireManage(ctx);
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
    await requireManage(ctx);
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
