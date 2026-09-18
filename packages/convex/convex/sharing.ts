// Moved to `blog/sharing.ts`. Re-exported so the old `api.sharing.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { resolveShare, myReferralState, setReferralSharing } from "./blog/sharing";
