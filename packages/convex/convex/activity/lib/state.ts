import { z } from "zod";

/**
 * Unified employee-state model.
 *
 * The desktop agent only knows about the *workstation* — it cannot tell the
 * difference between "left the desk" and "on a phone call with the screen
 * untouched". Reporting raw device idle as IDLE therefore mislabels people who
 * are in a Genesys call, doing after-call work, on a Clockodo break, or absent.
 *
 * The backend is the single source of truth: it fuses three independent signals
 * (workstation activity, Genesys telephony, Clockodo time-tracking) into one
 * normalized state, applying a strict priority order so a higher-priority truth
 * (e.g. "on a call") always wins over a lower-priority guess (e.g. "idle").
 *
 * This module is the pure, dependency-free core so it can be unit tested and
 * shared verbatim by the Convex backend and the dashboard.
 */

/** Final employee states, highest priority first. */
export const EMPLOYEE_STATES = [
  "ABSENT",
  "BREAK",
  "IN_CALL",
  "WRAP_UP",
  "ACTIVE",
  "IDLE",
] as const;
export type EmployeeState = (typeof EMPLOYEE_STATES)[number];

/** Priority rank — lower number = higher priority (overrides the rest). */
export const STATE_PRIORITY: Record<EmployeeState, number> =
  EMPLOYEE_STATES.reduce(
    (acc, state, i) => {
      acc[state] = i;
      return acc;
    },
    {} as Record<EmployeeState, number>,
  );

/** Genesys routing status values (per /routingstatus). */
export const GENESYS_ROUTING_STATUSES = [
  "IDLE",
  "INTERACTING",
  "OFF_QUEUE",
  "NOT_RESPONDING",
] as const;
export type GenesysRoutingStatus = (typeof GENESYS_ROUTING_STATUSES)[number];

/** Genesys system presence values (per /presences/purecloud). */
export const GENESYS_PRESENCES = [
  "AVAILABLE",
  "BUSY",
  "AWAY",
  "OFFLINE",
] as const;
export type GenesysPresence = (typeof GENESYS_PRESENCES)[number];

/**
 * Everything the state engine needs to decide a final state. Every field is
 * optional because the three sources report independently and asynchronously;
 * a missing signal means "we have no information", not "false".
 */
export interface StateSignals {
  /** Workstation reports no input for a while (from the desktop agent). */
  deviceIdle?: boolean;
  /** Seconds of continuous workstation idle, for reporting/thresholds. */
  idleSeconds?: number;

  /** Latest Genesys routing status (telephony queue interaction). */
  genesysRoutingStatus?: GenesysRoutingStatus;
  /** Latest Genesys system presence. */
  genesysPresence?: GenesysPresence;
  /**
   * After-call work / wrap-up. Genesys exposes this via presence or
   * conversation participant state rather than routing status, so it is carried
   * as its own boolean signal.
   */
  genesysWrapUp?: boolean;

  /** Clockodo: a time entry is currently running (clocked in & working). */
  clockodoWorking?: boolean;
  /** Clockodo: the running entry is a break type. */
  clockodoBreak?: boolean;
  /** Clockodo: an approved absence (vacation, sick, etc.) covers right now. */
  clockodoAbsent?: boolean;
}

/**
 * The state engine. Mirrors the documented priority order exactly:
 *
 *   ABSENT → BREAK → IN_CALL → WRAP_UP → ACTIVE → IDLE
 *
 * A higher-priority condition always short-circuits the lower ones.
 */
export function computeEmployeeState(signals: StateSignals): EmployeeState {
  if (signals.clockodoAbsent) return "ABSENT";
  if (signals.clockodoBreak) return "BREAK";
  if (signals.genesysRoutingStatus === "INTERACTING") return "IN_CALL";
  if (signals.genesysWrapUp) return "WRAP_UP";
  if (signals.deviceIdle) return "IDLE";
  return "ACTIVE";
}

// --- Wire contracts for the integration endpoints ------------------------

/**
 * Payload from the desktop agent's activity heartbeat
 * (`POST /api/activity/update`). The agent only ever reports the workstation;
 * it has no knowledge of telephony or time-tracking.
 */
export const activityUpdateSchema = z.object({
  employeeId: z.string().min(1).max(128),
  deviceIdle: z.boolean(),
  idleSeconds: z.number().int().nonnegative().max(7 * 24 * 60 * 60),
  timestamp: z.string().datetime(),
});
export type ActivityUpdate = z.infer<typeof activityUpdateSchema>;

/**
 * Normalized Genesys signal pushed in from a notifications WebSocket relay (or
 * a poll). Carries whatever subset of telephony state we currently know.
 */
