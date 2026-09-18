// Moved to `drafts/shares.ts`. Re-exported so the old `api.draftShares.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  share,
  unshare,
  listSharedWithMe,
  get,
  listComments,
  addComment,
  deleteComment,
  continueFrom,
} from "./drafts/shares";
