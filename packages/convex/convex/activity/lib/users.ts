// ActivityTrack's `users` had a single `name` field; the intranet splits it
// into first/last. Re-exported from the shared helper (see convex/lib/users)
// rather than reimplemented — kept as a named re-export here so existing
// `activity/lib/users` imports keep working unchanged.
export { displayName } from "../../lib/users";