export const genesysSignalSchema = z.object({
  employeeId: z.string().min(1).max(128),
  routingStatus: z.enum(GENESYS_ROUTING_STATUSES).optional(),
  presence: z.enum(GENESYS_PRESENCES).optional(),
  wrapUp: z.boolean().optional(),
  timestamp: z.string().datetime().optional(),
});
export type GenesysSignal = z.infer<typeof genesysSignalSchema>;

/**
 * Normalized Clockodo signal (from the webhook or the polling fallback). All
 * three flags are independent: a person can be absent without a running entry.
 */
export const clockodoSignalSchema = z.object({
  employeeId: z.string().min(1).max(128),
  working: z.boolean().optional(),
  onBreak: z.boolean().optional(),
  absent: z.boolean().optional(),
  timestamp: z.string().datetime().optional(),
});
export type ClockodoSignal = z.infer<typeof clockodoSignalSchema>;

// --- Pure Genesys normalization (shared by the backend cron action and the
//     optional WebSocket worker, which run in different runtimes) -----------

export function normalizeRoutingStatus(
  raw: string | undefined,
): GenesysRoutingStatus | undefined {
  switch (raw?.toUpperCase()) {
    case "IDLE":
      return "IDLE";
    case "INTERACTING":
      return "INTERACTING";
    case "OFF_QUEUE":
      return "OFF_QUEUE";
    case "NOT_RESPONDING":
      return "NOT_RESPONDING";
    default:
      return undefined;
  }
}

/**
 * Genesys `systemPresence` is a richer enum than our four-value model; collapse
 * the long tail (Meeting, Training, Break, Meal, …) onto the nearest bucket.
 */
export function normalizePresence(
  raw: string | undefined,
): GenesysPresence | undefined {
  switch (raw?.toUpperCase()) {
    case "AVAILABLE":
    case "ON QUEUE":
    case "ON_QUEUE":
      return "AVAILABLE";
    case "BUSY":
    case "MEETING":
    case "MEAL":
    case "TRAINING":
      return "BUSY";
    case "AWAY":
    case "IDLE":
    case "BREAK":
    case "OUT OF OFFICE":
    case "OUT_OF_OFFICE":
      return "AWAY";
    case "OFFLINE":
      return "OFFLINE";
    default:
      return undefined;
  }
}

/** After-call work surfaces as a dedicated system presence in Genesys. */
export function isWrapUpPresence(raw: string | undefined): boolean {
  const v = raw?.toUpperCase();
  return v === "WRAP UP" || v === "WRAP-UP" || v === "WRAPUP";
}

/** Topic ids that carry the state we care about, for one Genesys user. */
export function genesysTopicsForUser(genesysUserId: string): string[] {
  return [
    `v2.users.${genesysUserId}.routingStatus`,
    `v2.users.${genesysUserId}.presence`,
    `v2.users.${genesysUserId}.conversations`,
  ];
}

/** A normalized slice of telephony state extracted from a notification event. */
export interface ParsedGenesysEvent {
  genesysUserId: string;
  routingStatus?: GenesysRoutingStatus;
  presence?: GenesysPresence;
  wrapUp?: boolean;
}

/**
 * Map a raw notifications WebSocket message to a normalized event, or null if
 * it's a heartbeat / unrelated topic. Topic id shape: `v2.users.{id}.{kind}`.
 */
export function parseGenesysNotification(
  raw: unknown,
): ParsedGenesysEvent | null {
  const msg = raw as { topicName?: string; eventBody?: unknown };
  const topic = msg?.topicName;
  if (!topic) return null;

  const m = /^v2\.users\.([^.]+)\.(routingStatus|presence|conversations)$/.exec(
    topic,
  );
  if (!m) return null;
  const genesysUserId = m[1]!;
  const kind = m[2]!;
  const eventBody = msg.eventBody as Record<string, unknown> | undefined;
  if (!eventBody) return null;

  if (kind === "routingStatus") {
    const status = (eventBody.routingStatus as { status?: string } | undefined)
      ?.status;
    return { genesysUserId, routingStatus: normalizeRoutingStatus(status) };
  }

  if (kind === "presence") {
    const system = (
      eventBody.presenceDefinition as { systemPresence?: string } | undefined
    )?.systemPresence;
    return {
      genesysUserId,
      presence: normalizePresence(system),
      wrapUp: isWrapUpPresence(system),
    };
  }

  // conversations: flag after-call work when any participant is in wrap-up.
  const participants =
    (eventBody.participants as
      | Array<{ wrapupRequired?: boolean; state?: string }>
      | undefined) ?? [];
  const inWrapUp = participants.some(
    (p) => p.state?.toLowerCase() === "wrapup" || p.wrapupRequired === true,
  );
  return { genesysUserId, wrapUp: inWrapUp };
}
