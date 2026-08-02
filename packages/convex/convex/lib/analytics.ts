import { internal } from "../_generated/api";
import { type MutationCtx } from "../_generated/server";

export interface AnalyticsEvent {
  event: string;
  /** PostHog `distinct_id`. Pass the Clerk user id wherever one exists so
   * server events land on the same person as the browser's (see
   * `PostHogIdentify.tsx`, which identifies by `clerkUserId`). */
  distinctId?: string;
  properties?: Record<string, string | number | boolean | null>;
}

/**
 * Queue a PostHog event from inside a mutation. Mutations can't do network
 * I/O, so this schedules `analytics.capture` (an action) for immediately
 * after the transaction commits — which also means an analytics outage can
 * never roll back real work.
 *
 * Only send properties that are safe in an analytics warehouse: ids, scopes,
 * outcomes, durations. No passwords, no reset tokens, no full email
 * addresses.
 */
export async function trackEvent(ctx: MutationCtx, event: AnalyticsEvent): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.analytics.capture, {
    event: event.event,
    distinctId: event.distinctId,
    properties: event.properties,
  });
}
