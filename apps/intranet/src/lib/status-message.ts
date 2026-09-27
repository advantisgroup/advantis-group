export interface StatusMessageValue {
  text: string;
  until: number | null;
}

/** The status to show right now, or null once it has run out. */
export function activeStatusMessage(
  status: StatusMessageValue | null | undefined,
  now = Date.now(),
): StatusMessageValue | null {
  if (!status?.text) return null;
  if (status.until !== null && status.until <= now) return null;
  return status;
}

export type StatusDuration = "never" | "today" | "tomorrow" | "week" | "date";

/** End of a local calendar day (23:59:59.999), `days` days from today. */
function endOfDay(days: number, from = new Date()): number {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** When a status set now with this duration stops showing. `date` is a
 *  `YYYY-MM-DD` local date the status lasts through. */
export function statusUntil(duration: StatusDuration, date?: string): number | undefined {
  switch (duration) {
    case "never":
      return undefined;
    case "today":
      return endOfDay(0);
    case "tomorrow":
      return endOfDay(1);
    case "week": {
      // Through Sunday; on a Sunday that's today.
      const day = new Date().getDay();
      return endOfDay(day === 0 ? 0 : 7 - day);
    }
    case "date": {
      if (!date) return undefined;
      const [y, m, d] = date.split("-").map(Number);
      return endOfDay(0, new Date(y, m - 1, d));
    }
  }
}
