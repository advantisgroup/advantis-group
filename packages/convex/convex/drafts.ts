// Moved to `drafts/drafts.ts`. Re-exported so the old `api.drafts.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  get,
  create,
  listMine,
  save,
  discard,
  listVersions,
  listOthers,
  park,
  resume,
  restoreVersion,
  nameVersion,
  pruneOld,
} from "./drafts/drafts";
