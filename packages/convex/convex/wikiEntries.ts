// Moved to `wiki/entries.ts`. Re-exported so the old `api.wikiEntries.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  apiSearchForAssistant,
  list,
  get,
  create,
  update,
  setOwner,
  remove,
  togglePin,
} from "./wiki/entries";
