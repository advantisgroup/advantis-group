// Moved to `wiki/chats.ts`. Re-exported so the old `api.wikiChats.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { list, get, create, update, remove } from "./wiki/chats";
