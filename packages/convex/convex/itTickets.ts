// Moved to `itTickets/tickets.ts`. Re-exported so the old `api.itTickets.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  listCategories,
  ensureDefaultCategories,
  createCategory,
  removeCategory,
  list,
  listMineOpen,
  similar,
  listAssignedOpen,
  firstResponse,
  listStatusHistory,
  create,
  update,
  setStatus,
  setAssignee,
  setRelatedLinks,
  remove,
} from "./itTickets/tickets";
