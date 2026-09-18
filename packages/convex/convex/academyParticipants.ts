// Moved to `academy/participants.ts`. Re-exported so the old `api.academyParticipants.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  create,
  listAll,
  findByCode,
  remove,
  linkToAccount,
  unlinkAccount,
  reconcileAutoLinks,
} from "./academy/participants";
