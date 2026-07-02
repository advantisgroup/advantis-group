/**
 * Plain-language status descriptor for one device/employee.
 *
 * ActivityTrack's primary job is to answer, at a glance, "is this person active
 * right now, and what are they doing?" — in words, not a chart. The fused state
 * engine already reduces the three signal sources to one of
 * ABSENT/BREAK/IN_CALL/WRAP_UP/ACTIVE/IDLE, but a single uppercase token ("IDLE")
 * doesn't say *why*. This helper turns the raw signal combination into a written
 * sentence ("Clocked in but inactive", "On a call", "Computer offline") plus a
 * tone, so the UI can lead with the answer.
 *
 * Precedence mirrors `computeEmployeeState`
 * (packages/convex/convex/activity/lib/state.ts) so the headline never disagrees
 * with the fused state, then layers in two things the engine doesn't model:
 *   - device reachability (offline), and
 *   - Clockodo "clocked-in" context, which distinguishes a plain idle PC from
 *     someone who is on the clock but away from the keyboard.
 *
 * Pure and dependency-free (no i18n, no React) so it stays easy to reason about
 * and reuse on both the Overview grid and the device timeline.
 */

export type StatusTone = "ok" | "warn" | "info" | "muted";

/** Every signal the headline can depend on. Integration signals are nullable. */
export interface StatusInput {
  /** Device heartbeat is within the online window. */
  online: boolean;
  /** Workstation reports no input for a while (from the desktop agent). */
  deviceIdle: boolean | null;
  /** Seconds of continuous workstation idle, for the "idle for X" sub-line. */
  idleSeconds: number | null;
  /** Latest Genesys routing status (telephony). */
  genesysRoutingStatus: string | null;
  /** After-call work / wrap-up. */
  genesysWrapUp: boolean | null;
  /** Clockodo: a time entry is currently running (clocked in & working). */
  clockodoWorking: boolean | null;
  /** Clockodo: the running entry is a break. */
  clockodoBreak: boolean | null;
  /** Clockodo: an approved absence covers right now. */
  clockodoAbsent: boolean | null;
  /**
   * Clockodo: not clocked in for over an hour → *assumed* done for the day.
   * Provisional — the backend re-labels the stretch as a break if the person
   * clocks back in the same day — until `clockodoClockedOutCertain`.
   */
  clockodoClockedOut?: boolean | null;
  /**
   * Past the business day-end hour the clock-out stops being a guess: it is
   * final, and the "(assumed)" presentation must be dropped.
   */
  clockodoClockedOutCertain?: boolean | null;
  /**
   * Raw device-active flag (online && not idle past the threshold). Used as the
   * fallback verdict for devices with no fused integration signals at all.
   */
  active?: boolean | null;
}

export interface StatusDescriptor {
  /** i18n key for the plain-language headline, e.g. "livestatus.clockedInInactive". */
  headlineKey: string;
  /** Semantic tone, mapped to colour by the renderer. */
  tone: StatusTone;
  /** Whether to show a pulsing "live" dot (actively doing work right now). */
  live: boolean;
  /** Whether the caller should append the existing "idle for {duration}" line. */
  showIdleFor: boolean;
  /**
   * The verdict is an assumption, not a reported fact — the renderer must mark
   * it as such (it auto-corrects when new data arrives).
   */
  assumed?: boolean;
}

/**
 * Resolve the written status for one device/employee from its raw signals.
 *
 * Order (highest-priority truth first):
 *   absent → clocked out (assumed) → break → on a call → wrap-up → offline →
 *   clocked-in-but-idle → idle → clocked-in-and-working → active.
 *
 * When no integration ever reported (all Clockodo/Genesys signals null and
 * `deviceIdle` unknown), fall back to the device reachability/active flags so an
 * unlinked device still reads sensibly (offline / active / inactive).
 */
export function describeStatus(input: StatusInput): StatusDescriptor {
  const {
    online,
    deviceIdle,
    genesysRoutingStatus,
    genesysWrapUp,
    clockodoWorking,
    clockodoBreak,
    clockodoAbsent,
    clockodoClockedOut,
    clockodoClockedOutCertain,
    active,
  } = input;

  // These are independent of the workstation, so they hold even when the
  // PC is asleep/offline — check them before the offline short-circuit.
  if (clockodoAbsent)
    return {
      headlineKey: "livestatus.absent",
      tone: "muted",
      live: false,
      showIdleFor: false,
    };
  if (clockodoClockedOut) {
    const certain = clockodoClockedOutCertain === true;
    return {
      headlineKey: certain
        ? "livestatus.clockedOutCertain"
        : "livestatus.clockedOut",
      tone: "muted",
      live: false,
      showIdleFor: false,
      assumed: !certain,
    };
  }
  if (clockodoBreak)
    return {
      headlineKey: "livestatus.break",
      tone: "warn",
      live: false,
      showIdleFor: false,
    };
  if (genesysRoutingStatus === "INTERACTING")
    return {
      headlineKey: "livestatus.inCall",
      tone: "info",
      live: true,
      showIdleFor: false,
    };
  if (genesysWrapUp)
    return {
      headlineKey: "livestatus.wrapUp",
      tone: "info",
      live: true,
      showIdleFor: false,
    };

  // Beyond here the verdict comes from the workstation, which we can't read if
  // it's offline.
  if (!online)
    return {
      headlineKey: "livestatus.offline",
      tone: "muted",
      live: false,
      showIdleFor: false,
    };

  // No workstation idle signal at all → fall back to the raw active flag.
  if (deviceIdle == null) {
    if (clockodoWorking)
      return {
        headlineKey: "livestatus.clockedInWorking",
        tone: "ok",
        live: true,
        showIdleFor: false,
      };
    return active
      ? {
          headlineKey: "livestatus.active",
          tone: "ok",
          live: true,
          showIdleFor: false,
        }
      : {
          headlineKey: "livestatus.inactive",
          tone: "warn",
          live: false,
          showIdleFor: true,
        };
  }

  if (deviceIdle) {
    return clockodoWorking
      ? {
          headlineKey: "livestatus.clockedInInactive",
          tone: "warn",
          live: false,
          showIdleFor: true,
        }
      : {
          headlineKey: "livestatus.inactive",
          tone: "warn",
          live: false,
          showIdleFor: true,
        };
  }

  return clockodoWorking
    ? {
        headlineKey: "livestatus.clockedInWorking",
        tone: "ok",
        live: true,
        showIdleFor: false,
      }
    : {
        headlineKey: "livestatus.active",
        tone: "ok",
        live: true,
        showIdleFor: false,
      };
}
