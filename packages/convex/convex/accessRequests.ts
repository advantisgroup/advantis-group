// Moved to `people/accessRequests.ts`. Re-exported so the old `api.accessRequests.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  create,
  myStatus,
  assertUnauthorized,
  selfDeleteUnauthorized,
  list,
  approve,
  deny,
} from "./people/accessRequests";
