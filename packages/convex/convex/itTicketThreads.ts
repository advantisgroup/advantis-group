// Moved to `itTickets/threads.ts`. Re-exported so the old `api.itTicketThreads.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  getForTicket,
  listStarted,
  start,
  listMessages,
  sendMessage,
  lock,
  unlock,
  toggleReaction,
} from "./itTickets/threads";
