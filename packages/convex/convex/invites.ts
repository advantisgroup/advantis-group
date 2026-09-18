// Moved to `people/invites.ts`. Re-exported so the old `api.invites.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  createInviteRecord,
  create,
  refreshInviteToken,
  resend,
  markRevoked,
  revoke,
  list,
  config,
  getByToken,
} from "./people/invites";
