import { type Doc } from "../../_generated/dataModel";
import { type Caller } from "../../lib/caller";

/**
 * Rollout switch: until the Convex env var `MAIL_MODE` is `live`, only admins
 * see the mail panel, and only their inboxes are polled.
 */
export function mailLive(): boolean {
  return process.env.MAIL_MODE === "live";
}

export function canUseMail(caller: Caller): boolean {
  return caller.isAdmin || mailLive();
}

/** Same rule for a stored user, where there's no caller (the poller). */
export function userCanUseMail(user: Doc<"users">): boolean {
  return user.status === "active" && (user.role === "admin" || mailLive());
}
